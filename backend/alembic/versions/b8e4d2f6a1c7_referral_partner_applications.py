"""referral_partner_applications

Campus-partner application table (§2.2). Reviewed manually by an admin; on
approval the applicant's existing referral_code is flagged partner.

Revision ID: b8e4d2f6a1c7
Revises: a7f3c1d9e2b4
Create Date: 2026-06-26 12:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8e4d2f6a1c7"
down_revision: str | Sequence[str] | None = "a7f3c1d9e2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "referral_partner_applications",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("institution", sa.String(length=255), nullable=False),
        sa.Column("position", sa.String(length=255), nullable=False),
        sa.Column("promo_plan", sa.Text(), nullable=False),
        sa.Column("contact_phone", sa.String(length=32), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("payout_bank_code", sa.String(length=20), nullable=True),
        sa.Column("payout_account_number", sa.String(length=20), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", name="referral_partner_application_status"),
            nullable=False,
        ),
        sa.Column("review_note", sa.String(length=1000), nullable=True),
        sa.Column("reviewed_by", sa.UUID(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_referral_partner_applications_user_id"),
        "referral_partner_applications",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_referral_partner_applications_status"),
        "referral_partner_applications",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_referral_partner_applications_status"),
        table_name="referral_partner_applications",
    )
    op.drop_index(
        op.f("ix_referral_partner_applications_user_id"),
        table_name="referral_partner_applications",
    )
    op.drop_table("referral_partner_applications")
    op.execute("DROP TYPE IF EXISTS referral_partner_application_status")
