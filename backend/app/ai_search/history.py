"""Durable per-user search history behind the profile's "Recent queries" card.

Kept separate from ``session_store`` on purpose: that module holds the live
conversation context in Redis and expires with the session, while this one is
the account-scoped record the profile reads. The two answer different questions
and have different lifetimes.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_search.schemas import RecentQueryView
from app.models._enums import ListingCategory
from app.models.search_query import SearchQuery

# How many queries we keep per user. Deliberately small — the card shows the
# last handful, and search history is personal data we have no reason to hoard.
MAX_HISTORY_ROWS = 20

# Upper bound on stored text. The chat endpoint already caps input at 2,000
# chars; a history row only needs enough to stay recognisable in a list.
MAX_QUERY_CHARS = 500

# Turns that answer a question about a place or a listing are genuine queries
# even when they return no cards, so they earn a history row on their own.
_QUESTION_INTENTS = frozenset({"ask_area_question", "ask_property_question"})


def normalise(query: str) -> str:
    """Collapse whitespace and bound the length, so `"  hostels   near baze "`
    and `"hostels near baze"` are one entry rather than two."""
    return " ".join(query.split())[:MAX_QUERY_CHARS]


def is_recordable(*, intent: str, has_parameters: bool, result_count: int) -> bool:
    """Whether a turn is worth remembering.

    A bare follow-up ("what about cheaper ones") reads as noise in a list that
    has lost its conversation, so a turn only qualifies once it produced
    something standalone: extracted parameters, results, or a direct question.
    """
    if result_count > 0 or has_parameters:
        return True
    return intent in _QUESTION_INTENTS


async def record_query(
    *,
    db: AsyncSession,
    user_id: uuid.UUID,
    query: str,
    intent: str,
    listing_category: ListingCategory | None = None,
    parameters: dict[str, Any] | None = None,
    result_count: int = 0,
) -> None:
    """Store one query, newest-first, de-duplicated and trimmed.

    Commits: the caller (a chat turn) has nothing else pending, and history must
    survive independently of anything the request does afterwards.
    """
    text = normalise(query)
    if not text:
        return
    key = text.lower()

    # Re-asking something moves it back to the top rather than filling the list
    # with near-duplicates, so the card stays a summary of *distinct* searches.
    await db.execute(
        delete(SearchQuery).where(
            SearchQuery.user_id == user_id, SearchQuery.query_key == key
        )
    )

    db.add(
        SearchQuery(
            user_id=user_id,
            query=text,
            query_key=key,
            intent=intent,
            listing_category=listing_category,
            parameters=parameters,
            result_count=result_count,
        )
    )
    await db.flush()
    await _trim(db=db, user_id=user_id)
    await db.commit()


async def _trim(*, db: AsyncSession, user_id: uuid.UUID) -> None:
    """Drop everything past the newest ``MAX_HISTORY_ROWS`` for this user.

    Rows written in the same transaction share ``now()``, so ``id`` breaks the
    tie and keeps the ordering total.
    """
    stale = (
        select(SearchQuery.id)
        .where(SearchQuery.user_id == user_id)
        .order_by(SearchQuery.created_at.desc(), SearchQuery.id.desc())
        .offset(MAX_HISTORY_ROWS)
        .scalar_subquery()
    )
    await db.execute(delete(SearchQuery).where(SearchQuery.id.in_(stale)))


async def list_recent(
    *, db: AsyncSession, user_id: uuid.UUID, limit: int = MAX_HISTORY_ROWS
) -> list[RecentQueryView]:
    stmt = (
        select(SearchQuery)
        .where(SearchQuery.user_id == user_id)
        .order_by(SearchQuery.created_at.desc(), SearchQuery.id.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_view(row) for row in rows]


async def delete_query(
    *, db: AsyncSession, user_id: uuid.UUID, query_id: uuid.UUID
) -> None:
    """Scoped to the owner, so a guessed id cannot delete someone else's row."""
    await db.execute(
        delete(SearchQuery).where(
            SearchQuery.id == query_id, SearchQuery.user_id == user_id
        )
    )
    await db.commit()


async def clear_history(*, db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(delete(SearchQuery).where(SearchQuery.user_id == user_id))
    await db.commit()


def _view(row: SearchQuery) -> RecentQueryView:
    return RecentQueryView(
        id=str(row.id),
        query=row.query,
        intent=row.intent,
        listing_category=row.listing_category,
        result_count=row.result_count,
        parameters=row.parameters,
        created_at=row.created_at,
    )
