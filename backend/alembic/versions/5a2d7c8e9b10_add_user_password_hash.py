"""add_user_password_hash

Revision ID: 5a2d7c8e9b10
Revises: 1a3f9c2b5e7d
Create Date: 2026-05-28 20:30:00.000000

Adds optional password auth support. Existing OTP-only accounts keep a NULL
password_hash until they set a password or are bootstrapped with one.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5a2d7c8e9b10"
down_revision: str | Sequence[str] | None = "1a3f9c2b5e7d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "password_hash")
