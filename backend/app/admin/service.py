"""Admin doc-review and listing management — service layer.

Action transitions (per dev plan §7.4):
  approve  -> ListingStatus.DOC_VERIFIED, doc badge issued (24-month expiry),
              `badge.issued` notification dispatched.
  query    -> ListingStatus.DRAFT, review_note set, `listing.queried` sent.
  reject   -> ListingStatus.SUSPENDED, review_note + suspension_reason set,
              `listing.rejected` sent.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.admin import audit
from app.admin.schemas import (
    AdminBadgeView,
    AdminListingDetail,
    AdminListingEditPayload,
    AdminListingFilters,
    AdminListingInspectionSummary,
    AdminListingRow,
    AdminListingsResponse,
    CountBucket,
    DocReviewQueue,
    DocReviewQueueRow,
    NinReviewQueue,
    NinReviewQueueRow,
    SeekerInsights,
)
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.listings.service import _validate_ready_for_submission, _validate_type_data
from app.models._enums import BadgeStatus, BadgeType, ListingCategory, ListingStatus, UserRole
from app.models.badge import Badge
from app.models.inspection import InspectionReport
from app.models.listing import Listing, ListingDocument, ListingPhoto
from app.models.user import User
from app.notifications.dispatch import dispatch_notification
from app.verification.badges import issue_doc_badge, listing_has_active_badge

_PUBLIC_STATUSES = frozenset(
    {
        ListingStatus.LIVE_UNVERIFIED,
        ListingStatus.DOC_VERIFIED,
        ListingStatus.FULLY_VERIFIED,
        ListingStatus.LET_AGREED,
        ListingStatus.SALE_AGREED,
    }
)


def _full_name(user: User) -> str:
    parts = [p for p in (user.first_name, user.last_name) if p]
    if parts:
        return " ".join(parts)
    return user.business_name or user.email


def _is_publicly_visible(status: ListingStatus) -> bool:
    return status in _PUBLIC_STATUSES


def _public_status_from_badges(
    *, has_document_badge: bool, has_physical_badge: bool
) -> ListingStatus:
    if has_physical_badge:
        return ListingStatus.FULLY_VERIFIED
    if has_document_badge:
        return ListingStatus.DOC_VERIFIED
    return ListingStatus.LIVE_UNVERIFIED


def _badge_view(badge: Badge | None) -> AdminBadgeView | None:
    if badge is None:
        return None
    return AdminBadgeView(
        id=str(badge.id),
        type=badge.type,
        issued_at=badge.created_at,
        expires_at=badge.expires_at,
        inspector_id=str(badge.inspector_id) if badge.inspector_id else None,
    )


# ---------------------------------------------------------------------------
# Doc review queue
# ---------------------------------------------------------------------------


async def doc_review_queue(*, db: AsyncSession) -> DocReviewQueue:
    stmt = (
        select(Listing)
        .where(Listing.status == ListingStatus.UNDER_DOC_REVIEW)
        .options(selectinload(Listing.documents), selectinload(Listing.owner))
        .order_by(Listing.updated_at.asc())   # oldest first per dev plan §7.4
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    items = [
        DocReviewQueueRow(
            listing_id=str(r.id),
            title=r.title or "Untitled",
            category=r.category,
            landlord_name=_full_name(r.owner),
            landlord_id=str(r.owner_id),
            submitted_at=r.updated_at,
            document_count=len(r.documents),
        )
        for r in rows
    ]
    return DocReviewQueue(items=items, total=len(items))


async def _load(db: AsyncSession, listing_id: uuid.UUID) -> Listing:
    stmt = (
        select(Listing)
        .where(Listing.id == listing_id)
        .options(
            selectinload(Listing.photos),
            selectinload(Listing.documents),
            selectinload(Listing.owner),
        )
    )
    listing = (await db.execute(stmt)).scalar_one_or_none()
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    return listing


async def _active_badges_for_listing(
    *, listing_id: uuid.UUID, db: AsyncSession
) -> tuple[Badge | None, Badge | None]:
    rows = (
        await db.execute(
            select(Badge)
            .where(
                Badge.listing_id == listing_id,
                Badge.status == BadgeStatus.ACTIVE,
            )
            .order_by(Badge.created_at.desc())
        )
    ).scalars().all()
    document = next((badge for badge in rows if badge.type == BadgeType.DOCUMENT), None)
    physical = next((badge for badge in rows if badge.type == BadgeType.PHYSICAL), None)
    return document, physical


async def _listing_media(
    *, listing_id: uuid.UUID, db: AsyncSession
) -> tuple[list[ListingPhoto], list[ListingDocument]]:
    photos = (
        await db.execute(
            select(ListingPhoto)
            .where(ListingPhoto.listing_id == listing_id)
            .order_by(ListingPhoto.display_order.asc(), ListingPhoto.created_at.asc())
        )
    ).scalars().all()
    documents = (
        await db.execute(
            select(ListingDocument)
            .where(ListingDocument.listing_id == listing_id)
            .order_by(ListingDocument.created_at.asc())
        )
    ).scalars().all()
    return photos, documents


async def _latest_inspection_summary(
    *, listing_id: uuid.UUID, db: AsyncSession
) -> AdminListingInspectionSummary | None:
    row = (
        await db.execute(
            select(InspectionReport, User)
            .join(User, User.id == InspectionReport.inspector_id)
            .where(InspectionReport.listing_id == listing_id)
            .order_by(
                InspectionReport.submitted_at.desc().nullslast(),
                InspectionReport.created_at.desc(),
            )
            .limit(1)
        )
    ).one_or_none()
    if row is None:
        return None
    report, inspector = row
    return AdminListingInspectionSummary(
        report_id=str(report.id),
        status=report.status,
        inspector_name=_full_name(inspector),
        submitted_at=report.submitted_at,
        reviewed_at=report.reviewed_at,
    )


async def get_listing_detail(
    *, listing_id: uuid.UUID, db: AsyncSession
) -> AdminListingDetail:
    listing = await _load(db, listing_id)
    owner = await db.get(User, listing.owner_id)
    if owner is None:
        raise NotFoundError("Listing owner not found.", code="listing_owner_not_found")
    photos, documents = await _listing_media(listing_id=listing.id, db=db)
    document_badge, physical_badge = await _active_badges_for_listing(
        listing_id=listing.id, db=db
    )
    latest_inspection = await _latest_inspection_summary(
        listing_id=listing.id, db=db
    )
    return AdminListingDetail(
        id=str(listing.id),
        title=listing.title,
        subtitle=listing.subtitle,
        description=listing.description,
        category=listing.category,
        status=listing.status,
        landlord_id=str(listing.owner_id),
        landlord_name=_full_name(owner),
        landlord_email=owner.email,
        created_at=listing.created_at,
        updated_at=listing.updated_at,
        suspended_at=listing.suspended_at,
        deleted_at=listing.deleted_at,
        review_note=listing.review_note,
        suspension_reason=listing.suspension_reason,
        address_line=listing.address_line,
        district=listing.district,
        gps_lat=listing.gps_lat,
        gps_lng=listing.gps_lng,
        price=float(listing.price) if listing.price is not None else None,
        amenities=listing.amenities or {},
        type_data=listing.type_data or {},
        photos=[
            {
                "id": str(photo.id),
                "url": photo.url,
                "room_label": photo.room_label,
                "is_cover": photo.is_cover,
                "display_order": photo.display_order,
            }
            for photo in photos
        ],
        documents=[
            {
                "id": str(doc.id),
                "filename": doc.filename,
                "doc_type": doc.doc_type,
                "content_type": doc.content_type,
                "size_bytes": doc.size_bytes,
            }
            for doc in documents
        ],
        document_badge=_badge_view(document_badge),
        physical_badge=_badge_view(physical_badge),
        latest_inspection=latest_inspection,
        is_publicly_visible=_is_publicly_visible(listing.status),
    )


async def approve_doc(
    *, admin: User, listing_id: uuid.UUID, note: str | None, db: AsyncSession
) -> Listing:
    listing = await _load(db, listing_id)
    if listing.status != ListingStatus.UNDER_DOC_REVIEW:
        raise ConflictError(
            "Listing is not awaiting document review.", code="not_under_review"
        )
    listing.status = ListingStatus.DOC_VERIFIED
    listing.review_note = note
    badge = await issue_doc_badge(listing_id=listing.id, admin_id=admin.id, db=db)
    await audit.record(
        admin_id=admin.id,
        entity_type="listing",
        entity_id=listing.id,
        action="doc.approve",
        payload={"badge_id": str(badge.id)},
        db=db,
    )
    await dispatch_notification(
        user_id=listing.owner_id,
        event_type="badge.issued",
        payload={
            "listing_id": str(listing.id),
            "listing_title": listing.title or "Your listing",
            "badge_type": "document",
        },
        db=db,
    )
    return listing


async def query_doc(
    *, admin: User, listing_id: uuid.UUID, note: str | None, db: AsyncSession
) -> Listing:
    if not note:
        raise ValidationError(
            "A note is required when querying a submission.",
            code="query_note_required",
        )
    listing = await _load(db, listing_id)
    if listing.status != ListingStatus.UNDER_DOC_REVIEW:
        raise ConflictError(
            "Listing is not awaiting document review.", code="not_under_review"
        )
    listing.status = ListingStatus.DRAFT
    listing.review_note = note
    await audit.record(
        admin_id=admin.id,
        entity_type="listing",
        entity_id=listing.id,
        action="doc.query",
        payload={"note": note},
        db=db,
    )
    await dispatch_notification(
        user_id=listing.owner_id,
        event_type="listing.queried",
        payload={
            "listing_id": str(listing.id),
            "listing_title": listing.title or "Your listing",
            "note": note,
        },
        db=db,
    )
    return listing


async def reject_doc(
    *, admin: User, listing_id: uuid.UUID, note: str | None, db: AsyncSession
) -> Listing:
    if not note:
        raise ValidationError(
            "A note is required when rejecting a submission.",
            code="reject_note_required",
        )
    listing = await _load(db, listing_id)
    if listing.status != ListingStatus.UNDER_DOC_REVIEW:
        raise ConflictError(
            "Listing is not awaiting document review.", code="not_under_review"
        )
    listing.status = ListingStatus.SUSPENDED
    listing.suspended_at = datetime.now(timezone.utc)
    listing.suspension_reason = "doc_rejected"
    listing.review_note = note
    await audit.record(
        admin_id=admin.id,
        entity_type="listing",
        entity_id=listing.id,
        action="doc.reject",
        payload={"note": note},
        db=db,
    )
    await dispatch_notification(
        user_id=listing.owner_id,
        event_type="listing.rejected",
        payload={
            "listing_id": str(listing.id),
            "listing_title": listing.title or "Your listing",
            "note": note,
        },
        db=db,
    )
    return listing


# ---------------------------------------------------------------------------
# Listing management (admin)
# ---------------------------------------------------------------------------


async def list_listings(
    *, filters: AdminListingFilters, db: AsyncSession
) -> AdminListingsResponse:
    stmt = (
        select(Listing)
        .options(selectinload(Listing.owner))
        # Drafts are the landlord's private work-in-progress — never submitted
        # for review — so they must not appear in admin oversight at all.
        .where(Listing.status != ListingStatus.DRAFT)
        .order_by(Listing.created_at.desc())
    )
    if filters.status:
        stmt = stmt.where(Listing.status.in_(filters.status))
    if filters.category:
        stmt = stmt.where(Listing.category.in_(filters.category))
    if filters.q:
        like = f"%{filters.q.strip()}%"
        stmt = stmt.where(Listing.title.ilike(like) | Listing.district.ilike(like))

    total = int(
        (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    )
    offset = (filters.page - 1) * filters.page_size
    rows = (
        (await db.execute(stmt.offset(offset).limit(filters.page_size)))
        .scalars()
        .unique()
        .all()
    )
    items = [
        AdminListingRow(
            id=str(r.id),
            title=r.title,
            category=r.category,
            status=r.status,
            landlord_id=str(r.owner_id),
            landlord_name=_full_name(r.owner),
            created_at=r.created_at,
            suspended_at=r.suspended_at,
            deleted_at=r.deleted_at,
        )
        for r in rows
    ]
    return AdminListingsResponse(
        items=items, total=total, page=filters.page, page_size=filters.page_size
    )


async def award_document_badge(
    *, admin: User, listing_id: uuid.UUID, db: AsyncSession
) -> Listing:
    listing = await _load(db, listing_id)
    _, documents = await _listing_media(listing_id=listing.id, db=db)
    if listing.deleted_at is not None or listing.status == ListingStatus.DELISTED:
        raise ConflictError(
            "Listing has been delisted and cannot receive badges.",
            code="listing_delisted",
        )
    if await listing_has_active_badge(
        listing_id=listing.id, badge_type=BadgeType.DOCUMENT, db=db
    ):
        raise ConflictError(
            "Listing already has an active document badge.",
            code="document_badge_exists",
        )
    if listing.category != ListingCategory.OFF_CAMPUS and not documents:
        raise ValidationError(
            "Upload at least one title document before awarding a document badge.",
            code="document_badge_docs_required",
        )

    has_physical_badge = await listing_has_active_badge(
        listing_id=listing.id, badge_type=BadgeType.PHYSICAL, db=db
    )
    badge = await issue_doc_badge(listing_id=listing.id, admin_id=admin.id, db=db)
    listing.status = _public_status_from_badges(
        has_document_badge=True,
        has_physical_badge=has_physical_badge,
    )
    listing.suspended_at = None
    listing.suspension_reason = None
    await audit.record(
        admin_id=admin.id,
        entity_type="listing",
        entity_id=listing.id,
        action="listing.document_badge_award",
        payload={"badge_id": str(badge.id)},
        db=db,
    )
    await dispatch_notification(
        user_id=listing.owner_id,
        event_type="badge.issued",
        payload={
            "listing_id": str(listing.id),
            "listing_title": listing.title or "Your listing",
            "badge_type": "document",
        },
        db=db,
    )
    await db.flush()
    return listing


async def publish_listing(
    *, admin: User, listing_id: uuid.UUID, db: AsyncSession
) -> Listing:
    listing = await _load(db, listing_id)
    photos, documents = await _listing_media(listing_id=listing.id, db=db)
    if listing.deleted_at is not None or listing.status == ListingStatus.DELISTED:
        raise ConflictError(
            "Listing has been delisted and cannot go live.",
            code="listing_delisted",
        )

    validation_view = SimpleNamespace(
        title=listing.title,
        description=listing.description,
        address_line=listing.address_line,
        gps_lat=listing.gps_lat,
        gps_lng=listing.gps_lng,
        category=listing.category,
        price=listing.price,
        type_data=listing.type_data or {},
        photos=photos,
        documents=documents,
    )
    missing = _validate_ready_for_submission(validation_view)
    if missing:
        raise ValidationError(
            f"Listing is not ready to go live: {', '.join(missing)}",
            code="listing_not_ready_for_publish",
        )
    _validate_type_data(validation_view)

    has_document_badge = await listing_has_active_badge(
        listing_id=listing.id, badge_type=BadgeType.DOCUMENT, db=db
    )
    has_physical_badge = await listing_has_active_badge(
        listing_id=listing.id, badge_type=BadgeType.PHYSICAL, db=db
    )
    listing.status = _public_status_from_badges(
        has_document_badge=has_document_badge,
        has_physical_badge=has_physical_badge,
    )
    listing.suspended_at = None
    listing.suspension_reason = None
    await audit.record(
        admin_id=admin.id,
        entity_type="listing",
        entity_id=listing.id,
        action="listing.publish",
        payload={"status": listing.status.value},
        db=db,
    )
    await db.flush()
    return listing


async def edit_listing(
    *,
    admin: User,
    listing_id: uuid.UUID,
    payload: AdminListingEditPayload,
    db: AsyncSession,
) -> Listing:
    listing = await _load(db, listing_id)
    before: dict = {
        "title": listing.title,
        "subtitle": listing.subtitle,
        "description": listing.description,
        "district": listing.district,
        "price": float(listing.price) if listing.price is not None else None,
    }
    after = payload.model_dump(exclude_unset=True)
    # type_data is JSONB — merge so an admin override (e.g. driving times) keeps
    # the landlord-entered keys intact instead of replacing the whole object.
    type_data_patch = after.pop("type_data", None)
    if type_data_patch is not None:
        before["type_data"] = dict(listing.type_data or {})
        merged = dict(listing.type_data or {})
        merged.update(type_data_patch)
        listing.type_data = merged
        after["type_data"] = type_data_patch
    for k, v in after.items():
        if k == "type_data":
            continue
        setattr(listing, k, v)
    await audit.record(
        admin_id=admin.id,
        entity_type="listing",
        entity_id=listing.id,
        action="listing.edit",
        payload={"before": before, "after": after},
        db=db,
    )
    await db.flush()
    return listing


async def suspend_listing(
    *, admin: User, listing_id: uuid.UUID, reason: str, db: AsyncSession
) -> Listing:
    listing = await _load(db, listing_id)
    listing.status = ListingStatus.SUSPENDED
    listing.suspended_at = datetime.now(timezone.utc)
    listing.suspension_reason = reason
    await audit.record(
        admin_id=admin.id,
        entity_type="listing",
        entity_id=listing.id,
        action="listing.suspend",
        payload={"reason": reason},
        db=db,
    )
    return listing


async def restore_listing(
    *, admin: User, listing_id: uuid.UUID, db: AsyncSession
) -> Listing:
    listing = await _load(db, listing_id)
    if listing.deleted_at is not None:
        raise ConflictError(
            "Listing has been soft-deleted; restore is not available.",
            code="deleted_listing",
        )
    if listing.status != ListingStatus.SUSPENDED:
        raise ConflictError("Listing is not suspended.", code="not_suspended")
    # Restore to LIVE_UNVERIFIED — admin re-runs the doc review if a doc badge is wanted.
    listing.status = ListingStatus.LIVE_UNVERIFIED
    listing.suspended_at = None
    listing.suspension_reason = None
    await audit.record(
        admin_id=admin.id,
        entity_type="listing",
        entity_id=listing.id,
        action="listing.restore",
        payload={},
        db=db,
    )
    return listing


async def soft_delete_listing(
    *, admin: User, listing_id: uuid.UUID, db: AsyncSession
) -> Listing:
    listing = await _load(db, listing_id)
    listing.status = ListingStatus.DELISTED
    listing.deleted_at = datetime.now(timezone.utc)
    await audit.record(
        admin_id=admin.id,
        entity_type="listing",
        entity_id=listing.id,
        action="listing.soft_delete",
        payload={},
        db=db,
    )
    return listing


# ---------------------------------------------------------------------------
# Manual NIN review (MVP) — landlord uploaded ID image, admin verifies
# ---------------------------------------------------------------------------


async def nin_review_queue(*, db: AsyncSession) -> NinReviewQueue:
    stmt = (
        select(User)
        .where(
            User.nin_document_url.is_not(None),
            User.nin_verified.is_(False),
        )
        .order_by(User.nin_document_uploaded_at.asc())
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    items = [
        NinReviewQueueRow(
            user_id=str(r.id),
            full_name=_full_name(r),
            email=r.email,
            role=r.role.value,
            account_type=r.account_type.value if r.account_type else None,
            nin_document_url=r.nin_document_url or "",
            uploaded_at=r.nin_document_uploaded_at or r.updated_at,
        )
        for r in rows
    ]
    return NinReviewQueue(items=items, total=len(items))


async def _load_nin_subject(db: AsyncSession, user_id: uuid.UUID) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise NotFoundError("User not found.", code="user_not_found")
    if target.nin_document_url is None:
        raise ConflictError(
            "No NIN document is awaiting review for this user.",
            code="nin_not_pending",
        )
    if target.nin_verified:
        raise ConflictError(
            "NIN is already verified for this user.",
            code="nin_already_verified",
        )
    return target


async def approve_nin(
    *, admin: User, user_id: uuid.UUID, db: AsyncSession
) -> User:
    target = await _load_nin_subject(db, user_id)
    target.nin_verified = True
    target.nin_review_note = None
    await audit.record(
        admin_id=admin.id,
        entity_type="user",
        entity_id=target.id,
        action="user.nin_approve",
        payload={"nin_document_url": target.nin_document_url},
        db=db,
    )
    await dispatch_notification(
        user_id=target.id,
        event_type="landlord.nin_verified",
        payload={"first_name": target.first_name or ""},
        db=db,
    )
    return target


async def reject_nin(
    *, admin: User, user_id: uuid.UUID, note: str, db: AsyncSession
) -> User:
    target = await _load_nin_subject(db, user_id)
    rejected_url = target.nin_document_url
    target.nin_document_url = None
    target.nin_document_uploaded_at = None
    target.nin_review_note = note
    await audit.record(
        admin_id=admin.id,
        entity_type="user",
        entity_id=target.id,
        action="user.nin_reject",
        payload={"note": note, "rejected_url": rejected_url},
        db=db,
    )
    await dispatch_notification(
        user_id=target.id,
        event_type="landlord.nin_rejected",
        payload={"first_name": target.first_name or "", "note": note},
        db=db,
    )
    return target


# ---------------------------------------------------------------------------
# Document presigned-GET for in-portal viewer
# ---------------------------------------------------------------------------


async def document_view_url(
    *, listing_id: uuid.UUID, document_id: uuid.UUID, db: AsyncSession
) -> tuple[str, ListingDocument]:
    from app.integrations.s3_storage import DEFAULT_GET_EXPIRY, get_storage

    stmt = select(ListingDocument).where(
        ListingDocument.id == document_id,
        ListingDocument.listing_id == listing_id,
    )
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if doc is None:
        raise NotFoundError("Document not found.", code="document_not_found")
    storage = get_storage()
    return storage.presigned_get(key=doc.s3_key, expiry_seconds=DEFAULT_GET_EXPIRY), doc


# ---------------------------------------------------------------------------
# Seeker insights — aggregate the optional onboarding profile for analytics
# ---------------------------------------------------------------------------

# Canonical age-band ordering so the chart reads youngest → oldest regardless
# of how the database returns the grouped rows.
_AGE_BAND_ORDER = {b: i for i, b in enumerate(["18-24", "25-34", "35-44", "45-54", "55+"])}


async def seeker_insights(*, db: AsyncSession) -> SeekerInsights:
    """Aggregate self-reported seeker demographics. Read-only; seekers only."""
    seeker = UserRole.SEEKER

    total = await db.scalar(
        select(func.count()).select_from(User).where(User.role == seeker)
    )

    optional_fields = (
        User.age_band,
        User.occupation,
        User.budget_min,
        User.budget_max,
        User.preferred_area,
    )
    profile_provided = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role == seeker, or_(*[f.isnot(None) for f in optional_fields]))
    )

    async def _buckets(column, *, limit: int | None = None) -> list[CountBucket]:  # type: ignore[no-untyped-def]
        stmt = (
            select(column, func.count())
            .where(User.role == seeker, column.isnot(None))
            .group_by(column)
            .order_by(func.count().desc())
        )
        if limit is not None:
            stmt = stmt.limit(limit)
        rows = (await db.execute(stmt)).all()
        return [CountBucket(label=str(label), count=count) for label, count in rows]

    age_bands = await _buckets(User.age_band)
    age_bands.sort(key=lambda b: _AGE_BAND_ORDER.get(b.label, 99))
    occupations = await _buckets(User.occupation)
    preferred_areas = await _buckets(User.preferred_area, limit=10)

    budget_responses = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(
            User.role == seeker,
            or_(User.budget_min.isnot(None), User.budget_max.isnot(None)),
        )
    )
    avg_min = await db.scalar(
        select(func.avg(User.budget_min)).where(
            User.role == seeker, User.budget_min.isnot(None)
        )
    )
    avg_max = await db.scalar(
        select(func.avg(User.budget_max)).where(
            User.role == seeker, User.budget_max.isnot(None)
        )
    )

    return SeekerInsights(
        total_seekers=total or 0,
        profile_provided=profile_provided or 0,
        age_bands=age_bands,
        occupations=occupations,
        preferred_areas=preferred_areas,
        budget_responses=budget_responses or 0,
        avg_budget_min=int(avg_min) if avg_min is not None else None,
        avg_budget_max=int(avg_max) if avg_max is not None else None,
    )
