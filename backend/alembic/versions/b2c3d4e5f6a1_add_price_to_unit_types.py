"""add_price_to_unit_types

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-06-07 12:30:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a1"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "unit_types",
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0.0"),
    )


def downgrade() -> None:
    op.drop_column("unit_types", "price")
