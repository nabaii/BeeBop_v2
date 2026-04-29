"""Date-availability helpers — single source of truth for double-booking
prevention and the calendar UI.

Booked nights = the set of dates [check_in .. check_out). Turnaround days
extend `turnaround_days` from `Listing.type_data` after each booking's
check_out. We treat REQUESTED + CONFIRMED bookings as blocking; CANCELLED
and COMPLETED booked-but-finished do not block future bookings.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models._enums import BookingStatus
from app.models.booking import Booking


_BLOCKING = (BookingStatus.REQUESTED, BookingStatus.CONFIRMED)


@dataclass(frozen=True)
class BlockedDay:
    day: date
    state: str   # "booked" | "turnaround"
    booking_id: uuid.UUID


async def blocked_days_for_listing(
    *, db: AsyncSession, listing_id: uuid.UUID, turnaround_days: int
) -> list[BlockedDay]:
    stmt = (
        select(Booking)
        .where(
            Booking.listing_id == listing_id,
            Booking.status.in_(_BLOCKING),
        )
    )
    rows = (await db.execute(stmt)).scalars().all()
    out: list[BlockedDay] = []
    for b in rows:
        cursor = b.check_in
        while cursor < b.check_out:
            out.append(BlockedDay(day=cursor, state="booked", booking_id=b.id))
            cursor = cursor + timedelta(days=1)
        for i in range(turnaround_days):
            out.append(
                BlockedDay(
                    day=b.check_out + timedelta(days=i),
                    state="turnaround",
                    booking_id=b.id,
                )
            )
    return out


async def has_conflict(
    *,
    db: AsyncSession,
    listing_id: uuid.UUID,
    check_in: date,
    check_out: date,
    turnaround_days: int,
    ignore_booking_id: uuid.UUID | None = None,
) -> bool:
    """True if any blocking booking overlaps the requested range INCLUDING
    its turnaround window."""
    stmt = (
        select(Booking)
        .where(
            Booking.listing_id == listing_id,
            Booking.status.in_(_BLOCKING),
        )
    )
    rows = (await db.execute(stmt)).scalars().all()
    for b in rows:
        if ignore_booking_id is not None and b.id == ignore_booking_id:
            continue
        booked_start = b.check_in
        booked_end = b.check_out + timedelta(days=turnaround_days)
        # Overlap iff requested_start < booked_end AND requested_end > booked_start.
        if check_in < booked_end and check_out > booked_start:
            return True
    return False
