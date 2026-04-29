"""Badge issuance and revocation.

Document badges expire after 24 months. Physical badges (Sprint 7) expire
after 12 months. Both are issued by admin actions; landlords never self-issue.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models._enums import BadgeStatus, BadgeType
from app.models.badge import Badge

DOC_BADGE_LIFETIME = timedelta(days=365 * 2)
PHYSICAL_BADGE_LIFETIME = timedelta(days=365)


async def issue_doc_badge(
    *,
    listing_id: uuid.UUID,
    admin_id: uuid.UUID,
    db: AsyncSession,
) -> Badge:
    badge = Badge(
        listing_id=listing_id,
        type=BadgeType.DOCUMENT,
        status=BadgeStatus.ACTIVE,
        issued_by_id=admin_id,
        expires_at=datetime.now(timezone.utc) + DOC_BADGE_LIFETIME,
    )
    db.add(badge)
    await db.flush()
    return badge


async def issue_physical_badge(
    *,
    listing_id: uuid.UUID,
    admin_id: uuid.UUID,
    inspector_id: uuid.UUID,
    db: AsyncSession,
) -> Badge:
    badge = Badge(
        listing_id=listing_id,
        type=BadgeType.PHYSICAL,
        status=BadgeStatus.ACTIVE,
        issued_by_id=admin_id,
        inspector_id=inspector_id,
        expires_at=datetime.now(timezone.utc) + PHYSICAL_BADGE_LIFETIME,
    )
    db.add(badge)
    await db.flush()
    return badge


async def revoke_badge(
    *, badge_id: uuid.UUID, reason: str, db: AsyncSession
) -> Badge | None:
    badge = await db.get(Badge, badge_id)
    if badge is None:
        return None
    badge.status = BadgeStatus.REVOKED
    badge.revoked_at = datetime.now(timezone.utc)
    badge.revocation_reason = reason
    await db.flush()
    return badge


async def listing_has_active_badge(
    *, listing_id: uuid.UUID, badge_type: BadgeType, db: AsyncSession
) -> bool:
    stmt = select(Badge).where(
        Badge.listing_id == listing_id,
        Badge.type == badge_type,
        Badge.status == BadgeStatus.ACTIVE,
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None
