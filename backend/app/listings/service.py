"""Listing business logic — create, draft auto-save, submit/publish.

Service functions never commit — the route handler commits once per request.
Submission validation lives here (not in the schema layer) so draft partial
updates remain loose.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.security import verify_password
from app.listings.schemas import (
    AMENITY_GROUPS,
    ListingDeletePayload,
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

# Statuses whose owner may still edit listing fields (base data, amenities,
# house rules, etc.). Drafts plus all live/published states are editable — the
# landlord dashboard's "Manage" flow reuses the draft editor for these. Locked
# states are excluded: under review (frozen for moderation), let/sale agreed
# (deal closed), suspended (admin action) and delisted (soft-deleted).
_EDITABLE_STATUSES: frozenset[ListingStatus] = frozenset(
    {
        ListingStatus.DRAFT,
        ListingStatus.LIVE_UNVERIFIED,
        ListingStatus.DOC_VERIFIED,
        ListingStatus.FULLY_VERIFIED,
    }
)


def _media_view(p: ListingPhoto) -> dict:
    """Serialise one gallery asset. Mirrors `_photo_view` in the routes layer."""
    return {
        "id": str(p.id),
        "url": p.url,
        "media_kind": p.media_kind,
        "poster_url": p.poster_url,
        "duration_seconds": p.duration_seconds,
        "room_label": p.room_label,
        "is_cover": p.is_cover,
        "display_order": p.display_order,
        "unit_type_id": str(p.unit_type_id) if p.unit_type_id else None,
    }


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
        # `Listing.photos` is the property gallery's images only — unit-type
        # galleries are served through the unit-types endpoints, and videos
        # come back in their own list below so the editor can manage them as a
        # separate group.
        photos=[
            _media_view(p)
            for p in sorted(listing.photos, key=lambda p: p.display_order)
            if not p.is_inspector_walkthrough
        ],
        videos=[
            _media_view(p)
            for p in sorted(listing.videos, key=lambda p: p.display_order)
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
        .options(
            selectinload(Listing.photos),
            selectinload(Listing.videos),
            selectinload(Listing.documents),
        )
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
    loaded = await _load(db, listing.id)
    return _view(loaded)


async def get_listing_for_owner(
    *, user: User, listing_id: uuid.UUID, db: AsyncSession
) -> ListingView:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    if listing.deleted_at is not None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    return _view(listing)


async def list_my_listings(
    *, user: User, db: AsyncSession
) -> list[ListingView]:
    stmt = (
        select(Listing)
        .where(Listing.owner_id == user.id, Listing.deleted_at.is_(None))
        .options(
            selectinload(Listing.photos),
            selectinload(Listing.videos),
            selectinload(Listing.documents),
        )
        .order_by(Listing.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_view(r) for r in rows]


async def delete_listing(
    *,
    user: User,
    listing_id: uuid.UUID,
    payload: ListingDeletePayload,
    db: AsyncSession,
) -> None:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    if listing.deleted_at is not None:
        raise NotFoundError("Listing not found.", code="listing_not_found")

    if listing.status != ListingStatus.DRAFT:
        if not payload.password:
            raise ValidationError(
                "Password verification required to delete published listing.",
                code="password_required",
            )
        if not verify_password(payload.password, user.password_hash):
            raise ForbiddenError(
                "Incorrect password.",
                code="incorrect_password",
            )

    listing.status = ListingStatus.DELISTED
    listing.deleted_at = datetime.now(timezone.utc)



async def update_draft(
    *,
    user: User,
    listing_id: uuid.UUID,
    payload: ListingDraftPayload,
    db: AsyncSession,
) -> ListingView:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    if listing.status not in _EDITABLE_STATUSES:
        raise ConflictError(
            "This listing can no longer be edited.",
            code="not_editable",
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

# Human-readable labels for the missing-field codes returned by
# `_validate_ready_for_submission`, surfaced in the submission error message.
_FIELD_LABELS: dict[str, str] = {
    "title": "a title",
    "description": "a description",
    "description_too_short": f"a longer description (at least {_MIN_DESCRIPTION_CHARS} characters)",
    "address_line": "a street address",
    "gps_lat": "the map latitude",
    "gps_lng": "the map longitude",
    "price": "a price",
    "photos": "at least one photo",
    "documents": "a title document",
}


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

    if (
        get_settings().listing_document_review_required
        and listing.category != ListingCategory.OFF_CAMPUS
        and not listing.documents
    ):
        # The initial test phase can skip document review. Production can opt
        # back in with LISTING_DOCUMENT_REVIEW_REQUIRED=true.
        missing.append("documents")

    return missing


def _status_after_submission(listing: Listing) -> ListingStatus:
    """Return the visible status a ready listing should receive."""
    if listing.category == ListingCategory.OFF_CAMPUS:
        return ListingStatus.LIVE_UNVERIFIED
    if get_settings().listing_document_review_required:
        return ListingStatus.UNDER_DOC_REVIEW
    return ListingStatus.LIVE_UNVERIFIED


async def submit_listing(
    *, user: User, listing_id: uuid.UUID, db: AsyncSession
) -> ListingView:
    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    if listing.status != ListingStatus.DRAFT:
        raise ConflictError("Listing has already been submitted.", code="already_submitted")

    missing = _validate_ready_for_submission(listing)
    if missing:
        readable = ", ".join(_FIELD_LABELS.get(code, code) for code in missing)
        raise ValidationError(
            f"Please add the following before submitting: {readable}.",
            code="listing_not_ready",
        )

    _validate_type_data(listing)

    listing.status = _status_after_submission(listing)
    await db.flush()
    return _view(listing)


# ----------------------------------------------------------------------------
# Photos and videos
# ----------------------------------------------------------------------------

MEDIA_IMAGE = "image"
MEDIA_VIDEO = "video"
_MEDIA_KINDS = (MEDIA_IMAGE, MEDIA_VIDEO)

# Video caps. Deliberately tight: a gallery video is a walkthrough, not a
# showreel, and seekers watch on mobile data. The browser enforces these too,
# but a signed Cloudinary upload can be driven by anything, so the register
# call is the boundary that actually holds.
MAX_VIDEO_DURATION_SECONDS = 90
MAX_VIDEO_BYTES = 100 * 1024 * 1024
# One tour of the building; one tour per room type. More than that is a
# bandwidth bill and a scrolling problem, not a better listing.
MAX_VIDEOS_PER_PROPERTY_GALLERY = 3
MAX_VIDEOS_PER_UNIT_GALLERY = 1
ALLOWED_VIDEO_FORMATS = frozenset({"mp4", "mov"})


async def _ensure_unit_type(
    db: AsyncSession, listing: Listing, unit_type_id: uuid.UUID | None
) -> uuid.UUID | None:
    """Validate a photo's target gallery. None means the property gallery."""
    if unit_type_id is None:
        return None
    unit = await db.get(UnitType, unit_type_id)
    if unit is None or unit.listing_id != listing.id:
        raise NotFoundError(
            "Unit type not found on this listing.", code="unit_type_not_found"
        )
    return unit_type_id


async def _gallery_photos(
    db: AsyncSession,
    listing_id: uuid.UUID,
    unit_type_id: uuid.UUID | None,
    media_kind: str = MEDIA_IMAGE,
) -> list[ListingPhoto]:
    """One gallery's media of a single kind, ordered.

    Cover and display_order are scoped to a gallery *and* a media kind: images
    and videos render as separate groups, so they carry independent orderings
    and a video never competes for the cover slot. Every operation below works
    against this slice rather than the listing as a whole.
    """
    stmt = select(ListingPhoto).where(
        ListingPhoto.listing_id == listing_id,
        ListingPhoto.media_kind == media_kind,
    )
    stmt = stmt.where(
        ListingPhoto.unit_type_id.is_(None)
        if unit_type_id is None
        else ListingPhoto.unit_type_id == unit_type_id
    )
    rows = (await db.execute(stmt.order_by(ListingPhoto.display_order))).scalars().all()
    return list(rows)


def _validate_video(
    *,
    duration_seconds: int | None,
    size_bytes: int | None,
    video_format: str | None,
    existing_count: int,
    unit_type_id: uuid.UUID | None,
) -> None:
    """Gate a video registration against the product caps.

    Unknown duration/size are treated as failures rather than waved through —
    they are always present on a genuine Cloudinary video response, so their
    absence means the payload did not come from one.
    """
    limit = (
        MAX_VIDEOS_PER_PROPERTY_GALLERY
        if unit_type_id is None
        else MAX_VIDEOS_PER_UNIT_GALLERY
    )
    if existing_count >= limit:
        noun = "this listing" if unit_type_id is None else "this room type"
        raise ValidationError(
            f"You can add at most {limit} video{'' if limit == 1 else 's'} to {noun}.",
            code="video_limit_reached",
        )

    if video_format is not None and video_format.lower() not in ALLOWED_VIDEO_FORMATS:
        allowed = " or ".join(sorted(ALLOWED_VIDEO_FORMATS)).upper()
        raise ValidationError(
            f"Videos must be {allowed} files.", code="video_format_unsupported"
        )

    if duration_seconds is None or duration_seconds <= 0:
        raise ValidationError(
            "Could not read the video's length. Please try uploading it again.",
            code="video_duration_unknown",
        )
    if duration_seconds > MAX_VIDEO_DURATION_SECONDS:
        raise ValidationError(
            f"Videos must be {MAX_VIDEO_DURATION_SECONDS} seconds or shorter.",
            code="video_too_long",
        )

    if size_bytes is None or size_bytes <= 0:
        raise ValidationError(
            "Could not read the video's size. Please try uploading it again.",
            code="video_size_unknown",
        )
    if size_bytes > MAX_VIDEO_BYTES:
        megabytes = MAX_VIDEO_BYTES // (1024 * 1024)
        raise ValidationError(
            f"Videos must be {megabytes}MB or smaller.", code="video_too_large"
        )


async def register_photo(
    *,
    user: User,
    listing_id: uuid.UUID,
    url: str,
    room_label: str | None,
    unit_type_id: uuid.UUID | None = None,
    media_kind: str = MEDIA_IMAGE,
    provider_public_id: str | None = None,
    poster_url: str | None = None,
    duration_seconds: int | None = None,
    size_bytes: int | None = None,
    video_format: str | None = None,
    db: AsyncSession,
) -> ListingPhoto:
    """Record an uploaded asset against a gallery.

    Called after the browser has uploaded straight to Cloudinary, so this is
    the first point at which we can apply any rule at all — hence the video
    validation here rather than in the schema layer.
    """
    if media_kind not in _MEDIA_KINDS:
        raise ValidationError("Unsupported media type.", code="media_kind_invalid")

    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    unit_type_id = await _ensure_unit_type(db, listing, unit_type_id)

    # display_order = current max + 1 within this gallery and kind. Keeps new
    # uploads at the end; landlords reorder explicitly via the reorder endpoint.
    current = await _gallery_photos(db, listing.id, unit_type_id, media_kind)
    next_order = (max((p.display_order for p in current), default=-1) + 1)

    if media_kind == MEDIA_VIDEO:
        _validate_video(
            duration_seconds=duration_seconds,
            size_bytes=size_bytes,
            video_format=video_format,
            existing_count=len(current),
            unit_type_id=unit_type_id,
        )

    photo = ListingPhoto(
        listing_id=listing.id,
        unit_type_id=unit_type_id,
        media_kind=media_kind,
        url=url,
        provider_public_id=provider_public_id,
        poster_url=poster_url if media_kind == MEDIA_VIDEO else None,
        duration_seconds=duration_seconds if media_kind == MEDIA_VIDEO else None,
        size_bytes=size_bytes,
        room_label=room_label,
        display_order=next_order,
        # First image in this gallery becomes its cover. Videos never do.
        is_cover=media_kind == MEDIA_IMAGE and not current,
    )
    db.add(photo)
    await db.flush()
    return photo


async def _load_photo(
    db: AsyncSession, listing: Listing, photo_id: uuid.UUID
) -> ListingPhoto:
    """Fetch one photo from any of the listing's galleries."""
    stmt = select(ListingPhoto).where(
        ListingPhoto.id == photo_id, ListingPhoto.listing_id == listing.id
    )
    photo = (await db.execute(stmt)).scalar_one_or_none()
    if photo is None:
        raise NotFoundError("Photo not found.", code="photo_not_found")
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

    target = await _load_photo(db, listing, photo_id)

    if room_label is not None:
        target.room_label = room_label
    if is_cover is True:
        if target.media_kind == MEDIA_VIDEO:
            # The cover doubles as the browse-card thumbnail and the share
            # preview, both of which have to be a still image.
            raise ValidationError(
                "A video cannot be the gallery cover. Choose a photo instead.",
                code="video_cannot_be_cover",
            )
        # Cover is per gallery — promoting a unit photo must not unset the
        # property cover, or vice versa.
        for p in await _gallery_photos(db, listing.id, target.unit_type_id, MEDIA_IMAGE):
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
    target = await _load_photo(db, listing, photo_id)
    was_cover = target.is_cover
    unit_type_id = target.unit_type_id
    await db.delete(target)
    await db.flush()

    if was_cover:
        # Promote the next image in the same gallery by display_order. Only
        # images are candidates, so a gallery whose last photo is deleted is
        # left cover-less even if it still holds a video.
        remaining = await _gallery_photos(db, listing.id, unit_type_id, MEDIA_IMAGE)
        if remaining:
            remaining[0].is_cover = True
            await db.flush()


async def reorder_photos(
    *,
    user: User,
    listing_id: uuid.UUID,
    ordered_ids: list[uuid.UUID],
    unit_type_id: uuid.UUID | None = None,
    media_kind: str = MEDIA_IMAGE,
    db: AsyncSession,
) -> list[ListingPhoto]:
    if media_kind not in _MEDIA_KINDS:
        raise ValidationError("Unsupported media type.", code="media_kind_invalid")

    listing = await _load(db, listing_id)
    _ensure_owner(user, listing)
    unit_type_id = await _ensure_unit_type(db, listing, unit_type_id)

    # Scoped to one gallery and one kind, matching how each group is rendered
    # and dragged — reordering photos never has to name the videos.
    existing = {
        p.id: p for p in await _gallery_photos(db, listing.id, unit_type_id, media_kind)
    }
    if set(existing.keys()) != set(ordered_ids):
        raise ValidationError(
            "Reorder list must contain every existing photo id exactly once.",
            code="reorder_mismatch",
        )
    for index, pid in enumerate(ordered_ids):
        existing[pid].display_order = index
    await db.flush()
    return sorted(existing.values(), key=lambda p: p.display_order)


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
