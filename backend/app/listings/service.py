"""Listing business logic — create, draft auto-save, submit for review.

Service functions never commit — the route handler commits once per request.
Submission validation lives here (not in the schema layer) so draft partial
updates remain loose.
"""

from __future__ import annotations

import uuid

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.listings.schemas import (
    AMENITY_GROUPS,
    ListingDraftPayload,
    ListingView,
    OffCampusTypeData,
    RentTypeData,
    SalesTypeData,
    ShortLetPricingPayload,
)
from app.models._enums import AccountType, ListingCategory, ListingStatus, UserRole
from app.models.listing import Listing, ListingDocument, ListingPhoto
from app.models.student_accommodation import Room, UnitType
from app.models.user import User


# ----------------------------------------------------------------------------
# Core CRUD
# ----------------------------------------------------------------------------


def _view(listing: Listing) -> ListingView:
    return ListingView(
        id=str(listing.id),
        owner_id=str(listing.owner_id),
        category=listing.category,
        status=listing.status,
        title=listing.title,
        subtitle=listing.subtitle,
        description=listing.description,
        address_line=listing.address_line,
        district=listing.district,
        gps_lat=listing.gps_lat,
        gps_lng=listing.gps_lng,
        amenities=listing.amenities or {},
        price=float(listing.price) if listing.price is not None else None,
        type_data=listing.type_data or {},
        photos=[
            {
                "id": str(p.id),
                "url": p.url,
                "room_label": p.room_label,
                "is_cover": p.is_cover,
                "display_order": p.display_order,
            }
            for p in sorted(listing.photos, key=lambda p: p.display_order)
            if not p.is_inspector_walkthrough
        ],
        documents=[
            {
                "id": str(d.id),
                "filename": d.filename,
                "doc_type": d.doc_type,
                "content_type": d.content_type,
                "size_bytes": d.size_bytes,
            }
            for d in listing.documents
        ],
        unit_types=[],   # populated by the student-inventory service variant
    )


def _ensure_owner(user: User, listing: Listing) -> None:
    if str(listing.owner_id) != str(user.id):
        raise ForbiddenError("You do not own this listing.", code="listing_not_yours")


def _ensure_can_list(user: User) -> None:
    if user.role not in (UserRole.LANDLORD, UserRole.AGENT):
        raise ForbiddenError("Only landlords and agents can create listings.",
                             code="role_cannot_list")
    # Landlord must have completed account-type selection — NIN/CAC verification
    # status gates the doc-badge, not listing creation (per dev plan §7.2).
    if user.role == UserRole.LANDLORD and user.account_type is None:
        raise ForbiddenError(
            "Complete onboarding before creating a listing.",
            code="onboarding_incomplete",
        )


async def _load(db: AsyncSession, listing_id: uuid.UUID) -> Listing:
    stmt = (
        select(Listing)
        .where(Listing.id == listing_id)
        .options(selectinload(Listing.photos), selectinload(Listing.documents))
    )
    listing = (await db.execute(stmt)).scalar_one_or_none()
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    return listing


async def create_listing(
    *, user: User, category: ListingCategory, db: AsyncSession
) -> ListingView:
    _ensure_can_list(user)
    listing = Listing(
        owner_id=user.id,
        category=category,
        status=ListingStatus.DRAFT,
        amenities={},
        type_data={},
    )
    db.add(listing)
    await db.flush()
    return _view(listing)


async def get_listing_for_owner(
    *, user: User, listing_id: uuid.UUID, db: AsyncSession
) -> ListingView:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    return _view(listing)


async def list_my_listings(
    *, user: User, db: AsyncSession
) -> list[ListingView]:
    stmt = (
        select(Listing)
        .where(Listing.owner_id == user.id)
        .options(selectinload(Listing.photos), selectinload(Listing.documents))
        .order_by(Listing.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_view(r) for r in rows]


async def update_draft(
    *,
    user: User,
    listing_id: uuid.UUID,
    payload: ListingDraftPayload,
    db: AsyncSession,
) -> ListingView:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    if listing.status != ListingStatus.DRAFT:
        raise ConflictError(
            "Listing is no longer a draft — use the edit flow instead.",
            code="not_draft",
        )

    data = payload.model_dump(exclude_unset=True)
    if "amenities" in data and data["amenities"] is not None:
        # Merge rather than replace so a per-group save doesn't wipe others.
        merged = dict(listing.amenities or {})
        for group, items in data["amenities"].items():
            merged[group] = items
        listing.amenities = merged
        del data["amenities"]
    if "type_data" in data and data["type_data"] is not None:
        merged = dict(listing.type_data or {})
        merged.update(data["type_data"])
        listing.type_data = merged
        del data["type_data"]
    for k, v in data.items():
        setattr(listing, k, v)

    await db.flush()
    return _view(listing)


# ----------------------------------------------------------------------------
# Submission
# ----------------------------------------------------------------------------


_REQUIRED_CORE_FIELDS = (
    "title",
    "description",
    "address_line",
    "gps_lat",
    "gps_lng",
)

_MIN_DESCRIPTION_CHARS = 200


def _validate_type_data(listing: Listing) -> None:
    try:
        if listing.category == ListingCategory.RENT:
            RentTypeData(**listing.type_data)
        elif listing.category == ListingCategory.SALES:
            SalesTypeData(**listing.type_data)
        elif listing.category == ListingCategory.OFF_CAMPUS:
            OffCampusTypeData(**listing.type_data)
        elif listing.category == ListingCategory.SHORT_LET:
            ShortLetPricingPayload(**listing.type_data)
    except PydanticValidationError as exc:
        raise ValidationError(
            "Category details are incomplete.",
            code="type_data_invalid",
        ) from exc


def _validate_ready_for_submission(listing: Listing) -> list[str]:
    """Return a list of missing-field codes. Empty list => ready to submit."""
    missing: list[str] = []
    for field in _REQUIRED_CORE_FIELDS:
        if getattr(listing, field) in (None, ""):
            missing.append(field)
    if listing.description and len(listing.description) < _MIN_DESCRIPTION_CHARS:
        missing.append("description_too_short")

    # Price required for rent, sales, short-let. For off-campus the price
    # lives on individual unit types (captured in student_accommodation).
    if listing.category in (
        ListingCategory.RENT,
        ListingCategory.SALES,
        ListingCategory.SHORT_LET,
    ) and listing.price in (None, 0):
        missing.append("price")

    if not listing.photos:
        missing.append("photos")

    if listing.category != ListingCategory.OFF_CAMPUS and not listing.documents:
        # Off-campus is exempt from the doc-badge gate per product brief §3.1.
        missing.append("documents")

    return missing


async def submit_listing(
    *, user: User, listing_id: uuid.UUID, db: AsyncSession
) -> ListingView:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    if listing.status != ListingStatus.DRAFT:
        raise ConflictError("Listing has already been submitted.", code="already_submitted")

    missing = _validate_ready_for_submission(listing)
    if missing:
        raise ValidationError(
            f"Missing required fields: {', '.join(missing)}",
            code="listing_not_ready",
        )

    _validate_type_data(listing)

    # Off-campus drafts go straight live-unverified (no doc badge required).
    # All other categories enter the admin doc-review queue.
    listing.status = (
        ListingStatus.LIVE_UNVERIFIED
        if listing.category == ListingCategory.OFF_CAMPUS
        else ListingStatus.UNDER_DOC_REVIEW
    )
    await db.flush()
    return _view(listing)


# ----------------------------------------------------------------------------
# Photos
# ----------------------------------------------------------------------------


async def register_photo(
    *,
    user: User,
    listing_id: uuid.UUID,
    url: str,
    room_label: str | None,
    db: AsyncSession,
) -> ListingPhoto:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)

    # display_order = current max + 1. Keeps new uploads at the end of the
    # gallery; landlords reorder explicitly via the reorder endpoint.
    current = listing.photos or []
    next_order = (max((p.display_order for p in current), default=-1) + 1)

    photo = ListingPhoto(
        listing_id=listing.id,
        url=url,
        room_label=room_label,
        display_order=next_order,
        is_cover=not current,   # first photo uploaded becomes the cover
    )
    db.add(photo)
    await db.flush()
    return photo


async def update_photo(
    *,
    user: User,
    listing_id: uuid.UUID,
    photo_id: uuid.UUID,
    room_label: str | None,
    is_cover: bool | None,
    db: AsyncSession,
) -> ListingPhoto:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)

    target = next((p for p in listing.photos if p.id == photo_id), None)
    if target is None:
        raise NotFoundError("Photo not found.", code="photo_not_found")

    if room_label is not None:
        target.room_label = room_label
    if is_cover is True:
        for p in listing.photos:
            p.is_cover = p.id == photo_id
    await db.flush()
    return target


async def delete_photo(
    *,
    user: User,
    listing_id: uuid.UUID,
    photo_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    target = next((p for p in listing.photos if p.id == photo_id), None)
    if target is None:
        raise NotFoundError("Photo not found.", code="photo_not_found")
    was_cover = target.is_cover
    await db.delete(target)
    await db.flush()

    if was_cover:
        # Promote the next photo by display_order.
        remaining = [p for p in listing.photos if p.id != photo_id]
        if remaining:
            remaining.sort(key=lambda p: p.display_order)
            remaining[0].is_cover = True
            await db.flush()


async def reorder_photos(
    *,
    user: User,
    listing_id: uuid.UUID,
    ordered_ids: list[uuid.UUID],
    db: AsyncSession,
) -> list[ListingPhoto]:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)

    existing = {p.id: p for p in listing.photos}
    if set(existing.keys()) != set(ordered_ids):
        raise ValidationError(
            "Reorder list must contain every existing photo id exactly once.",
            code="reorder_mismatch",
        )
    for index, pid in enumerate(ordered_ids):
        existing[pid].display_order = index
    await db.flush()
    return sorted(listing.photos, key=lambda p: p.display_order)


# ----------------------------------------------------------------------------
# Documents
# ----------------------------------------------------------------------------


async def register_document(
    *,
    user: User,
    listing_id: uuid.UUID,
    s3_key: str,
    filename: str,
    doc_type: str,
    content_type: str,
    size_bytes: int | None,
    db: AsyncSession,
) -> ListingDocument:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    doc = ListingDocument(
        listing_id=listing.id,
        s3_key=s3_key,
        filename=filename,
        doc_type=doc_type,
        content_type=content_type,
        size_bytes=size_bytes,
    )
    db.add(doc)
    await db.flush()
    return doc


async def delete_document(
    *,
    user: User,
    listing_id: uuid.UUID,
    document_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    target = next((d for d in listing.documents if d.id == document_id), None)
    if target is None:
        raise NotFoundError("Document not found.", code="document_not_found")
    if listing.status != ListingStatus.DRAFT:
        raise ConflictError(
            "Documents cannot be removed after submission.",
            code="document_locked",
        )
    await db.delete(target)
    await db.flush()
