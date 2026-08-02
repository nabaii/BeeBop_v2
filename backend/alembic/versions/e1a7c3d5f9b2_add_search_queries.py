"""add_search_queries

Durable, user-scoped record of conversational search queries. The Redis session
store stays the working context for a live conversation (30-minute TTL, no
account binding); this table is what the profile's "Recent queries" card reads,
so it has to outlive the session and follow the user across devices.

Reuses the existing `listing_category` Postgres enum — created in the initial
schema — rather than minting a parallel type.

Revision ID: e1a7c3d5f9b2
Revises: d8f1c4a2b6e3
Create Date: 2026-08-02 09:30:00.000000

"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e1a7c3d5f9b2"
down_revision: str | Sequence[str] | None = "d8f1c4a2b6e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "search_queries",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("query_key", sa.Text(), nullable=False),
        sa.Column("intent", sa.Text(), nullable=False),
        sa.Column(
            "listing_category",
            postgresql.ENUM(name="listing_category", create_type=False),
            nullable=True,
        ),
        sa.Column("result_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("parameters", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_search_queries_user_id", "search_queries", ["user_id"])
    # Serves the only list query: newest N for one user.
    op.create_index(
        "ix_search_queries_user_created", "search_queries", ["user_id", "created_at"]
    )
    # Serves the de-duplication lookup performed on every write.
    op.create_index(
        "ix_search_queries_user_key", "search_queries", ["user_id", "query_key"]
    )


def downgrade() -> None:
    op.drop_index("ix_search_queries_user_key", table_name="search_queries")
    op.drop_index("ix_search_queries_user_created", table_name="search_queries")
    op.drop_index("ix_search_queries_user_id", table_name="search_queries")
    op.drop_table("search_queries")
