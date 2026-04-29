"""Booking-side Celery tasks.

  • `release_due_access_details` — runs hourly. For every CONFIRMED booking
    where check-in is today and access details haven't been released yet,
    fires `access_details.released` (email + WhatsApp + in-app).

  • `auto_decline_stale_requests` — runs every 30 minutes. For every
    REQUESTED non-instant booking past its 24h decision deadline, marks it
    CANCELLED with reason `auto_decline_no_response`, notifies the seeker.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.bookings.service import release_access_details
from app.database import AsyncSessionLocal
from app.models._enums import BookingStatus
from app.models.booking import Booking
from app.models.listing import Listing
from app.notifications.celery_app import celery_app
from app.notifications.dispatch import dispatch_notification


async def _release() -> int:
    today = date.today()
    sent = 0
    async with AsyncSessionLocal() as db:
        stmt = select(Booking).where(
            Booking.status == BookingStatus.CONFIRMED,
            Booking.check_in == today,
            Booking.access_details_released_at.is_(None),
        )
        rows = (await db.execute(stmt)).scalars().all()
        for b in rows:
            await release_access_details(booking=b, db=db)
            sent += 1
        await db.commit()
    return sent


async def _auto_decline() -> int:
    now = datetime.now(timezone.utc)
    closed = 0
    async with AsyncSessionLocal() as db:
        stmt = select(Booking).where(
            Booking.status == BookingStatus.REQUESTED,
            Booking.instant_booking.is_(False),
            Booking.decision_deadline.is_not(None),
            Booking.decision_deadline < now,
        )
        rows = (await db.execute(stmt)).scalars().all()
        for b in rows:
            b.status = BookingStatus.CANCELLED
            b.cancelled_at = now
            b.decline_reason = "auto_decline_no_response"
            listing = await db.get(Listing, b.listing_id)
            await dispatch_notification(
                user_id=b.seeker_id,
                event_type="booking.declined",
                payload={
                    "booking_id": str(b.id),
                    "listing_title": listing.title if listing else "the property",
                    "reason": "Host did not respond within 24 hours.",
                },
                db=db,
            )
            closed += 1
        await db.commit()
    return closed


@celery_app.task(name="app.bookings.sweeper.release_due_access_details")
def release_due_access_details() -> int:
    return asyncio.run(_release())


@celery_app.task(name="app.bookings.sweeper.auto_decline_stale_requests")
def auto_decline_stale_requests() -> int:
    return asyncio.run(_auto_decline())
