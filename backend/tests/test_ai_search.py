"""Focused tests for Sprint 13 conversational search helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import cast

import pytest

from app.ai_search import service
from app.ai_search.schemas import ChatRequestPayload, ExtractedParameters, ResultListingSummary
from app.models._enums import ListingCategory


@dataclass
class _FakeCompletion:
    parsed: dict


class _FakeLLM:
    def __init__(self, payloads: list[dict]) -> None:
        self._payloads = payloads

    async def structured_completion(
        self,
        *,
        system_prompt: str,
        user_message: str,
        json_schema: dict | None = None,
        temperature: float = 0.0,
        model: str | None = None,
    ) -> _FakeCompletion:
        del system_prompt, user_message, json_schema, temperature, model
        return _FakeCompletion(parsed=self._payloads.pop(0))


def _result(
    *,
    listing_id: str,
    title: str,
) -> ResultListingSummary:
    return ResultListingSummary(
        id=listing_id,
        title=title,
        category=ListingCategory.RENT,
        status="fully_verified",
        price=3_200_000,
        district="Wuse 2",
        cover_url=None,
        rating=4.7,
        review_count=6,
        rank_score=82.5,
        rank_signals={"score": 82.5},
    )


@pytest.mark.asyncio
async def test_run_chat_query_persists_session(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    captured: list[ExtractedParameters] = []

    async def fake_execute_search(*, parameters: ExtractedParameters, db) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del db
        captured.append(parameters)
        return [_result(listing_id="listing-1", title="Verified 2-bed in Wuse 2")]

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    llm = _FakeLLM(
        [
            {
                "intent": "search",
                "parameters": {
                    "listing_category": "rent",
                    "raw_query": "a 2-bed in Wuse 2 under 4m",
                    "locations": ["Wuse 2"],
                    "amenities": [],
                    "max_price": 4_000_000,
                    "bedroom_count": 2,
                    "verification_tiers": ["fully_verified", "doc_verified"],
                },
                "missing_parameter_prompt": None,
                "reference_resolution": None,
            }
        ]
    )

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="a 2-bed in Wuse 2 under 4m"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )

    assert response.session_id
    assert response.results[0].title == "Verified 2-bed in Wuse 2"
    assert captured[0].listing_category == ListingCategory.RENT
    assert captured[0].bedroom_count == 2

    state = await service.get_session_state(
        session_id=response.session_id,
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
    )
    assert state.parameters is not None
    assert state.parameters.locations == ["Wuse 2"]
    assert state.last_result_listing_ids == ["listing-1"]
    assert [turn.role for turn in state.turns] == ["user", "assistant"]


@pytest.mark.asyncio
async def test_clarification_reuses_previous_raw_query(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    captured: list[ExtractedParameters] = []

    async def fake_execute_search(*, parameters: ExtractedParameters, db) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del db
        captured.append(parameters)
        return [_result(listing_id="listing-1", title="Verified 2-bed in Wuse 2")]

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    llm = _FakeLLM(
        [
            {
                "intent": "search",
                "parameters": {
                    "listing_category": "rent",
                    "raw_query": "a 2-bed in Wuse 2 under 4m",
                    "locations": ["Wuse 2"],
                    "amenities": [],
                    "max_price": 4_000_000,
                    "bedroom_count": 2,
                    "verification_tiers": ["fully_verified", "doc_verified"],
                },
                "missing_parameter_prompt": None,
                "reference_resolution": None,
            },
            {
                "intent": "clarification",
                "parameters": {
                    "listing_category": None,
                    "raw_query": "ones with a generator",
                    "locations": [],
                    "amenities": [],
                    "verification_tiers": ["fully_verified", "doc_verified"],
                },
                "missing_parameter_prompt": None,
                "reference_resolution": {"kind": "filter", "amenity": "generator"},
            },
        ]
    )

    first = await service.run_chat_query(
        payload=ChatRequestPayload(query="a 2-bed in Wuse 2 under 4m"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )
    second = await service.run_chat_query(
        payload=ChatRequestPayload(
            session_id=first.session_id,
            query="ones with a generator",
        ),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )

    assert second.parameters is not None
    assert second.parameters.raw_query == "a 2-bed in Wuse 2 under 4m"
    assert "power:generator" in second.parameters.amenities
    assert captured[1].raw_query == "a 2-bed in Wuse 2 under 4m"


@pytest.mark.asyncio
async def test_clear_session_removes_saved_state(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    async def fake_execute_search(*, parameters: ExtractedParameters, db) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del parameters, db
        return [_result(listing_id="listing-1", title="Verified 2-bed in Wuse 2")]

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    llm = _FakeLLM(
        [
            {
                "intent": "search",
                "parameters": {
                    "listing_category": "rent",
                    "raw_query": "a 2-bed in Wuse 2 under 4m",
                    "locations": ["Wuse 2"],
                    "amenities": [],
                    "verification_tiers": ["fully_verified", "doc_verified"],
                },
                "missing_parameter_prompt": None,
                "reference_resolution": None,
            }
        ]
    )

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="a 2-bed in Wuse 2 under 4m"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )
    await service.clear_session(
        session_id=response.session_id,
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
    )

    state = await service.get_session_state(
        session_id=response.session_id,
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
    )
    assert state.parameters is None
    assert state.last_result_listing_ids == []
    assert state.turns == []
