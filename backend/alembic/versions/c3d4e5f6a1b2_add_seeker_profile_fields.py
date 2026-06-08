"""add_seeker_profile_fields

Optional self-reported seeker onboarding data: age band, occupation,
budget range, and preferred area. All nullable — the onboarding step is
skippable and these never gate onboarding completion.

Revision ID: c3d4e5f6a1b2
Revises: b2c3d4e5f6a1
Create Date: 2026-06-08 10:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a1b2"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("age_band", sa.String(length=16), nullable=True))
    op.add_column("users", sa.Column("occupation", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("budget_min", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("budget_max", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("preferred_area", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferred_area")
    op.drop_column("users", "budget_max")
    op.drop_column("users", "budget_min")
    op.drop_column("users", "occupation")
    op.drop_column("users", "age_band")
