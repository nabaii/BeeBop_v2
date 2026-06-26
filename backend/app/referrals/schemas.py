"""Pydantic schemas for the referral endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models._enums import PayoutStatus, ReferralCodeStatus, ReferralTier


class MyCodeView(BaseModel):
    """The signed-in user's own code + shareable link (§6.1)."""

    code: str
    share_link: str
    tier: ReferralTier
    status: ReferralCodeStatus


class ApplyCodePayload(BaseModel):
    agreement_id: uuid.UUID
    code: str = Field(..., min_length=1, max_length=32)


class AttributionView(BaseModel):
    """The code (if any) written onto an agreement, and whether it is sealed."""

    agreement_id: str
    code: str
    applied_at: datetime
    sealed: bool


class BalancesView(BaseModel):
    """Header balances on the referrals dashboard (§6.1)."""

    total_earned: float
    available: float
    pending: float
    paid: float


class ActivityItemView(BaseModel):
    """One privacy-safe row in the activity feed (§6.2)."""

    label: str
    state: str
    amount: float | None
    at: datetime


class CashbackItemView(BaseModel):
    """The user's own cashback on a booking they used a code for (§6.3)."""

    amount: float
    state: str
    clears_at: datetime | None
    at: datetime


class DashboardView(BaseModel):
    """Everything the referrals dashboard needs in one round-trip (§6)."""

    code: str
    share_link: str
    tier: ReferralTier
    status: ReferralCodeStatus
    balances: BalancesView
    activity: list[ActivityItemView]
    cashback: list[CashbackItemView]
    min_withdrawal: int
    can_withdraw: bool


class WithdrawPayload(BaseModel):
    """Bank details for a payout request (§7.1)."""

    bank_account_number: str = Field(..., min_length=6, max_length=20)
    bank_code: str = Field(..., min_length=2, max_length=20)


class PayoutView(BaseModel):
    """A withdrawal request and its disbursement state (§7)."""

    id: str
    amount: float
    status: PayoutStatus
    bank_account_number: str | None
    failure_reason: str | None
    created_at: datetime
    settled_at: datetime | None
