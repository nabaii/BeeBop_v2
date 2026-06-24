"""Referral clearing sweeper.

  • `clear_due_earnings` — runs hourly. Flips every PENDING earning whose
    clearing window has elapsed (clears_at <= now) to CLEARED, making it
    withdrawable (§5.2). Disputes/cancellations move earnings to REVERSED
    before this runs (see referrals.service.reverse_earnings_for_agreement), so
    a reversed earning is never picked up here.

Mirrors app/bookings/sweeper.py.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models._enums import ReferralEarningState
from app.models.referral import ReferralEarning
from app.notifications.celery_app import celery_app


async def _clear_due() -> int:
    now = datetime.now(UTC)
    cleared = 0
    async with AsyncSessionLocal() as db:
        stmt = select(ReferralEarning).where(
            ReferralEarning.state == ReferralEarningState.PENDING,
            ReferralEarning.clears_at.is_not(None),
            ReferralEarning.clears_at <= now,
        )
        rows = (await db.execute(stmt)).scalars().all()
        for earning in rows:
            earning.state = ReferralEarningState.CLEARED
            cleared += 1
        await db.commit()
    return cleared


@celery_app.task(name="app.referrals.sweeper.clear_due_earnings")
def clear_due_earnings() -> int:
    return asyncio.run(_clear_due())
