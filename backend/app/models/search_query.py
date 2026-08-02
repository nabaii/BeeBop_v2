"""Seeker search history — the rows behind "Recent queries" on the profile.

The conversational layer keeps its working context in Redis for 30 minutes
(see ``ai_search/session_store.py``). That store is deliberately ephemeral and
is not bound to an account, so it cannot answer "what did I search last week?"
from a profile page. This table is the durable, user-scoped record: one row per
meaningful chat turn, trimmed to the most recent few per user.
"""

import uuid
from typing import Any

from sqlalchemy import Enum, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._enums import ListingCategory
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SearchQuery(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "search_queries"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # The seeker's message verbatim (whitespace-normalised). This is what the
    # profile card renders and what a tap replays into the chat.
    query: Mapped[str] = mapped_column(Text, nullable=False)

    # Lowercased `query`. Stored rather than computed so de-duplicating a
    # re-asked question is an index lookup instead of a lower() scan per row.
    query_key: Mapped[str] = mapped_column(Text, nullable=False)

    intent: Mapped[str] = mapped_column(Text, nullable=False)

    listing_category: Mapped[ListingCategory | None] = mapped_column(
        Enum(
            ListingCategory,
            name="listing_category",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=True,
    )

    result_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Snapshot of the parameters the pipeline extracted for this turn, kept so a
    # stored query can seed browse filters later without re-running the LLM.
    parameters: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        # Serves the "newest N for this user" read, which is the only list query.
        Index("ix_search_queries_user_created", "user_id", "created_at"),
        # Serves the de-duplication lookup on write.
        Index("ix_search_queries_user_key", "user_id", "query_key"),
    )
