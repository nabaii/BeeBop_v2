"""add_price_period_to_unit_types

Off-campus unit types are priced per billing period (year / session). Store
the period so every price on the platform can show what it covers.

Revision ID: f6a1b2c3d4e5
Revises: e5f6a1b2c3d4
Create Date: 2026-06-11 12:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f6a1b2c3d4e5"
down_revision: str | Sequence[str] | None = "e5f6a1b2c3d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "unit_types",
        sa.Column(
            "price_period",
            sa.String(length=16),
            nullable=False,
            server_default="year",
        ),
    )


def downgrade() -> None:
    op.drop_column("unit_types", "price_period")
