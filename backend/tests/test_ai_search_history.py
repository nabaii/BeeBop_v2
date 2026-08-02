"""Tests for durable search history — the profile's "Recent queries" card.

Covers the two decisions that shape what a user sees (which turns are worth
remembering, and how the text is normalised) plus the wiring in `run_chat_query`
that must record for signed-in seekers, skip anonymous visitors, and never let
a history failure break a search.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, cast

import pytest

from app.ai_search import history, service
from app.ai_search.schemas import (
    ChatRequestPayload,
    ExtractedParameters,
    ResultListingSummary,
)
from app.models._enums import ListingCategory
from tests.test_ai_search import _FakeLLM, _llm_payload, _result


@dataclass
class _FakeUser:
    """Stands in for the ORM User — `record_query` only reads `.id`."""

    id: uuid.UUID


def test_normalise_collapses_whitespace_and_bounds_length() -> None:
    assert history.normalise("  hostels   near\tbaze \n") == "hostels near baze"
    assert history.normalise("   ") == ""
    assert len(history.normalise("x" * 5_000)) == history.MAX_QUERY_CHARS


def test_is_recordable_keeps_standalone_turns() -> None:
    # Results or extracted parameters make a turn meaningful on its own.
    assert history.is_recordable(intent="search", has_parameters=True, result_count=0)
    assert history.is_recordable(intent="search", has_parameters=False, result_count=3)
    # A direct question is a real query even when it returns no cards.
    assert history.is_recordable(
        intent="ask_area_question", has_parameters=False, result_count=0
    )
    assert history.is_recordable(
        intent="ask_property_question", has_parameters=False, result_count=0
    )


def test_is_recordable_drops_context_free_followups() -> None:
    # "what about cheaper ones" with nothing extracted is noise in a list that
    # has lost its conversation.
    assert not history.is_recordable(
        intent="clarification", has_parameters=False, result_count=0
    )
    assert not history.is_recordable(
        intent="transactional", has_parameters=False, result_count=0
    )


async def _run_turn(
    *,
    fake_redis: Any,
    monkeypatch: pytest.MonkeyPatch,
    user: _FakeUser | None,
    query: str = "a 2-bed in Wuse 2 under 4m",
) -> list[dict[str, Any]]:
    """Runs one chat turn and returns the history writes it attempted."""
    recorded: list[dict[str, Any]] = []

    async def fake_execute_search(
        *, parameters: ExtractedParameters, db, drop_keywords: bool = False
    ) -> list[ResultListingSummary]:
        del parameters, db, drop_keywords
        return [_result(listing_id="listing-1", title="Verified 2-bed in Wuse 2")]

    async def fake_record_query(**kwargs: Any) -> None:
        recorded.append(kwargs)

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    monkeypatch.setattr(history, "record_query", fake_record_query)

    await service.run_chat_query(
        payload=ChatRequestPayload(query=query),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", _FakeLLM([_llm_payload()])),  # type: ignore[arg-type]
        user=cast("object", user),  # type: ignore[arg-type]
    )
    return recorded


@pytest.mark.asyncio
async def test_signed_in_turn_is_recorded(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    user = _FakeUser(id=uuid.uuid4())
    recorded = await _run_turn(fake_redis=fake_redis, monkeypatch=monkeypatch, user=user)

    assert len(recorded) == 1
    entry = recorded[0]
    assert entry["user_id"] == user.id
    assert entry["query"] == "a 2-bed in Wuse 2 under 4m"
    assert entry["intent"] == "search"
    assert entry["listing_category"] == ListingCategory.RENT
    assert entry["result_count"] == 1
    # The parameter snapshot is stored JSON-ready so it can seed browse filters.
    assert entry["parameters"]["locations"] == ["Wuse 2"]


@pytest.mark.asyncio
async def test_anonymous_turn_is_not_recorded(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    # No account to attach the row to — and the dummy `db` here would blow up if
    # the pipeline tried to write, which is exactly the guarantee we want.
    recorded = await _run_turn(fake_redis=fake_redis, monkeypatch=monkeypatch, user=None)
    assert recorded == []


@pytest.mark.asyncio
async def test_history_failure_does_not_break_the_search(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    async def fake_execute_search(
        *, parameters: ExtractedParameters, db, drop_keywords: bool = False
    ) -> list[ResultListingSummary]:
        del parameters, db, drop_keywords
        return [_result(listing_id="listing-1", title="Verified 2-bed in Wuse 2")]

    async def exploding_record(**kwargs: Any) -> None:
        del kwargs
        raise RuntimeError("database is down")

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    monkeypatch.setattr(history, "record_query", exploding_record)

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="a 2-bed in Wuse 2 under 4m"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", _FakeLLM([_llm_payload()])),  # type: ignore[arg-type]
        user=cast("object", _FakeUser(id=uuid.uuid4())),  # type: ignore[arg-type]
    )

    # The user still gets their results; only the bookkeeping was lost.
    assert response.results[0].title == "Verified 2-bed in Wuse 2"
