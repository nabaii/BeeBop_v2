"""off-campus seeker visits + 'Book now' reservations

Adds:
  • visits.seeker_preferred_dates — JSONB list of ISO dates carried when a
    seeker self-requests a visit (off-campus "Visit" CTA).
  • reservations table + reservation_status enum — the off-campus "Book now"
    full-term flow (seeker pays the term price upfront via Paystack).

Revision ID: c7d8e9f0a1b2
Revises: b8e4d2f6a1c7
Create Date: 2026-06-29 00:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c7d8e9f0a1b2"
down_revision: str | Sequence[str] | None = "b8e4d2f6a1c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "visits",
        sa.Column(
            "seeker_preferred_dates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )

    op.create_table(
        "reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("listing_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("seeker_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("unit_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending_payment",
                "confirmed",
                "cancelled",
                name="reservation_status",
            ),
            nullable=False,
        ),
        sa.Column("unit_type_name", sa.String(length=100), nullable=False),
        sa.Column("price_period", sa.String(length=16), nullable=False),
        sa.Column("base_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("seeker_fee", sa.Numeric(14, 2), nullable=False),
        sa.Column("owner_fee", sa.Numeric(14, 2), nullable=False),
        sa.Column("grand_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("paystack_reference", sa.String(length=200), nullable=True),
        sa.Column("payment_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["listing_id"], ["listings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["seeker_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["unit_type_id"], ["unit_types.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reservations_listing_id", "reservations", ["listing_id"]
    )
    op.create_index(
        "ix_reservations_seeker_id", "reservations", ["seeker_id"]
    )
    op.create_index(
        "ix_reservations_unit_type_id", "reservations", ["unit_type_id"]
    )
    op.create_index(
        "ix_reservations_status", "reservations", ["status"]
    )


def downgrade() -> None:
    op.drop_index("ix_reservations_status", table_name="reservations")
    op.drop_index("ix_reservations_unit_type_id", table_name="reservations")
    op.drop_index("ix_reservations_seeker_id", table_name="reservations")
    op.drop_index("ix_reservations_listing_id", table_name="reservations")
    op.drop_table("reservations")
    sa.Enum(name="reservation_status").drop(op.get_bind(), checkfirst=True)
    op.drop_column("visits", "seeker_preferred_dates")
