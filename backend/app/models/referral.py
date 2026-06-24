"""Referral programme models — codes, attribution, earnings, payouts, config.

Implements the data model in the Beebop Referral System spec (§10). Launch scope:
earnings are created only on completed OFF_CAMPUS (student accommodation)
agreements, but every user receives a code at registration.

The One Inviolable Rule (§1, §9.2) — no retroactive attachment — is enforced in
two places:
  • the application layer never updates a code/transaction link after completion;
  • a database trigger on `referral_attributions` rejects any UPDATE/DELETE once
    the row is sealed (see the R1 migration).
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._enums import (
    PayoutStatus,
    ReferralCodeStatus,
    ReferralEarningState,
    ReferralEarningType,
    ReferralTier,
)
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ReferralCode(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One per user, issued automatically at registration (§2.1)."""

    __tablename__ = "referral_codes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    # Uppercased, globally unique, stored case-folded (compare uppercased).
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    tier: Mapped[ReferralTier] = mapped_column(
        Enum(ReferralTier, name="referral_tier", values_callable=lambda x: [e.value for e in x]),
        default=ReferralTier.STANDARD,
        nullable=False,
    )
    status: Mapped[ReferralCodeStatus] = mapped_column(
        Enum(
            ReferralCodeStatus,
            name="referral_code_status",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ReferralCodeStatus.ACTIVE,
        nullable=False,
        index=True,
    )


class ReferralAttribution(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """The immutable link between a referred user, a code, and the transaction it
    was written onto at checkout (§3, §10).

    Created at checkout (agreement PENDING_PAYMENT). `sealed_at` is stamped when
    the transaction completes; from that moment the database trigger freezes the
    row entirely — the technical expression of the no-retroactive rule.
    """

    __tablename__ = "referral_attributions"

    referred_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    # The code as written onto the transaction (denormalised string per §10 —
    # codes are immutable, so this never drifts from the owner's code).
    code: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    # The transaction the code was written onto. Off-campus only at launch, so
    # this is an agreement. Unique — at most one code per transaction.
    agreement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agreements.id", ondelete="RESTRICT"),
        unique=True,
        index=True,
        nullable=False,
    )
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Non-null once the transaction is complete. Sealing is the only permitted
    # mutation; after it, the trigger blocks all further writes.
    sealed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReferralEarning(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A reward owed to either the referrer or the paying student (§4, §5)."""

    __tablename__ = "referral_earnings"

    beneficiary_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    type: Mapped[ReferralEarningType] = mapped_column(
        Enum(
            ReferralEarningType,
            name="referral_earning_type",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    agreement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agreements.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    attribution_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("referral_attributions.id", ondelete="RESTRICT"),
        index=True,
    )
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    state: Mapped[ReferralEarningState] = mapped_column(
        Enum(
            ReferralEarningState,
            name="referral_earning_state",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ReferralEarningState.PENDING,
        nullable=False,
        index=True,
    )
    # Window end — set at creation to move_in_date + clearing_window_days (§5.2).
    clears_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The payout that settled this earning (set when state -> paid).
    payout_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payouts.id", ondelete="SET NULL"),
        index=True,
    )


class Payout(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A withdrawal request disbursed via Paystack Transfer (§7)."""

    __tablename__ = "payouts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    paystack_transfer_ref: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[PayoutStatus] = mapped_column(
        Enum(PayoutStatus, name="payout_status", values_callable=lambda x: [e.value for e in x]),
        default=PayoutStatus.REQUESTED,
        nullable=False,
        index=True,
    )
    # Payout bank details, validated against the user where possible (§7.1).
    bank_account_number: Mapped[str | None] = mapped_column(String(20))
    bank_code: Mapped[str | None] = mapped_column(String(20))
    bank_account_name: Mapped[str | None] = mapped_column(String(200))
    failure_reason: Mapped[str | None] = mapped_column(String(500))
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReferralConfig(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Single-row runtime configuration for the programme (§9, §11).

    Admin-editable without a deploy. Percentages are stored as fractions
    (0.0350 == 3.5%). Seeded with the relaxed launch values in the R1 migration.
    The no-retroactive rule is deliberately NOT represented here — it is a
    constant, never a toggle.
    """

    __tablename__ = "referral_config"

    # Eligibility & caps
    first_time_purchaser_required: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    per_code_semester_cap: Mapped[int] = mapped_column(Integer, default=25, nullable=False)
    clearing_window_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
    min_withdrawal_naira: Mapped[int] = mapped_column(Integer, default=5000, nullable=False)

    # Reward pool — fraction of transaction value, then split between sides.
    reward_pool_pct: Mapped[float] = mapped_column(Numeric(6, 4), default=0.0350, nullable=False)
    referrer_share: Mapped[float] = mapped_column(Numeric(6, 4), default=0.4000, nullable=False)
    payer_cashback_share: Mapped[float] = mapped_column(
        Numeric(6, 4), default=0.6000, nullable=False
    )

    # Campus-partner tier ladder — referrer's share of pool by cleared referrals
    # this semester (§4.3). Boundaries are inclusive maxima.
    partner_tier1_share: Mapped[float] = mapped_column(Numeric(6, 4), default=0.5000, nullable=False)
    partner_tier2_share: Mapped[float] = mapped_column(Numeric(6, 4), default=0.5500, nullable=False)
    partner_tier3_share: Mapped[float] = mapped_column(Numeric(6, 4), default=0.6000, nullable=False)
    partner_tier1_max: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    partner_tier2_max: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
