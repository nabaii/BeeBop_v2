"""Renewal sweeper — Celery Beat triggers this daily.

Logic:
  • Find ACTIVE tenancy agreements ending within 30 days that haven't yet
    been prompted (Agreement.renewal_prompted_at IS NULL, renewed_into_id IS NULL).
  • Dispatch `agreement.renewal_prompt` to the landlord.
  • Mark `renewal_prompted_at = now`. The actual renewal flow (simplified
    agreement + 10k Naira renewal fee) is initiated when the landlord clicks
    Renew in their dashboard — wired in the next sprint's polish pass.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone

from app.agreements.service import find_agreements_due_for_renewal_prompt
from app.database import AsyncSessionLocal
from app.models.listing import Listing
from app.notifications.celery_app import celery_app
from app.notifications.dispatch import dispatch_notification


async def _run() -> int:
    today = date.today()
    sent = 0
    async with AsyncSessionLocal() as db:
        candidates = await find_agreements_due_for_renewal_prompt(db=db, today=today)
        for agreement in candidates:
            listing = await db.get(Listing, agreement.listing_id)
            if listing is None or agreement.end_date is None:
                continue
            days_remaining = (agreement.end_date - today).days
            await dispatch_notification(
                user_id=listing.owner_id,
                event_type="agreement.renewal_prompt",
                payload={
                    "agreement_id": str(agreement.id),
                    "listing_id": str(listing.id),
                    "listing_title": listing.title or "your tenancy",
                    "days_remaining": max(0, days_remaining),
                },
                db=db,
            )
            agreement.renewal_prompted_at = datetime.now(timezone.utc)
            sent += 1
        await db.commit()
    return sent


@celery_app.task(name="app.agreements.renewal.run_renewal_sweeper")
def run_renewal_sweeper() -> int:
    return asyncio.run(_run())
