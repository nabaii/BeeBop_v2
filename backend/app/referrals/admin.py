"""Admin management of the referral programme (§11).

Approvals, suspensions, config edits, and earning reversals are written to the
AdminAuditLog. The velocity flag (§8) is computed on read — unusual recent
volume on a code raises a review flag only; it never auto-blocks.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import audit
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models._enums import (
    ReferralCodeStatus,
    ReferralEarningState,
    ReferralEarningType,
    ReferralPartnerApplicationStatus,
    ReferralTier,
)
from app.models.referral import (
    Payout,
    ReferralAttribution,
    ReferralCode,
    ReferralConfig,
    ReferralEarning,
    ReferralPartnerApplication,
)
from app.models.user import User
from app.referrals.service import get_config

# Velocity flag — "flag only, does not auto-block" (§8). Internal heuristic; can
# graduate to a config value later if it needs tuning without a deploy.
VELOCITY_WINDOW_HOURS = 24
VELOCITY_FLAG_THRESHOLD = 10

# Config fields an admin may tune. retroactive_attachment is deliberately absent
# — it is a locked constant, never a toggle (§9.2).
_EDITABLE_CONFIG_FIELDS = (
    "first_time_purchaser_required",
    "per_code_semester_cap",
    "clearing_window_days",
    "min_withdrawal_naira",
    "reward_pool_pct",
    "referrer_share",
    "payer_cashback_share",
    "partner_tier1_share",
    "partner_tier2_share",
    "partner_tier3_share",
    "partner_tier1_max",
    "partner_tier2_max",
)


# ---------------------------------------------------------------------------
# Overview metrics
# ---------------------------------------------------------------------------


async def _sum_earnings(state: ReferralEarningState, db: AsyncSession) -> float:
    row = await db.execute(
        select(func.coalesce(func.sum(ReferralEarning.amount), 0)).where(
            ReferralEarning.state == state
        )
    )
    return float(row.scalar() or 0)


async def _count(db: AsyncSession, stmt) -> int:  # type: ignore[no-untyped-def]
    return int((await db.execute(stmt)).scalar() or 0)


async def overview(db: AsyncSession) -> dict:
    joined = await _count(
        db,
        select(func.count()).select_from(User).where(User.referred_by_code.is_not(None)),
    )
    booked = await _count(
        db, select(func.count(func.distinct(ReferralAttribution.referred_user_id)))
    )
    return {
        "new_users_via_referral": joined,
        "referred_users_booked": booked,
        "rewards_pending": await _sum_earnings(ReferralEarningState.PENDING, db),
        "rewards_cleared": await _sum_earnings(ReferralEarningState.CLEARED, db),
        "rewards_paid": await _sum_earnings(ReferralEarningState.PAID, db),
        "rewards_reversed": await _sum_earnings(ReferralEarningState.REVERSED, db),
        "active_codes": await _count(
            db,
            select(func.count())
            .select_from(ReferralCode)
            .where(ReferralCode.status == ReferralCodeStatus.ACTIVE),
        ),
        "partner_codes": await _count(
            db,
            select(func.count())
            .select_from(ReferralCode)
            .where(ReferralCode.tier == ReferralTier.PARTNER),
        ),
        "suspended_codes": await _count(
            db,
            select(func.count())
            .select_from(ReferralCode)
            .where(ReferralCode.status == ReferralCodeStatus.SUSPENDED),
        ),
        "pending_applications": await _count(
            db,
            select(func.count())
            .select_from(ReferralPartnerApplication)
            .where(
                ReferralPartnerApplication.status
                == ReferralPartnerApplicationStatus.PENDING
            ),
        ),
    }


# ---------------------------------------------------------------------------
# Code list (counts, earnings, velocity flag)
# ---------------------------------------------------------------------------


async def list_codes(db: AsyncSession, *, limit: int = 200) -> list[dict]:
    codes = list(
        (
            await db.execute(
                select(ReferralCode).order_by(ReferralCode.created_at.desc()).limit(limit)
            )
        ).scalars().all()
    )
    if not codes:
        return []

    referrals_by_code = {
        code: int(n)
        for code, n in (
            await db.execute(
                select(ReferralAttribution.code, func.count()).group_by(
                    ReferralAttribution.code
                )
            )
        ).all()
    }

    since = datetime.now(UTC) - timedelta(hours=VELOCITY_WINDOW_HOURS)
    recent_by_code = {
        code: int(n)
        for code, n in (
            await db.execute(
                select(ReferralAttribution.code, func.count())
                .where(ReferralAttribution.applied_at >= since)
                .group_by(ReferralAttribution.code)
            )
        ).all()
    }

    earned_by_code = {
        code: float(total)
        for code, total in (
            await db.execute(
                select(
                    ReferralAttribution.code,
                    func.coalesce(func.sum(ReferralEarning.amount), 0),
                )
                .join(
                    ReferralAttribution,
                    ReferralAttribution.id == ReferralEarning.attribution_id,
                )
                .where(
                    ReferralEarning.type == ReferralEarningType.REFERRER_EARNING,
                    ReferralEarning.state != ReferralEarningState.REVERSED,
                )
                .group_by(ReferralAttribution.code)
            )
        ).all()
    }

    owners = {
        u.id: u
        for u in (
            await db.execute(
                select(User).where(User.id.in_([c.user_id for c in codes]))
            )
        ).scalars().all()
    }

    out: list[dict] = []
    for c in codes:
        owner = owners.get(c.user_id)
        owner_name = None
        if owner is not None:
            owner_name = (
                " ".join(p for p in (owner.first_name, owner.last_name) if p)
                or owner.email
            )
        out.append(
            {
                "id": str(c.id),
                "code": c.code,
                "owner_name": owner_name,
                "tier": c.tier,
                "status": c.status,
                "referrals": referrals_by_code.get(c.code, 0),
                "earned": earned_by_code.get(c.code, 0.0),
                "velocity_flagged": recent_by_code.get(c.code, 0) >= VELOCITY_FLAG_THRESHOLD,
            }
        )
    return out


# ---------------------------------------------------------------------------
# Code tier + status mutations
# ---------------------------------------------------------------------------


async def set_code_status(
    *, admin: User, code_id: uuid.UUID, suspend: bool, db: AsyncSession
) -> ReferralCode:
    code = await db.get(ReferralCode, code_id)
    if code is None:
        raise NotFoundError("Referral code not found.", code="code_not_found")
    code.status = ReferralCodeStatus.SUSPENDED if suspend else ReferralCodeStatus.ACTIVE
    await audit.record(
        admin_id=admin.id,
        entity_type="referral_code",
        entity_id=code.id,
        action="suspend" if suspend else "reactivate",
        payload={"code": code.code},
        db=db,
    )
    await db.flush()
    return code


async def set_code_tier(
    *, admin: User, code_id: uuid.UUID, tier: ReferralTier, db: AsyncSession
) -> ReferralCode:
    code = await db.get(ReferralCode, code_id)
    if code is None:
        raise NotFoundError("Referral code not found.", code="code_not_found")
    code.tier = tier
    await audit.record(
        admin_id=admin.id,
        entity_type="referral_code",
        entity_id=code.id,
        action="set_tier",
        payload={"code": code.code, "tier": tier.value},
        db=db,
    )
    await db.flush()
    return code


# ---------------------------------------------------------------------------
# Partner applications
# ---------------------------------------------------------------------------


async def list_applications(db: AsyncSession) -> list[ReferralPartnerApplication]:
    return list(
        (
            await db.execute(
                select(ReferralPartnerApplication).order_by(
                    ReferralPartnerApplication.created_at.desc()
                )
            )
        ).scalars().all()
    )


async def approve_application(
    *, admin: User, application_id: uuid.UUID, db: AsyncSession
) -> ReferralPartnerApplication:
    application = await db.get(ReferralPartnerApplication, application_id)
    if application is None:
        raise NotFoundError("Application not found.", code="application_not_found")
    if application.status != ReferralPartnerApplicationStatus.PENDING:
        raise ConflictError("Application already reviewed.", code="already_reviewed")

    code = (
        await db.execute(
            select(ReferralCode).where(ReferralCode.user_id == application.user_id)
        )
    ).scalar_one_or_none()
    if code is None:
        raise NotFoundError("Applicant has no referral code.", code="applicant_code_missing")

    code.tier = ReferralTier.PARTNER
    application.status = ReferralPartnerApplicationStatus.APPROVED
    application.reviewed_by = admin.id
    application.reviewed_at = datetime.now(UTC)
    await audit.record(
        admin_id=admin.id,
        entity_type="referral_partner_application",
        entity_id=application.id,
        action="approve",
        payload={"code": code.code, "user_id": str(application.user_id)},
        db=db,
    )
    await db.flush()
    return application


async def reject_application(
    *, admin: User, application_id: uuid.UUID, note: str | None, db: AsyncSession
) -> ReferralPartnerApplication:
    application = await db.get(ReferralPartnerApplication, application_id)
    if application is None:
        raise NotFoundError("Application not found.", code="application_not_found")
    if application.status != ReferralPartnerApplicationStatus.PENDING:
        raise ConflictError("Application already reviewed.", code="already_reviewed")
    application.status = ReferralPartnerApplicationStatus.REJECTED
    application.review_note = note
    application.reviewed_by = admin.id
    application.reviewed_at = datetime.now(UTC)
    await audit.record(
        admin_id=admin.id,
        entity_type="referral_partner_application",
        entity_id=application.id,
        action="reject",
        payload={"note": note},
        db=db,
    )
    await db.flush()
    return application


# ---------------------------------------------------------------------------
# Runtime config editor (§9, §11 — no deploy)
# ---------------------------------------------------------------------------


async def update_config(*, admin: User, changes: dict, db: AsyncSession) -> ReferralConfig:
    config = await get_config(db)
    applied: dict = {}
    for key, value in changes.items():
        if key not in _EDITABLE_CONFIG_FIELDS or value is None:
            continue
        setattr(config, key, value)
        applied[key] = value

    # Guard: the two reward shares must still sum to 1.
    if "referrer_share" in applied or "payer_cashback_share" in applied:
        total = float(config.referrer_share) + float(config.payer_cashback_share)
        if abs(total - 1.0) > 0.001:
            raise ValidationError(
                "Referrer and payer cashback shares must add up to 100%.",
                code="referral_shares_invalid",
            )

    await audit.record(
        admin_id=admin.id,
        entity_type="referral_config",
        entity_id=config.id,
        action="update_config",
        payload=applied,
        db=db,
    )
    await db.flush()
    return config


# ---------------------------------------------------------------------------
# Payout history
# ---------------------------------------------------------------------------


async def list_all_payouts(db: AsyncSession, *, limit: int = 200) -> list[Payout]:
    return list(
        (
            await db.execute(
                select(Payout).order_by(Payout.created_at.desc()).limit(limit)
            )
        ).scalars().all()
    )
