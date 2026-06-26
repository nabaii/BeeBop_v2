"""Referral endpoints — the user's own code, applying a code at checkout, the
user-facing dashboard (§6) and payouts (§7).

The admin management view (§11) lands in a later sprint.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.referrals import payouts, service
from app.referrals.codes import get_or_create_code
from app.referrals.schemas import (
    ActivityItemView,
    ApplyCodePayload,
    AttributionView,
    BalancesView,
    CashbackItemView,
    DashboardView,
    MyCodeView,
    PayoutView,
    WithdrawPayload,
)

router = APIRouter(prefix="/referrals", tags=["referrals"])
settings = get_settings()


def _share_link(code: str) -> str:
    return f"{settings.public_web_base_url.rstrip('/')}/r/{code}"


def _payout_view(payout) -> PayoutView:  # type: ignore[no-untyped-def]
    return PayoutView(
        id=str(payout.id),
        amount=float(payout.amount),
        status=payout.status,
        bank_account_number=payout.bank_account_number,
        failure_reason=payout.failure_reason,
        created_at=payout.created_at,
        settled_at=payout.settled_at,
    )


@router.get("/me/code", response_model=MyCodeView)
async def my_code(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> MyCodeView:
    """The signed-in user's referral code + share link. Issues one lazily for
    any pre-existing account that predates auto-issuance."""
    code = await get_or_create_code(user=user, db=db)
    await db.commit()
    return MyCodeView(
        code=code.code,
        share_link=_share_link(code.code),
        tier=code.tier,
        status=code.status,
    )


@router.post("/apply", response_model=AttributionView)
async def apply_code(
    payload: ApplyCodePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttributionView:
    """Path B — attach a referral code to the seeker's transaction at checkout."""
    attribution = await service.apply_referral_code(
        seeker=user,
        agreement_id=payload.agreement_id,
        raw_code=payload.code,
        db=db,
    )
    await db.commit()
    return AttributionView(
        agreement_id=str(attribution.agreement_id),
        code=attribution.code,
        applied_at=attribution.applied_at,
        sealed=attribution.sealed_at is not None,
    )


@router.get("/agreement/{agreement_id}", response_model=AttributionView | None)
async def agreement_attribution(
    agreement_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttributionView | None:
    """The code currently written onto an agreement, or null. Used by the
    checkout UI to show the applied/locked state."""
    attribution = await service._existing_attribution(agreement_id=agreement_id, db=db)
    if attribution is None:
        return None
    return AttributionView(
        agreement_id=str(attribution.agreement_id),
        code=attribution.code,
        applied_at=attribution.applied_at,
        sealed=attribution.sealed_at is not None,
    )


@router.get("/me/dashboard", response_model=DashboardView)
async def my_dashboard(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> DashboardView:
    """Everything the Referrals dashboard renders (§6): code + link, balances,
    activity feed, cashback, and whether a withdrawal is currently allowed."""
    code = await get_or_create_code(user=user, db=db)
    balances = await service.get_balances(user_id=user.id, db=db)
    activity = await service.get_activity(user_id=user.id, db=db)
    cashback = await service.get_cashback(user_id=user.id, db=db)
    config = await service.get_config(db)
    await db.commit()

    minimum = int(config.min_withdrawal_naira)
    return DashboardView(
        code=code.code,
        share_link=_share_link(code.code),
        tier=code.tier,
        status=code.status,
        balances=BalancesView(
            total_earned=balances.total_earned,
            available=balances.available,
            pending=balances.pending,
            paid=balances.paid,
        ),
        activity=[
            ActivityItemView(label=a.label, state=a.state, amount=a.amount, at=a.at)
            for a in activity
        ],
        cashback=[
            CashbackItemView(
                amount=c.amount, state=c.state, clears_at=c.clears_at, at=c.at
            )
            for c in cashback
        ],
        min_withdrawal=minimum,
        can_withdraw=balances.available >= minimum,
    )


@router.post("/payouts", response_model=PayoutView)
async def request_payout(
    payload: WithdrawPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PayoutView:
    """Withdraw the user's available balance via Paystack Transfer (§7.1).

    A returned payout with status `failed` is a normal outcome — the balance is
    untouched and the user can retry."""
    payout = await payouts.request_withdrawal(
        user=user,
        bank_account_number=payload.bank_account_number,
        bank_code=payload.bank_code,
        db=db,
    )
    await db.commit()
    return _payout_view(payout)


@router.get("/payouts", response_model=list[PayoutView])
async def payout_history(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[PayoutView]:
    """The user's payout history, most recent first (§7.2)."""
    rows = await payouts.list_payouts(user_id=user.id, db=db)
    return [_payout_view(p) for p in rows]
