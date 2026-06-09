"""Student accommodation inventory service — unit types and rooms.

Gender tag rule per product brief §8.3:
  * Self-contain units carry no gender tag in the UI (stored as Gender.ANY).
  * Shared-room tags (female/male) are locked once a bed in the room is
    occupied. Trying to change a tag on an occupied room raises ConflictError.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.listings.schemas import RoomPayload, RoomUpdatePayload, UnitTypePayload
from app.models._enums import Gender, ListingCategory, UnitKind
from app.models.listing import Listing
from app.models.student_accommodation import Room, UnitType
from app.models.user import User


def _ensure_student_listing(listing: Listing) -> None:
    if listing.category != ListingCategory.OFF_CAMPUS:
        raise ValidationError(
            "Student inventory only applies to off-campus listings.",
            code="not_student_listing",
        )


async def _load_listing(db: AsyncSession, listing_id: uuid.UUID, user: User) -> Listing:
    stmt = (
        select(Listing).where(Listing.id == listing_id).options(selectinload(Listing.photos))
    )
    listing = (await db.execute(stmt)).scalar_one_or_none()
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if str(listing.owner_id) != str(user.id):
        raise ForbiddenError("You do not own this listing.", code="listing_not_yours")
    _ensure_student_listing(listing)
    return listing


async def list_unit_types(
    *, user: User, listing_id: uuid.UUID, db: AsyncSession
) -> list[UnitType]:
    await _load_listing(db, listing_id, user)
    stmt = (
        select(UnitType)
        .where(UnitType.listing_id == listing_id)
        .options(selectinload(UnitType.rooms))
        .order_by(UnitType.created_at)
    )
    return list((await db.execute(stmt)).scalars().all())


async def add_unit_type(
    *,
    user: User,
    listing_id: uuid.UUID,
    payload: UnitTypePayload,
    db: AsyncSession,
) -> UnitType:
    await _load_listing(db, listing_id, user)
    ut = UnitType(
        listing_id=listing_id,
        name=payload.name.strip(),
        kind=payload.kind,
        beds_per_room=payload.beds_per_room,
        total_units=payload.total_units,
        price=payload.price,
        # Initialise the relationship as a loaded, empty collection. Without
        # this, serialising the unit after the route commits would trigger a
        # lazy SELECT on `rooms` for the freshly-persisted object — which
        # raises MissingGreenlet inside the async session. A new unit type
        # has no rooms yet, so an empty list is both correct and load-free.
        rooms=[],
    )
    db.add(ut)
    await db.flush()
    return ut


async def add_room(
    *,
    user: User,
    listing_id: uuid.UUID,
    unit_type_id: uuid.UUID,
    payload: RoomPayload,
    db: AsyncSession,
) -> Room:
    await _load_listing(db, listing_id, user)
    ut = await db.get(UnitType, unit_type_id)
    if ut is None or ut.listing_id != listing_id:
        raise NotFoundError("Unit type not found on this listing.", code="unit_type_not_found")

    # Self-contain rooms are always Gender.ANY regardless of payload — we
    # normalise at write time so bad client data can't leak a shared-room tag.
    tag = Gender.ANY if ut.kind == UnitKind.SELF_CONTAIN else payload.gender_tag
    if ut.kind != UnitKind.SELF_CONTAIN and tag == Gender.ANY:
        raise ValidationError(
            "Shared rooms require a gender tag (female or male).",
            code="gender_tag_required",
        )
    if payload.beds_total != ut.beds_per_room:
        raise ValidationError(
            "Bed count must match the unit type's beds_per_room.",
            code="beds_mismatch",
        )

    room = Room(
        unit_type_id=unit_type_id,
        name=payload.name.strip(),
        gender_tag=tag,
        beds_total=payload.beds_total,
        beds_available=payload.beds_total,
    )
    db.add(room)
    await db.flush()
    return room


async def update_room(
    *,
    user: User,
    listing_id: uuid.UUID,
    unit_type_id: uuid.UUID,
    room_id: uuid.UUID,
    payload: RoomUpdatePayload,
    db: AsyncSession,
) -> Room:
    await _load_listing(db, listing_id, user)
    room = await db.get(Room, room_id)
    if room is None or room.unit_type_id != unit_type_id:
        raise NotFoundError("Room not found.", code="room_not_found")

    is_occupied = room.beds_available < room.beds_total

    if payload.name is not None:
        room.name = payload.name.strip()
    if payload.gender_tag is not None and payload.gender_tag != room.gender_tag:
        if is_occupied:
            raise ConflictError(
                "Gender tag is locked while any bed in this room is occupied.",
                code="gender_tag_locked",
            )
        room.gender_tag = payload.gender_tag
    if payload.beds_total is not None:
        if is_occupied and payload.beds_total < (room.beds_total - room.beds_available):
            raise ConflictError(
                "Cannot reduce total beds below the current occupancy.",
                code="beds_below_occupancy",
            )
        # Preserve occupancy delta.
        delta = payload.beds_total - room.beds_total
        room.beds_total = payload.beds_total
        room.beds_available = max(0, min(payload.beds_total, room.beds_available + delta))
    if payload.beds_available is not None:
        if payload.beds_available > room.beds_total:
            raise ValidationError(
                "Available beds cannot exceed total beds.",
                code="beds_available_invalid",
            )
        room.beds_available = payload.beds_available

    await db.flush()
    return room


async def delete_unit_type(
    *,
    user: User,
    listing_id: uuid.UUID,
    unit_type_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    await _load_listing(db, listing_id, user)
    ut = await db.get(UnitType, unit_type_id)
    if ut is None or ut.listing_id != listing_id:
        raise NotFoundError("Unit type not found.", code="unit_type_not_found")
    # Block deletion if any room under this unit type has an active occupant.
    stmt = select(Room).where(Room.unit_type_id == unit_type_id)
    rooms = (await db.execute(stmt)).scalars().all()
    if any(r.beds_available < r.beds_total for r in rooms):
        raise ConflictError(
            "Cannot delete a unit type with occupied beds.",
            code="unit_type_has_occupants",
        )
    await db.delete(ut)
    await db.flush()
