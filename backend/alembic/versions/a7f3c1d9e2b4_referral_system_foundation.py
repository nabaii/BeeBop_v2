"""referral_system_foundation

Creates the referral programme schema (spec §10): referral_codes,
referral_attributions, referral_earnings, payouts, and the single-row
referral_config. Adds users.referred_by_code. Seeds the relaxed launch config.

Hard-enforces the no-retroactive-attachment rule (§1, §9.2, §10) with a database
trigger: once a referral_attribution is sealed (transaction complete) it can
never be updated or deleted; before sealing, only `sealed_at` may transition and
the core link fields are frozen.

Revision ID: a7f3c1d9e2b4
Revises: f6a1b2c3d4e5
Create Date: 2026-06-21 12:00:00.000000

"""
from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7f3c1d9e2b4"
down_revision: str | Sequence[str] | None = "f6a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_IMMUTABILITY_FUNCTION = """
CREATE OR REPLACE FUNCTION beebop_referral_attribution_immutable()
RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        IF OLD.sealed_at IS NOT NULL THEN
            RAISE EXCEPTION
                'referral_attribution % is sealed and cannot be deleted', OLD.id;
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE: a sealed row is fully immutable.
    IF OLD.sealed_at IS NOT NULL THEN
        RAISE EXCEPTION
            'referral_attribution % is sealed; no retroactive change permitted', OLD.id;
    END IF;

    -- Before sealing, the core link is still frozen: only sealed_at may be set.
    IF (NEW.referred_user_id IS DISTINCT FROM OLD.referred_user_id
        OR NEW.code IS DISTINCT FROM OLD.code
        OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
        OR NEW.applied_at IS DISTINCT FROM OLD.applied_at) THEN
        RAISE EXCEPTION 'referral_attribution core fields are immutable';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

# Kept as a separate statement — asyncpg cannot run multiple commands in one
# prepared statement, so the function and trigger must execute independently.
_IMMUTABILITY_TRIGGER = """
CREATE TRIGGER trg_referral_attribution_immutable
BEFORE UPDATE OR DELETE ON referral_attributions
FOR EACH ROW EXECUTE FUNCTION beebop_referral_attribution_immutable();
"""


def upgrade() -> None:
    # --- users.referred_by_code (Path A advisory capture) -------------------
    op.add_column(
        "users", sa.Column("referred_by_code", sa.String(length=32), nullable=True)
    )

    # --- referral_codes -----------------------------------------------------
    op.create_table(
        "referral_codes",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column(
            "tier",
            sa.Enum("standard", "partner", name="referral_tier"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("active", "suspended", name="referral_code_status"),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_referral_codes_user_id"), "referral_codes", ["user_id"], unique=True)
    op.create_index(op.f("ix_referral_codes_code"), "referral_codes", ["code"], unique=True)
    op.create_index(op.f("ix_referral_codes_status"), "referral_codes", ["status"], unique=False)

    # --- referral_attributions ---------------------------------------------
    op.create_table(
        "referral_attributions",
        sa.Column("referred_user_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("agreement_id", sa.UUID(), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sealed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["referred_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["agreement_id"], ["agreements.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_referral_attributions_referred_user_id"), "referral_attributions", ["referred_user_id"], unique=False)
    op.create_index(op.f("ix_referral_attributions_code"), "referral_attributions", ["code"], unique=False)
    op.create_index(op.f("ix_referral_attributions_agreement_id"), "referral_attributions", ["agreement_id"], unique=True)

    # --- payouts (created before earnings — earnings FK to payouts) ---------
    op.create_table(
        "payouts",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("paystack_transfer_ref", sa.String(length=200), nullable=True),
        sa.Column(
            "status",
            sa.Enum("requested", "success", "failed", name="payout_status"),
            nullable=False,
        ),
        sa.Column("bank_account_number", sa.String(length=20), nullable=True),
        sa.Column("bank_code", sa.String(length=20), nullable=True),
        sa.Column("bank_account_name", sa.String(length=200), nullable=True),
        sa.Column("failure_reason", sa.String(length=500), nullable=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payouts_user_id"), "payouts", ["user_id"], unique=False)
    op.create_index(op.f("ix_payouts_status"), "payouts", ["status"], unique=False)

    # --- referral_earnings --------------------------------------------------
    op.create_table(
        "referral_earnings",
        sa.Column("beneficiary_user_id", sa.UUID(), nullable=False),
        sa.Column(
            "type",
            sa.Enum("referrer_earning", "payer_cashback", name="referral_earning_type"),
            nullable=False,
        ),
        sa.Column("agreement_id", sa.UUID(), nullable=False),
        sa.Column("attribution_id", sa.UUID(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column(
            "state",
            sa.Enum("pending", "cleared", "paid", "reversed", name="referral_earning_state"),
            nullable=False,
        ),
        sa.Column("clears_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payout_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["beneficiary_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["agreement_id"], ["agreements.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["attribution_id"], ["referral_attributions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payout_id"], ["payouts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_referral_earnings_beneficiary_user_id"), "referral_earnings", ["beneficiary_user_id"], unique=False)
    op.create_index(op.f("ix_referral_earnings_agreement_id"), "referral_earnings", ["agreement_id"], unique=False)
    op.create_index(op.f("ix_referral_earnings_attribution_id"), "referral_earnings", ["attribution_id"], unique=False)
    op.create_index(op.f("ix_referral_earnings_state"), "referral_earnings", ["state"], unique=False)
    op.create_index(op.f("ix_referral_earnings_payout_id"), "referral_earnings", ["payout_id"], unique=False)

    # --- referral_config (single row) --------------------------------------
    op.create_table(
        "referral_config",
        sa.Column("first_time_purchaser_required", sa.Boolean(), nullable=False),
        sa.Column("per_code_semester_cap", sa.Integer(), nullable=False),
        sa.Column("clearing_window_days", sa.Integer(), nullable=False),
        sa.Column("min_withdrawal_naira", sa.Integer(), nullable=False),
        sa.Column("reward_pool_pct", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("referrer_share", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("payer_cashback_share", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("partner_tier1_share", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("partner_tier2_share", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("partner_tier3_share", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("partner_tier1_max", sa.Integer(), nullable=False),
        sa.Column("partner_tier2_max", sa.Integer(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Seed the single config row with the relaxed launch values (§9.3).
    op.execute(
        sa.text(
            """
            INSERT INTO referral_config (
                id, first_time_purchaser_required, per_code_semester_cap,
                clearing_window_days, min_withdrawal_naira, reward_pool_pct,
                referrer_share, payer_cashback_share, partner_tier1_share,
                partner_tier2_share, partner_tier3_share, partner_tier1_max,
                partner_tier2_max
            ) VALUES (
                CAST(:id AS uuid), false, 25, 14, 5000, 0.0350,
                0.4000, 0.6000, 0.5000, 0.5500, 0.6000, 3, 7
            )
            """
        ).bindparams(id=str(uuid.uuid4()))
    )

    # --- immutability trigger (the inviolable rule) ------------------------
    op.execute(_IMMUTABILITY_FUNCTION)
    op.execute(_IMMUTABILITY_TRIGGER)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_referral_attribution_immutable ON referral_attributions")
    op.execute("DROP FUNCTION IF EXISTS beebop_referral_attribution_immutable()")

    op.drop_table("referral_config")

    op.drop_index(op.f("ix_referral_earnings_payout_id"), table_name="referral_earnings")
    op.drop_index(op.f("ix_referral_earnings_state"), table_name="referral_earnings")
    op.drop_index(op.f("ix_referral_earnings_attribution_id"), table_name="referral_earnings")
    op.drop_index(op.f("ix_referral_earnings_agreement_id"), table_name="referral_earnings")
    op.drop_index(op.f("ix_referral_earnings_beneficiary_user_id"), table_name="referral_earnings")
    op.drop_table("referral_earnings")

    op.drop_index(op.f("ix_payouts_status"), table_name="payouts")
    op.drop_index(op.f("ix_payouts_user_id"), table_name="payouts")
    op.drop_table("payouts")

    op.drop_index(op.f("ix_referral_attributions_agreement_id"), table_name="referral_attributions")
    op.drop_index(op.f("ix_referral_attributions_code"), table_name="referral_attributions")
    op.drop_index(op.f("ix_referral_attributions_referred_user_id"), table_name="referral_attributions")
    op.drop_table("referral_attributions")

    op.drop_index(op.f("ix_referral_codes_status"), table_name="referral_codes")
    op.drop_index(op.f("ix_referral_codes_code"), table_name="referral_codes")
    op.drop_index(op.f("ix_referral_codes_user_id"), table_name="referral_codes")
    op.drop_table("referral_codes")

    op.drop_column("users", "referred_by_code")

    # Drop the native enum types now that no table references them.
    for enum_name in (
        "referral_earning_state",
        "referral_earning_type",
        "payout_status",
        "referral_code_status",
        "referral_tier",
    ):
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
