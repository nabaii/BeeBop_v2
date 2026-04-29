"""Offer-expiry sweeper — runs every minute via Celery Beat.

Two responsibilities:

  1. Fire the staged reminder notifications at hour 24 / 36 (per dev plan §12.3).
     Hour 0 fires synchronously when the offer is submitted.
     Hour 48 = expiry; we transition the offer to EXPIRED and notify both parties.

  2. Mark expired offers as EXPIRED.

The Notification.expiry_notifications_sent JSONB field holds which buckets
have already fired so re-runs are idempotent.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models._enums import OfferStatus
from app.models.listing import Listing
from app.models.offer import Offer
from app.notifications.celery_app import celery_app
from app.notifications.dispatch import dispatch_notification


async def _process_open_offers(db: AsyncSession) -> dict[str, int]:
    """Return a counters dict: how many of each bucket fired."""
    now = datetime.now(timezone.utc)
    stmt = select(Offer).where(Offer.status == OfferStatus.PENDING)
    offers = (await db.execute(stmt)).scalars().all()

    counters = {"h24": 0, "h36": 0, "expired": 0}

    for offer in offers:
        sent = dict(offer.expiry_notifications_sent or {})
        # Hours since the timer started:
        elapsed = now - (offer.expires_at - _OFFER_WINDOW)
        hours_elapsed = elapsed.total_seconds() / 3600

        # Listing context for notifications.
        listing = await db.get(Listing, offer.listing_id)
        listing_title = listing.title if listing else "the listing"
        landlord_id = listing.owner_id if listing else None

        responder_id = (
            landlord_id if offer.awaiting_landlord_response else offer.seeker_id
        )

        if now >= offer.expires_at and not sent.get("h48"):
            offer.status = OfferStatus.EXPIRED
            offer.responded_at = now
            sent["h48"] = now.isoformat()
            await dispatch_notification(
                user_id=offer.seeker_id,
                event_type="offer.expired",
                payload={
                    "offer_id": str(offer.id),
                    "listing_id": str(offer.listing_id),
                    "listing_title": listing_title,
                },
                db=db,
            )
            if landlord_id is not None:
                await dispatch_notification(
                    user_id=landlord_id,
                    event_type="offer.expired",
                    payload={
                        "offer_id": str(offer.id),
                        "listing_id": str(offer.listing_id),
                        "listing_title": listing_title,
                    },
                    db=db,
                )
            counters["expired"] += 1
        elif hours_elapsed >= 36 and not sent.get("h36") and responder_id is not None:
            sent["h36"] = now.isoformat()
            await dispatch_notification(
                user_id=responder_id,
                event_type="offer.expiring_urgent",
                payload={
                    "offer_id": str(offer.id),
                    "listing_id": str(offer.listing_id),
                    "listing_title": listing_title,
                    "hours_remaining": 12,
                },
                db=db,
            )
            counters["h36"] += 1
        elif hours_elapsed >= 24 and not sent.get("h24") and responder_id is not None:
            sent["h24"] = now.isoformat()
            await dispatch_notification(
                user_id=responder_id,
                event_type="offer.expiring",
                payload={
                    "offer_id": str(offer.id),
                    "listing_id": str(offer.listing_id),
                    "listing_title": listing_title,
                    "hours_remaining": 24,
                },
                db=db,
            )
            counters["h24"] += 1

        offer.expiry_notifications_sent = sent

    await db.commit()
    return counters


# Imported lazily inside the function to avoid a circular import at module load.
def _offer_window():
    from datetime import timedelta

    return timedelta(hours=48)


_OFFER_WINDOW = _offer_window()


async def _run_async() -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        return await _process_open_offers(db)


@celery_app.task(name="app.offers.sweeper.process_offer_expiry")
def process_offer_expiry() -> dict[str, int]:
    """Beat task — fires every minute. See `celery_app.beat_schedule`."""
    return asyncio.run(_run_async())
