"""add_unit_type_photos

Photos gain an optional owning unit type. A NULL `unit_type_id` is a
property-level photo (the listing gallery, unchanged); a set one belongs to
that unit type's own gallery — off-campus rooms differ from each other, so
each unit type shows its own shots.

Revision ID: d8f1c4a2b6e3
Revises: c7d8e9f0a1b2
Create Date: 2026-07-29 10:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d8f1c4a2b6e3"
down_revision: str | Sequence[str] | None = "c7d8e9f0a1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "listing_photos",
        sa.Column("unit_type_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_listing_photos_unit_type_id", "listing_photos", ["unit_type_id"]
    )
    # Deleting a unit type takes its gallery with it; the listing's own photos
    # (unit_type_id IS NULL) are untouched.
    op.create_foreign_key(
        "fk_listing_photos_unit_type_id",
        "listing_photos",
        "unit_types",
        ["unit_type_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_listing_photos_unit_type_id", "listing_photos", type_="foreignkey"
    )
    op.drop_index("ix_listing_photos_unit_type_id", table_name="listing_photos")
    op.drop_column("listing_photos", "unit_type_id")
