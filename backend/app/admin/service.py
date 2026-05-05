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
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.admin import audit
from app.admin.schemas import (
    AdminListingEditPayload,
    AdminListingFilters,
    AdminListingRow,
    AdminListingsResponse,
    DocReviewQueue,
    DocReviewQueueRow,
    NinReviewQueue,
    NinReviewQueueRow,
)
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models._enums import ListingStatus, UserRole
from app.models.listing import Listing, ListingDocument
from app.models.user import User
from app.notifications.dispatch import dispatch_notification
from app.verification.badges import issue_doc_badge


def _full_name(user: User) -> str:
    parts = [p for p in (user.first_name, user.last_name) if p]
    if parts:
        return " ".join(parts)
    return user.business_name or user.email


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
        .options(selectinload(Listing.documents), selectinload(Listing.owner))
    )
    listing = (await db.execute(stmt)).scalar_one_or_none()
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    return listing


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
    for k, v in after.items():
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
