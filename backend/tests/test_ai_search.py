"""Focused tests for Sprint 13 conversational search helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

import pytest
from pydantic import ValidationError

from app.ai_search import prompts, service
from app.ai_search.schemas import (
    ChatRequestPayload,
    ExtractedParameters,
    LLMResponse,
    ResultListingSummary,
)
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


def _llm_payload(
    *,
    intent: str = "search",
    parameters: dict[str, Any] | None = None,
    missing_parameter_prompt: str | None = None,
    reference_resolution: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base_parameters: dict[str, Any] = {
        "listing_category": "rent",
        "raw_query": "a 2-bed in Wuse 2 under 4m",
        "locations": ["Wuse 2"],
        "amenities": [],
        "min_price": None,
        "max_price": None,
        "bedroom_count": None,
        "verification_tiers": ["fully_verified", "doc_verified", "unverified"],
        "duration_years": None,
        "urgency": None,
    }
    if parameters is not None:
        base_parameters.update(parameters)
    return {
        "intent": intent,
        "parameters": base_parameters,
        "missing_parameter_prompt": missing_parameter_prompt,
        "reference_resolution": reference_resolution,
    }


def _assert_strict_object_schema(schema: dict[str, Any]) -> None:
    if "properties" in schema:
        assert schema.get("type") == "object"
        assert schema.get("additionalProperties") is False
        assert set(schema["required"]) == set(schema["properties"])

    for subschema in schema.get("properties", {}).values():
        _assert_strict_object_schema(subschema)
    if isinstance(schema.get("items"), dict):
        _assert_strict_object_schema(schema["items"])
    for key in ("anyOf", "oneOf", "allOf"):
        for subschema in schema.get(key, []):
            _assert_strict_object_schema(subschema)


def test_response_schema_is_strict_for_structured_outputs() -> None:
    _assert_strict_object_schema(prompts.RESPONSE_SCHEMA)


def test_llm_response_rejects_contract_drift() -> None:
    with pytest.raises(ValidationError):
        LLMResponse.model_validate({**_llm_payload(), "debug": "unexpected"})

    extra_parameter = _llm_payload(parameters={"debug": "unexpected"})
    with pytest.raises(ValidationError):
        LLMResponse.model_validate(extra_parameter)

    invalid_reference = _llm_payload(
        reference_resolution={
            "kind": "price",
            "index": None,
            "amenity": None,
            "action_kind": None,
        }
    )
    with pytest.raises(ValidationError):
        LLMResponse.model_validate(invalid_reference)

    invalid_action = _llm_payload(
        reference_resolution={
            "kind": "action",
            "index": None,
            "amenity": None,
            "action_kind": "pay_now",
        }
    )
    with pytest.raises(ValidationError):
        LLMResponse.model_validate(invalid_action)


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
            _llm_payload(
                parameters={
                    "max_price": 4_000_000,
                    "bedroom_count": 2,
                    "verification_tiers": ["fully_verified", "doc_verified"],
                }
            )
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
            _llm_payload(
                parameters={
                    "max_price": 4_000_000,
                    "bedroom_count": 2,
                    "verification_tiers": ["fully_verified", "doc_verified"],
                }
            ),
            _llm_payload(
                intent="clarification",
                parameters={
                    "listing_category": None,
                    "raw_query": "ones with a generator",
                    "locations": [],
                    "amenities": [],
                    "verification_tiers": ["fully_verified", "doc_verified"],
                },
                reference_resolution={
                    "kind": "filter",
                    "index": None,
                    "amenity": "generator",
                    "action_kind": None,
                },
            ),
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
            _llm_payload(
                parameters={
                    "verification_tiers": ["fully_verified", "doc_verified"],
                }
            )
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


def test_extract_institution_maps_university_references() -> None:
    assert service._extract_institution("nile student accomodation") == "Nile University"
    assert service._extract_institution("hostel near baze") == "Baze University"
    assert service._extract_institution("uniabuja self con") == "University of Abuja"
    # The longer, more specific form resolves to the same canonical name.
    assert (
        service._extract_institution("rooms near nile university of nigeria")
        == "Nile University"
    )
    assert service._extract_institution("2-bed in wuse 2") is None


def test_keyword_extraction_drops_institution_and_generic_terms() -> None:
    # "nile" is handled by the institution filter and "student"/"accommodation"
    # are generic — none should leak into the ILIKE keyword search.
    params = ExtractedParameters(
        raw_query="nile student accomodation",
        institution="Nile University",
    )
    assert service._extract_search_keywords(params) is None


def test_keyword_extraction_keeps_descriptive_terms() -> None:
    params = ExtractedParameters(raw_query="serviced duplex in Wuse 2", locations=["Wuse 2"])
    keywords = service._extract_search_keywords(params)
    assert keywords is not None
    assert "serviced" in keywords
    assert "duplex" in keywords
    assert "wuse" not in keywords  # location handled by the locations filter


@pytest.mark.asyncio
async def test_off_campus_search_passes_institution_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.search.schemas import OffCampusFilters, SearchResponse

    captured: list[OffCampusFilters] = []

    async def fake_search_off_campus(filters: OffCampusFilters, *, db: Any) -> SearchResponse:
        del db
        captured.append(filters)
        return SearchResponse(
            category=ListingCategory.OFF_CAMPUS, total=0, page=1, page_size=48, results=[]
        )

    monkeypatch.setattr(service.public_search, "search_off_campus", fake_search_off_campus)

    params = ExtractedParameters(
        listing_category=ListingCategory.OFF_CAMPUS,
        raw_query="nile student accomodation",
        institution="Nile University",
    )
    await service._search_response(parameters=params, db=cast("object", object()))

    assert captured[0].institution == "Nile University"
    # The school name must not also leak into the free-text keyword filter.
    assert captured[0].q is None


def test_empty_state_advice_is_context_aware() -> None:
    # No filters set → no nonsensical "widen the area/budget/verification" advice.
    bare = ExtractedParameters(
        listing_category=ListingCategory.OFF_CAMPUS,
        raw_query="nile student accomodation",
        institution="Nile University",
        verification_tiers=["fully_verified", "doc_verified", "unverified"],
    )
    message = service._search_message(parameters=bare, results=[])
    assert "Nile University" in message
    assert "verification filter" not in message
    assert "nearby campus or area" in message

    # When the seeker set a budget and verified-only, the advice reflects that.
    constrained = ExtractedParameters(
        listing_category=ListingCategory.RENT,
        raw_query="2-bed under 3m",
        max_price=3_000_000,
        verification_tiers=["fully_verified"],
    )
    constrained_message = service._search_message(parameters=constrained, results=[])
    assert "your budget" in constrained_message
    assert "verification filter" in constrained_message


@pytest.mark.asyncio
async def test_search_relaxes_freetext_on_empty(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:
    """A stray keyword that zeroes the strict search falls back to a relaxed one."""
    calls: list[bool] = []

    async def fake_execute_search(
        *, parameters: ExtractedParameters, db: Any, drop_keywords: bool = False
    ) -> list[ResultListingSummary]:
        del parameters, db
        calls.append(drop_keywords)
        # Strict search (keywords kept) finds nothing; relaxed search does.
        return [] if not drop_keywords else [_result(listing_id="l1", title="Serviced duplex")]

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    llm = _FakeLLM(
        [
            _llm_payload(
                parameters={
                    "raw_query": "serviced duplex with cinema room in Wuse 2",
                    "locations": ["Wuse 2"],
                }
            )
        ]
    )

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="serviced duplex with cinema room in Wuse 2"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )

    assert calls == [False, True]  # strict first, then relaxed
    assert len(response.results) == 1
    assert "close" in response.assistant_message


@pytest.mark.asyncio
async def test_run_chat_query_handles_llm_client_initialization_error(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.exceptions import ExternalServiceError

    def fake_get_llm_client() -> Any:
        raise ExternalServiceError("LLM unconfigured", code="openai_unconfigured")

    monkeypatch.setattr(service, "get_llm_client", fake_get_llm_client)

    async def fake_execute_search(*, parameters: ExtractedParameters, db) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del parameters, db
        return []

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="rent near Baze"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=None,
    )

    assert response.used_fallback is True
    assert response.parameters is not None
    assert response.parameters.listing_category == ListingCategory.OFF_CAMPUS
