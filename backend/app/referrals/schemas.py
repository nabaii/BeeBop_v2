"""Pydantic schemas for the referral endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models._enums import (
    PayoutStatus,
    ReferralCodeStatus,
    ReferralPartnerApplicationStatus,
    ReferralTier,
)


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


# --- Campus-partner applications (§2.2) ---------------------------------------


class PartnerApplicationPayload(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    institution: str = Field(..., min_length=1, max_length=255)
    position: str = Field(..., min_length=1, max_length=255)
    promo_plan: str = Field(..., min_length=1, max_length=2000)
    contact_phone: str | None = Field(default=None, max_length=32)
    contact_email: str | None = Field(default=None, max_length=255)
    payout_bank_code: str | None = Field(default=None, max_length=20)
    payout_account_number: str | None = Field(default=None, max_length=20)


class PartnerApplicationView(BaseModel):
    id: str
    status: ReferralPartnerApplicationStatus
    institution: str
    position: str
    review_note: str | None
    created_at: datetime
    reviewed_at: datetime | None


# --- Admin management view (§11) ----------------------------------------------


class AdminOverviewView(BaseModel):
    new_users_via_referral: int
    referred_users_booked: int
    rewards_pending: float
    rewards_cleared: float
    rewards_paid: float
    rewards_reversed: float
    active_codes: int
    partner_codes: int
    suspended_codes: int
    pending_applications: int


class AdminCodeView(BaseModel):
    id: str
    code: str
    owner_name: str | None
    tier: ReferralTier
    status: ReferralCodeStatus
    referrals: int
    earned: float
    velocity_flagged: bool


class AdminApplicationView(BaseModel):
    id: str
    user_id: str
    full_name: str
    institution: str
    position: str
    promo_plan: str
    contact_phone: str | None
    contact_email: str | None
    status: ReferralPartnerApplicationStatus
    review_note: str | None
    created_at: datetime
    reviewed_at: datetime | None


class AdminPayoutView(BaseModel):
    id: str
    user_id: str
    amount: float
    status: PayoutStatus
    bank_account_name: str | None
    failure_reason: str | None
    created_at: datetime
    settled_at: datetime | None


class RejectPayload(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class SetTierPayload(BaseModel):
    tier: ReferralTier


class ConfigView(BaseModel):
    first_time_purchaser_required: bool
    per_code_semester_cap: int
    clearing_window_days: int
    min_withdrawal_naira: int
    reward_pool_pct: float
    referrer_share: float
    payer_cashback_share: float
    partner_tier1_share: float
    partner_tier2_share: float
    partner_tier3_share: float
    partner_tier1_max: int
    partner_tier2_max: int


class ConfigUpdatePayload(BaseModel):
    first_time_purchaser_required: bool | None = None
    per_code_semester_cap: int | None = Field(default=None, ge=0)
    clearing_window_days: int | None = Field(default=None, ge=0)
    min_withdrawal_naira: int | None = Field(default=None, ge=0)
    reward_pool_pct: float | None = Field(default=None, ge=0, le=1)
    referrer_share: float | None = Field(default=None, ge=0, le=1)
    payer_cashback_share: float | None = Field(default=None, ge=0, le=1)
    partner_tier1_share: float | None = Field(default=None, ge=0, le=1)
    partner_tier2_share: float | None = Field(default=None, ge=0, le=1)
    partner_tier3_share: float | None = Field(default=None, ge=0, le=1)
    partner_tier1_max: int | None = Field(default=None, ge=0)
    partner_tier2_max: int | None = Field(default=None, ge=0)
