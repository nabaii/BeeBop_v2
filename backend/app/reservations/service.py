"""Off-campus reservation lifecycle ('Book now').

Flow:
  seeker picks a unit type -> reservation saved PENDING_PAYMENT -> Paystack
  initialise -> seeker pays -> webhook calls `confirm_payment` -> reservation
  flips CONFIRMED and one bed in the chosen unit type is decremented.

The full term price is captured upfront; there is no host-approval step
(student accommodation is instant-book by design).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.integrations.paystack import get_paystack, make_reference
from app.models._enums import (
    ListingCategory,
    ListingStatus,
    ReservationStatus,
    UserRole,
)
from app.models.listing import Listing
from app.models.reservation import Reservation
from app.models.student_accommodation import Room, UnitType
from app.models.user import User
from app.notifications.dispatch import dispatch_notification
from app.payments.fees import student_accommodation_fee
from app.reservations.schemas import ReservationQuote, ReservationView

_ACCEPTING_STATUSES = (
    ListingStatus.DOC_VERIFIED,
    ListingStatus.FULLY_VERIFIED,
    ListingStatus.LIVE_UNVERIFIED,
)


async def _load_off_campus(db: AsyncSession, listing_id: uuid.UUID) -> Listing:
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if listing.category != ListingCategory.OFF_CAMPUS:
        raise ValidationError(
            "Reservations only apply to student accommodation.",
            code="not_off_campus",
        )
    return listing


async def _load_unit_type(
    db: AsyncSession, listing_id: uuid.UUID, unit_type_id: uuid.UUID
) -> UnitType:
    unit = await db.get(UnitType, unit_type_id)
    if unit is None or unit.listing_id != listing_id:
        raise NotFoundError("Unit type not found on this listing.", code="unit_type_not_found")
    return unit


async def _beds_available(db: AsyncSession, unit_type_id: uuid.UUID) -> int:
    stmt = select(Room).where(Room.unit_type_id == unit_type_id)
    rooms = (await db.execute(stmt)).scalars().all()
    return sum(r.beds_available for r in rooms)


def _quote_for_unit(unit: UnitType, beds_available: int) -> ReservationQuote:
    base = float(unit.price)
    fees = student_accommodation_fee(base) if base > 0 else None
    seeker_fee = fees.seeker_fee if fees else 0.0
    return ReservationQuote(
        unit_type_id=str(unit.id),
        unit_type_name=unit.name,
        price_period=unit.price_period,
        base_total=base,
        seeker_fee=seeker_fee,
        grand_total=round(base + seeker_fee, 2),
        beds_available=beds_available,
    )


async def quote(
    *, listing_id: uuid.UUID, unit_type_id: uuid.UUID, db: AsyncSession
) -> ReservationQuote:
    await _load_off_campus(db, listing_id)
    unit = await _load_unit_type(db, listing_id, unit_type_id)
    beds = await _beds_available(db, unit_type_id)
    return _quote_for_unit(unit, beds)


async def create_reservation(
    *,
    seeker: User,
    listing_id: uuid.UUID,
    unit_type_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[Reservation, str | None]:
    if seeker.role != UserRole.SEEKER:
        raise ForbiddenError("Only seekers can book.", code="not_seeker")

    listing = await _load_off_campus(db, listing_id)
    if listing.owner_id == seeker.id:
        raise ForbiddenError("You cannot book your own listing.", code="self_booking")
    if listing.status not in _ACCEPTING_STATUSES:
        raise ConflictError(
            "Listing is not currently accepting bookings.",
            code="listing_not_accepting_bookings",
        )

    unit = await _load_unit_type(db, listing_id, unit_type_id)
    if float(unit.price) <= 0:
        raise ValidationError("This unit type has no price set.", code="no_unit_price")
    if await _beds_available(db, unit_type_id) <= 0:
        raise ConflictError("This unit type is fully booked.", code="no_beds_available")

    # One open (unpaid) reservation per seeker per unit type avoids the seeker
    # spawning multiple Paystack sessions for the same bed.
    existing_stmt = select(Reservation).where(
        Reservation.seeker_id == seeker.id,
        Reservation.unit_type_id == unit_type_id,
        Reservation.status.in_(
            (ReservationStatus.PENDING_PAYMENT, ReservationStatus.CONFIRMED)
        ),
    )
    if (await db.execute(existing_stmt)).scalar_one_or_none() is not None:
        raise ConflictError(
            "You already have a reservation for this unit type.",
            code="duplicate_reservation",
        )

    base = float(unit.price)
    fees = student_accommodation_fee(base)
    reservation = Reservation(
        listing_id=listing.id,
        seeker_id=seeker.id,
        unit_type_id=unit.id,
        status=ReservationStatus.PENDING_PAYMENT,
        unit_type_name=unit.name,
        price_period=unit.price_period,
        base_total=base,
        seeker_fee=fees.seeker_fee,
        owner_fee=fees.owner_fee,
        grand_total=round(base + fees.seeker_fee, 2),
    )
    db.add(reservation)
    await db.flush()

    auth_url = await _initialise_payment(reservation=reservation, seeker=seeker, db=db)
    return reservation, auth_url


async def _initialise_payment(
    *, reservation: Reservation, seeker: User, db: AsyncSession
) -> str | None:
    paystack = get_paystack()
    ref = make_reference("resv")
    result = await paystack.initialise_payment(
        amount_naira=float(reservation.grand_total),
        email=seeker.email,
        reference=ref,
        metadata={"reservation_id": str(reservation.id)},
    )
    reservation.paystack_reference = ref
    await db.flush()
    return result.authorization_url


async def confirm_payment(
    *, reservation_id: uuid.UUID, reference: str, db: AsyncSession
) -> Reservation | None:
    """Called from the Paystack webhook. Idempotent."""
    reservation = await db.get(Reservation, reservation_id)
    if reservation is None or reservation.paystack_reference != reference:
        return None
    if reservation.status != ReservationStatus.PENDING_PAYMENT:
        return reservation

    reservation.status = ReservationStatus.CONFIRMED
    reservation.payment_confirmed_at = datetime.now(timezone.utc)
    await _decrement_bed(db, reservation.unit_type_id)
    await db.flush()

    listing = await db.get(Listing, reservation.listing_id)
    for uid, evt in (
        (reservation.seeker_id, "reservation.confirmed_seeker"),
        (listing.owner_id if listing else None, "reservation.confirmed_owner"),
    ):
        if uid is None:
            continue
        await dispatch_notification(
            user_id=uid,
            event_type=evt,
            payload={
                "reservation_id": str(reservation.id),
                "listing_id": str(reservation.listing_id),
                "listing_title": listing.title if listing else "the property",
                "unit_type_name": reservation.unit_type_name,
            },
            db=db,
        )
    return reservation


async def _decrement_bed(db: AsyncSession, unit_type_id: uuid.UUID) -> None:
    """Drop one available bed from the first room that has capacity."""
    stmt = (
        select(Room)
        .where(Room.unit_type_id == unit_type_id, Room.beds_available > 0)
        .order_by(Room.created_at.asc())
        .limit(1)
    )
    room = (await db.execute(stmt)).scalar_one_or_none()
    if room is not None:
        room.beds_available -= 1


async def cancel_reservation(
    *,
    actor: User,
    reservation_id: uuid.UUID,
    reason: str,
    db: AsyncSession,
) -> Reservation:
    reservation = await db.get(Reservation, reservation_id)
    if reservation is None:
        raise NotFoundError("Reservation not found.", code="reservation_not_found")
    listing = await db.get(Listing, reservation.listing_id)
    if (
        str(actor.id) not in (str(reservation.seeker_id), str(listing.owner_id if listing else ""))
        and actor.role != UserRole.ADMIN
    ):
        raise ForbiddenError("Not your reservation.", code="cancel_not_permitted")
    if reservation.status == ReservationStatus.CANCELLED:
        raise ConflictError("Reservation already cancelled.", code="already_cancelled")

    was_confirmed = reservation.status == ReservationStatus.CONFIRMED
    reservation.status = ReservationStatus.CANCELLED
    reservation.cancelled_at = datetime.now(timezone.utc)
    reservation.cancellation_reason = reason
    # Return the bed to inventory if it had been reserved.
    if was_confirmed:
        await _increment_bed(db, reservation.unit_type_id)
    await db.flush()
    return reservation


async def _increment_bed(db: AsyncSession, unit_type_id: uuid.UUID) -> None:
    stmt = (
        select(Room)
        .where(Room.unit_type_id == unit_type_id)
        .order_by(Room.created_at.asc())
    )
    rooms = (await db.execute(stmt)).scalars().all()
    for room in rooms:
        if room.beds_available < room.beds_total:
            room.beds_available += 1
            return


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


def _to_view(
    *, reservation: Reservation, listing: Listing, auth_url: str | None = None
) -> ReservationView:
    return ReservationView(
        id=str(reservation.id),
        listing_id=str(reservation.listing_id),
        listing_title=listing.title or "Untitled",
        seeker_id=str(reservation.seeker_id),
        unit_type_id=str(reservation.unit_type_id),
        unit_type_name=reservation.unit_type_name,
        price_period=reservation.price_period,
        status=reservation.status,
        base_total=float(reservation.base_total),
        seeker_fee=float(reservation.seeker_fee),
        grand_total=float(reservation.grand_total),
        payment_confirmed_at=reservation.payment_confirmed_at,
        cancelled_at=reservation.cancelled_at,
        cancellation_reason=reservation.cancellation_reason,
        created_at=reservation.created_at,
        paystack_authorization_url=auth_url,
    )


async def list_seeker_reservations(
    *, seeker: User, db: AsyncSession
) -> list[ReservationView]:
    if seeker.role != UserRole.SEEKER:
        raise ForbiddenError("Only seekers see their reservations.", code="not_seeker")
    stmt = (
        select(Reservation)
        .where(Reservation.seeker_id == seeker.id)
        .order_by(Reservation.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    out: list[ReservationView] = []
    for r in rows:
        listing = await db.get(Listing, r.listing_id)
        if listing is not None:
            out.append(_to_view(reservation=r, listing=listing))
    return out
