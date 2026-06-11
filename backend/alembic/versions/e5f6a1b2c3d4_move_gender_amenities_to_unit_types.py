"""move_gender_amenities_to_unit_types

Move gender_tag and amenities from the room level up to the unit-type level.
Seekers browse availability/price per unit type, and a unit type serves one
sex with a fixed amenity set. Existing rooms are backfilled into their unit
type (earliest room wins) before the room columns are dropped.

Revision ID: e5f6a1b2c3d4
Revises: d4e5f6a1b2c3
Create Date: 2026-06-11 10:00:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a1b2c3d4"
down_revision: str | Sequence[str] | None = "d4e5f6a1b2c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The `gender` enum already exists (users.gender, rooms.gender_tag) — reference
# it without trying to (re)create the type.
_gender = postgresql.ENUM("female", "male", "any", name="gender", create_type=False)


def upgrade() -> None:
    op.add_column(
        "unit_types",
        sa.Column("gender_tag", _gender, nullable=False, server_default="any"),
    )
    op.add_column(
        "unit_types",
        sa.Column(
            "amenities",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )

    # Backfill each unit type from its earliest room.
    op.execute(
        """
        UPDATE unit_types ut
        SET gender_tag = sub.gender_tag,
            amenities = sub.amenities
        FROM (
            SELECT DISTINCT ON (unit_type_id)
                   unit_type_id, gender_tag, amenities
            FROM rooms
            ORDER BY unit_type_id, created_at
        ) AS sub
        WHERE ut.id = sub.unit_type_id
        """
    )

    op.drop_column("rooms", "gender_tag")
    op.drop_column("rooms", "amenities")


def downgrade() -> None:
    op.add_column(
        "rooms",
        sa.Column("gender_tag", _gender, nullable=False, server_default="any"),
    )
    op.add_column(
        "rooms",
        sa.Column(
            "amenities",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )

    # Backfill each room from its unit type.
    op.execute(
        """
        UPDATE rooms r
        SET gender_tag = ut.gender_tag,
            amenities = ut.amenities
        FROM unit_types ut
        WHERE r.unit_type_id = ut.id
        """
    )

    op.drop_column("unit_types", "amenities")
    op.drop_column("unit_types", "gender_tag")
