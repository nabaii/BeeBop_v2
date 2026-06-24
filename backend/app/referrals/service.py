"""Referral attribution at checkout (§3) and the completion hooks (§5).

Launch scope: only OFF_CAMPUS (student accommodation) agreements carry
attribution and earnings. Every other category is a no-op here.

The lifecycle this module owns:
  • apply_referral_code      — Path B, manual entry by the seeker before payment
  • auto_apply_referred_code — Path A, the captured share-link code, at checkout
  • on_transaction_completed — seal the attribution + Path C codeless prompt

Earning creation and clearing land in R3; this sprint stops at a sealed,
immutable attribution.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models._enums import (
    AgreementStatus,
    ListingCategory,
    ReferralCodeStatus,
    ReferralEarningState,
    ReferralEarningType,
    ReferralTier,
)
from app.models.agreement import Agreement
from app.models.listing import Listing
from app.models.offer import Offer
from app.models.referral import (
    ReferralAttribution,
    ReferralCode,
    ReferralConfig,
    ReferralEarning,
)
from app.models.user import User
from app.referrals.codes import normalize_code
from app.referrals.eligibility import (
    REASON_MESSAGES,
    EligibilityFacts,
    check_eligibility,
)
from app.referrals.rewards import resolve_referrer_share, split_rewards

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Config (single-row, admin-editable — §11)
# ---------------------------------------------------------------------------


async def get_config(db: AsyncSession) -> ReferralConfig:
    """The single referral_config row. Seeded by migration; created defensively
    if a fresh environment is missing it."""
    config = (await db.execute(select(ReferralConfig).limit(1))).scalar_one_or_none()
    if config is None:
        config = ReferralConfig()
        db.add(config)
        await db.flush()
    return config


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _semester_bounds(today: date) -> tuple[datetime, datetime]:
    """Calendar-semester window: Jan–Jun or Jul–Dec. Partner tiering and the
    per-code cap are evaluated within the current window (§4.3, §8)."""
    if today.month <= 6:
        start, end = date(today.year, 1, 1), date(today.year, 7, 1)
    else:
        start, end = date(today.year, 7, 1), date(today.year + 1, 1, 1)
    return (
        datetime.combine(start, datetime.min.time(), tzinfo=UTC),
        datetime.combine(end, datetime.min.time(), tzinfo=UTC),
    )


def _is_completed(agreement: Agreement) -> bool:
    """A transaction is complete once payment is confirmed (the seal point)."""
    return agreement.payment_confirmed_at is not None or agreement.status in (
        AgreementStatus.SIGNED,
        AgreementStatus.ACTIVE,
        AgreementStatus.EXPIRED,
        AgreementStatus.TERMINATED,
    )


async def _seeker_for_agreement(*, agreement: Agreement, db: AsyncSession) -> User | None:
    offer = await db.get(Offer, agreement.offer_id)
    if offer is None:
        return None
    return await db.get(User, offer.seeker_id)


async def _existing_attribution(
    *, agreement_id: uuid.UUID, db: AsyncSession
) -> ReferralAttribution | None:
    return (
        await db.execute(
            select(ReferralAttribution).where(
                ReferralAttribution.agreement_id == agreement_id
            )
        )
    ).scalar_one_or_none()


async def _referrals_this_semester(*, code: str, db: AsyncSession) -> int:
    start, end = _semester_bounds(date.today())
    result = await db.execute(
        select(func.count())
        .select_from(ReferralAttribution)
        .where(
            ReferralAttribution.code == code,
            ReferralAttribution.applied_at >= start,
            ReferralAttribution.applied_at < end,
        )
    )
    return int(result.scalar() or 0)


async def _payer_has_prior_transaction(
    *, seeker_id: uuid.UUID, exclude_agreement_id: uuid.UUID, db: AsyncSession
) -> bool:
    """Has this seeker completed any other off-campus transaction before?"""
    result = await db.execute(
        select(func.count())
        .select_from(Agreement)
        .join(Offer, Offer.id == Agreement.offer_id)
        .where(
            Offer.seeker_id == seeker_id,
            Agreement.id != exclude_agreement_id,
            Agreement.payment_confirmed_at.is_not(None),
        )
    )
    return int(result.scalar() or 0) > 0


# ---------------------------------------------------------------------------
# Path B — manual application by the seeker, before payment
# ---------------------------------------------------------------------------


async def apply_referral_code(
    *,
    seeker: User,
    agreement_id: uuid.UUID,
    raw_code: str,
    db: AsyncSession,
) -> ReferralAttribution:
    """Attach a referral code to the seeker's agreement at/before checkout.

    Validates against §3.4. Replaces any unsealed attribution already on the
    agreement (a seeker may correct a typo before paying). Raises ValidationError
    with a stable, user-facing message on any failed check.
    """
    agreement = await db.get(Agreement, agreement_id)
    if agreement is None:
        raise NotFoundError("Agreement not found.", code="agreement_not_found")

    listing = await db.get(Listing, agreement.listing_id)
    offer = await db.get(Offer, agreement.offer_id)
    if listing is None or offer is None:
        raise NotFoundError("Agreement context missing.", code="agreement_context_missing")
    if offer.seeker_id != seeker.id:
        raise ForbiddenError("Not your transaction.", code="not_your_transaction")

    normalized = normalize_code(raw_code)
    code = (
        await db.execute(select(ReferralCode).where(ReferralCode.code == normalized))
    ).scalar_one_or_none()

    facts = await _build_facts(
        agreement=agreement, listing=listing, seeker=seeker, code=code, db=db
    )
    ok, reason = check_eligibility(facts)
    if not ok:
        raise ValidationError(
            REASON_MESSAGES.get(reason or "", "This code cannot be applied."),
            code=f"referral_{reason}",
        )

    assert code is not None  # guaranteed by code_exists in facts

    # Replace any unsealed attribution (the DB trigger blocks changing a sealed
    # one, and freezes core fields pre-seal — so we delete + re-create).
    existing = await _existing_attribution(agreement_id=agreement_id, db=db)
    if existing is not None:
        if existing.sealed_at is not None:
            raise ValidationError(
                REASON_MESSAGES["transaction_completed"],
                code="referral_transaction_completed",
            )
        await db.delete(existing)
        await db.flush()

    attribution = ReferralAttribution(
        referred_user_id=seeker.id,
        code=code.code,
        agreement_id=agreement.id,
        applied_at=datetime.now(UTC),
    )
    db.add(attribution)
    await db.flush()
    return attribution


async def _build_facts(
    *,
    agreement: Agreement,
    listing: Listing,
    seeker: User,
    code: ReferralCode | None,
    db: AsyncSession,
) -> EligibilityFacts:
    config = await get_config(db)

    is_self = False
    if code is not None:
        owner = await db.get(User, code.user_id)
        is_self = code.user_id == seeker.id or (
            owner is not None
            and owner.phone is not None
            and seeker.phone is not None
            and owner.phone == seeker.phone
        )

    referrals = await _referrals_this_semester(code=code.code, db=db) if code else 0

    first_time_required = bool(config.first_time_purchaser_required)
    has_prior = (
        await _payer_has_prior_transaction(
            seeker_id=seeker.id, exclude_agreement_id=agreement.id, db=db
        )
        if first_time_required
        else False
    )

    return EligibilityFacts(
        is_off_campus=listing.category == ListingCategory.OFF_CAMPUS,
        transaction_completed=_is_completed(agreement),
        code_exists=code is not None,
        code_active=code is not None and code.status == ReferralCodeStatus.ACTIVE,
        is_self_referral=is_self,
        referrals_this_semester=referrals,
        per_code_cap=int(config.per_code_semester_cap),
        first_time_purchaser_required=first_time_required,
        payer_has_prior_transaction=has_prior,
    )


# ---------------------------------------------------------------------------
# Path A — auto-apply the captured share-link code at checkout
# ---------------------------------------------------------------------------


async def auto_apply_referred_code(*, agreement: Agreement, db: AsyncSession) -> None:
    """Best-effort: at the PENDING_PAYMENT transition, apply the seeker's
    captured code (`user.referred_by_code`) if they haven't entered one manually.
    Eligibility failures are swallowed — a bad captured code must never block
    signing/checkout."""
    listing = await db.get(Listing, agreement.listing_id)
    if listing is None or listing.category != ListingCategory.OFF_CAMPUS:
        return
    if await _existing_attribution(agreement_id=agreement.id, db=db) is not None:
        return

    seeker = await _seeker_for_agreement(agreement=agreement, db=db)
    if seeker is None or not seeker.referred_by_code:
        return

    try:
        await apply_referral_code(
            seeker=seeker,
            agreement_id=agreement.id,
            raw_code=seeker.referred_by_code,
            db=db,
        )
    except (ValidationError, NotFoundError, ForbiddenError) as exc:
        logger.info(
            "Auto-apply of captured code skipped for agreement %s: %s",
            agreement.id,
            getattr(exc, "code", "unknown"),
        )


# ---------------------------------------------------------------------------
# Completion — seal the attribution (§1) + Path C codeless prompt (§3.3)
# ---------------------------------------------------------------------------


async def on_transaction_completed(
    *, agreement: Agreement, seeker_id: uuid.UUID | None, db: AsyncSession
) -> None:
    """Called from confirm_payment when an off-campus transaction completes.

    Seals the attribution (freezing it for good) or, if the payer used no code,
    fires the Path C prompt so every payer still becomes a distributor.
    """
    attribution = await _existing_attribution(agreement_id=agreement.id, db=db)
    if attribution is not None:
        if attribution.sealed_at is None:
            attribution.sealed_at = datetime.now(UTC)
        # Turn the sealed attribution into pending earnings (§4, §5).
        await _create_earnings(agreement=agreement, attribution=attribution, db=db)
        await db.flush()
        return

    # Path C — no code used. Nudge the payer with their own code.
    if seeker_id is None:
        return
    code = (
        await db.execute(select(ReferralCode).where(ReferralCode.user_id == seeker_id))
    ).scalar_one_or_none()
    if code is None:
        return

    from app.notifications.dispatch import dispatch_notification

    await dispatch_notification(
        user_id=seeker_id,
        event_type="referral.codeless_prompt",
        payload={"code": code.code},
        db=db,
    )


# ---------------------------------------------------------------------------
# Earnings (§4) + clearing (§5)
# ---------------------------------------------------------------------------


def compute_clears_at(
    *, move_in: date | None, window_days: int, now: datetime
) -> datetime:
    """Window end. Keys off move-in (agreement start date) per §5.2; falls back
    to completion time when no move-in date is known."""
    if move_in is not None:
        base = datetime.combine(move_in, datetime.min.time(), tzinfo=UTC)
    else:
        base = now
    return base + timedelta(days=window_days)


async def _cleared_referrals_this_semester(*, code: str, db: AsyncSession) -> int:
    """Count this code's already-cleared referrer earnings this semester — the
    basis for partner-tier escalation (§4.3)."""
    start, end = _semester_bounds(date.today())
    result = await db.execute(
        select(func.count())
        .select_from(ReferralEarning)
        .join(ReferralAttribution, ReferralAttribution.id == ReferralEarning.attribution_id)
        .where(
            ReferralAttribution.code == code,
            ReferralEarning.type == ReferralEarningType.REFERRER_EARNING,
            ReferralEarning.state.in_(
                [ReferralEarningState.CLEARED, ReferralEarningState.PAID]
            ),
            ReferralEarning.created_at >= start,
            ReferralEarning.created_at < end,
        )
    )
    return int(result.scalar() or 0)


async def _create_earnings(
    *, agreement: Agreement, attribution: ReferralAttribution, db: AsyncSession
) -> None:
    """Create the referrer + payer-cashback earnings for a completed, attributed
    transaction. Idempotent — a webhook retry won't double-pay."""
    existing = await db.execute(
        select(func.count())
        .select_from(ReferralEarning)
        .where(ReferralEarning.agreement_id == agreement.id)
    )
    if int(existing.scalar() or 0) > 0:
        return

    code = (
        await db.execute(
            select(ReferralCode).where(ReferralCode.code == attribution.code)
        )
    ).scalar_one_or_none()
    if code is None:
        return

    transaction_value = float(agreement.rendered_data.get("price", 0) or 0)
    if transaction_value <= 0:
        return

    config = await get_config(db)
    is_partner = code.tier == ReferralTier.PARTNER
    cleared = (
        await _cleared_referrals_this_semester(code=code.code, db=db)
        if is_partner
        else 0
    )
    referrer_share = resolve_referrer_share(
        is_partner=is_partner,
        cleared_referrals_this_semester=cleared,
        standard_share=float(config.referrer_share),
        tier1_share=float(config.partner_tier1_share),
        tier2_share=float(config.partner_tier2_share),
        tier3_share=float(config.partner_tier3_share),
        tier1_max=int(config.partner_tier1_max),
        tier2_max=int(config.partner_tier2_max),
    )
    split = split_rewards(
        transaction_value=transaction_value,
        reward_pool_pct=float(config.reward_pool_pct),
        referrer_share_of_pool=referrer_share,
    )
    clears_at = compute_clears_at(
        move_in=agreement.start_date,
        window_days=int(config.clearing_window_days),
        now=datetime.now(UTC),
    )

    db.add(
        ReferralEarning(
            beneficiary_user_id=code.user_id,
            type=ReferralEarningType.REFERRER_EARNING,
            agreement_id=agreement.id,
            attribution_id=attribution.id,
            amount=split.referrer_earning,
            state=ReferralEarningState.PENDING,
            clears_at=clears_at,
        )
    )
    db.add(
        ReferralEarning(
            beneficiary_user_id=attribution.referred_user_id,
            type=ReferralEarningType.PAYER_CASHBACK,
            agreement_id=agreement.id,
            attribution_id=attribution.id,
            amount=split.payer_cashback,
            state=ReferralEarningState.PENDING,
            clears_at=clears_at,
        )
    )
    await db.flush()


async def reverse_earnings_for_agreement(
    *, agreement_id: uuid.UUID, db: AsyncSession, include_cleared: bool = False
) -> int:
    """Void earnings for a cancelled/disputed transaction (§5.2). By default only
    pending earnings (in the window) are reversed; admin dispute handling (R6)
    may also reverse already-cleared ones. Paid earnings are never reversed."""
    states = [ReferralEarningState.PENDING]
    if include_cleared:
        states.append(ReferralEarningState.CLEARED)
    rows = (
        await db.execute(
            select(ReferralEarning).where(
                ReferralEarning.agreement_id == agreement_id,
                ReferralEarning.state.in_(states),
            )
        )
    ).scalars().all()
    now = datetime.now(UTC)
    for earning in rows:
        earning.state = ReferralEarningState.REVERSED
        earning.reversed_at = now
    await db.flush()
    return len(rows)


# ---------------------------------------------------------------------------
# Balances (read model for the dashboard — §6.1)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Balances:
    total_earned: float     # lifetime, excludes reversed
    available: float        # cleared — withdrawable
    pending: float          # still in the clearing window
    paid: float             # already disbursed


async def get_balances(*, user_id: uuid.UUID, db: AsyncSession) -> Balances:
    rows = (
        await db.execute(
            select(
                ReferralEarning.state,
                func.coalesce(func.sum(ReferralEarning.amount), 0),
            )
            .where(ReferralEarning.beneficiary_user_id == user_id)
            .group_by(ReferralEarning.state)
        )
    ).all()
    by_state: dict[str, float] = {}
    for state, total in rows:
        key = state.value if hasattr(state, "value") else str(state)
        by_state[key] = float(total or 0)
    pending = by_state.get("pending", 0.0)
    available = by_state.get("cleared", 0.0)
    paid = by_state.get("paid", 0.0)
    return Balances(
        total_earned=round(pending + available + paid, 2),
        available=available,
        pending=pending,
        paid=paid,
    )
