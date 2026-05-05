"""add_nin_document_fields

Revision ID: 1a3f9c2b5e7d
Revises: f2272edda78c
Create Date: 2026-05-05 12:00:00.000000

Adds the manual NIN-review fields on `users`. These back the MVP flow where a
landlord uploads a NIN ID image, an admin reviews it from the queue, and either
sets `nin_verified=true` or rejects it with a note. The existing automated
NIMC path (`/users/me/verify-nin`) is unchanged.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "1a3f9c2b5e7d"
down_revision: str | Sequence[str] | None = "f2272edda78c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("nin_document_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "nin_document_uploaded_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column("nin_review_note", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "nin_review_note")
    op.drop_column("users", "nin_document_uploaded_at")
    op.drop_column("users", "nin_document_url")
