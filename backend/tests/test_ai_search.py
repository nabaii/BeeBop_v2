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
    """Two-stage fake: intent calls pop the queued structured payloads; the
    concierge call (stage two) is keyed off its schema title. By default the
    concierge raises so the deterministic template stands in — tests that care
    about the concierge prose pass ``concierge_reply`` to opt in."""

    def __init__(self, payloads: list[dict], *, concierge_reply: str | None = None) -> None:
        self._payloads = payloads
        self._concierge_reply = concierge_reply
        self.concierge_calls = 0

    async def structured_completion(
        self,
        *,
        system_prompt: str,
        user_message: str,
        json_schema: dict | None = None,
        temperature: float = 0.0,
        model: str | None = None,
    ) -> _FakeCompletion:
        del system_prompt, temperature, model
        if json_schema is not None and json_schema.get("title") == "BeebopConciergeReply":
            self.concierge_calls += 1
            if self._concierge_reply is None:
                raise RuntimeError("concierge not configured")
            return _FakeCompletion(parsed={"reply": self._concierge_reply})
        del user_message
        return _FakeCompletion(parsed=self._payloads.pop(0))


def _result(
    *,
    listing_id: str,
    title: str,
    status: str = "fully_verified",
    price: float | None = 3_200_000,
    rating: float | None = 4.7,
    review_count: int = 6,
    category: ListingCategory = ListingCategory.RENT,
) -> ResultListingSummary:
    return ResultListingSummary(
        id=listing_id,
        title=title,
        category=category,
        status=status,
        price=price,
        district="Wuse 2",
        cover_url=None,
        rating=rating,
        review_count=review_count,
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

    async def fake_execute_search(*, parameters: ExtractedParameters, db, drop_keywords: bool = False) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
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

    async def fake_execute_search(*, parameters: ExtractedParameters, db, drop_keywords: bool = False) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
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
    async def fake_execute_search(*, parameters: ExtractedParameters, db, drop_keywords: bool = False) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
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

    async def fake_execute_search(*, parameters: ExtractedParameters, db, drop_keywords: bool = False) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
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


def test_compute_differentiators_flags_sole_physically_verified() -> None:
    results = [
        _result(listing_id="l1", title="Doc-only flat", status="doc_verified", rating=None, review_count=0),
        _result(listing_id="l2", title="Inspected flat", status="fully_verified", rating=None, review_count=0),
    ]
    facts = service._compute_differentiators(results)
    assert any("Listing 2 (Inspected flat)" in fact and "physically verified" in fact for fact in facts)


def test_compute_differentiators_flags_material_price_gap() -> None:
    results = [
        _result(listing_id="l1", title="Pricey", status="doc_verified", price=5_000_000, rating=None, review_count=0),
        _result(listing_id="l2", title="Affordable", status="doc_verified", price=3_000_000, rating=None, review_count=0),
    ]
    facts = service._compute_differentiators(results)
    # Listing 2 is the cheapest by ₦2,000,000 — well past the 10% threshold.
    assert any("Listing 2 (Affordable)" in fact and "most affordable" in fact for fact in facts)


def test_compute_differentiators_ignores_trivial_price_gap() -> None:
    results = [
        _result(listing_id="l1", title="A", status="doc_verified", price=3_050_000, rating=None, review_count=0),
        _result(listing_id="l2", title="B", status="doc_verified", price=3_000_000, rating=None, review_count=0),
    ]
    facts = service._compute_differentiators(results)
    assert not any("most affordable" in fact for fact in facts)


def test_compute_differentiators_empty_for_single_result() -> None:
    assert service._compute_differentiators([_result(listing_id="l1", title="Only one")]) == []


@pytest.mark.asyncio
async def test_concierge_message_replaces_template(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    async def fake_execute_search(*, parameters: ExtractedParameters, db, drop_keywords: bool = False) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del parameters, db
        return [_result(listing_id="l1", title="Verified 2-bed in Wuse 2")]

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    concierge_text = "Here are two verified two-beds in Wuse 2. Open the first to see more."
    llm = _FakeLLM([_llm_payload()], concierge_reply=concierge_text)

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="a 2-bed in Wuse 2 under 4m"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )

    assert response.assistant_message == concierge_text
    assert response.concierge_prompt_version == prompts.CONCIERGE_PROMPT_VERSION
    assert llm.concierge_calls == 1


@pytest.mark.asyncio
async def test_generic_query_uses_template_but_keeps_result_note(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    """An unconstrained query skips the LLM concierge to save cost, yet the
    deterministic difference note still ships."""

    async def fake_execute_search(*, parameters: ExtractedParameters, db, drop_keywords: bool = False) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del parameters, db
        return [
            _result(listing_id="l1", title="Doc-only flat", status="doc_verified", rating=None, review_count=0),
            _result(listing_id="l2", title="Inspected flat", status="fully_verified", rating=None, review_count=0),
        ]

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    # No location/price/bedroom/amenity → generic.
    llm = _FakeLLM(
        [_llm_payload(parameters={"raw_query": "a house to rent", "locations": []})],
        concierge_reply="should not be used",
    )

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="I'm looking for a house to rent"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )

    assert llm.concierge_calls == 0  # cost saved
    assert response.concierge_prompt_version is None
    assert "I found" in response.assistant_message  # deterministic template
    assert response.result_note is not None
    assert "physically verified" in response.result_note


@pytest.mark.asyncio
async def test_concierge_falls_back_to_template_on_failure(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    async def fake_execute_search(*, parameters: ExtractedParameters, db, drop_keywords: bool = False) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del parameters, db
        return [_result(listing_id="l1", title="Verified 2-bed in Wuse 2")]

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    # concierge_reply=None → the concierge call raises → template stands in.
    llm = _FakeLLM([_llm_payload()])

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="a 2-bed in Wuse 2 under 4m"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )

    assert llm.concierge_calls == 1
    assert "I found" in response.assistant_message  # deterministic template


@pytest.mark.asyncio
async def test_concierge_skipped_for_transactional(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    async def fake_execute_search(*, parameters: ExtractedParameters, db, drop_keywords: bool = False) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del parameters, db
        return [_result(listing_id="l1", title="Verified 2-bed in Wuse 2")]

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    llm = _FakeLLM(
        [
            _llm_payload(
                intent="transactional",
                reference_resolution={
                    "kind": "action",
                    "index": None,
                    "amenity": None,
                    "action_kind": "schedule_visit",
                },
            )
        ],
        concierge_reply="should not be used",
    )

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="schedule a visit"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )

    assert llm.concierge_calls == 0
    assert response.assistant_message != "should not be used"


@pytest.mark.asyncio
async def test_compare_listings(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    async def fake_execute_search(*, parameters: ExtractedParameters, db, drop_keywords: bool = False) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del parameters, db
        return []

    async def fake_summaries_for_ids(*, ids, parameters, db) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del parameters, db
        titles = {"listing-1": "First", "listing-2": "Second"}
        return [_result(listing_id=lid, title=titles[lid]) for lid in ids]

    monkeypatch.setattr(service, "_execute_search", fake_execute_search)
    monkeypatch.setattr(service, "_summaries_for_ids", fake_summaries_for_ids)

    # First turn sets up the session history
    await service.run_chat_query(
        payload=ChatRequestPayload(query="a 2-bed in Wuse 2 under 4m"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", _FakeLLM([_llm_payload()])),  # type: ignore[arg-type]
    )
    
    # Force state to have last_result_listing_ids
    state = await service.get_session_state(session_id="test-session", redis=fake_redis)
    state.last_result_listing_ids = ["listing-1", "listing-2"]
    from app.ai_search.session_store import SessionStore
    await SessionStore(fake_redis).save(state)

    llm = _FakeLLM(
        [_llm_payload(intent="compare_listings")],
        concierge_reply="Here is a comparison.",
    )
    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="compare the top two", session_id="test-session"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )
    assert response.intent == "compare_listings"
    assert len(response.results) == 2
    assert "First" in response.results[0].title
    assert "Second" in response.results[1].title
    assert response.assistant_message == "Here is a comparison."


@pytest.mark.asyncio
async def test_ask_property_question(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    async def fake_summaries_for_ids(*, ids, parameters, db) -> list[ResultListingSummary]:  # type: ignore[no-untyped-def]
        del parameters, db
        return [_result(listing_id=ids[0], title="Test Property")]

    monkeypatch.setattr(service, "_summaries_for_ids", fake_summaries_for_ids)

    llm = _FakeLLM(
        [_llm_payload(intent="ask_property_question", reference_resolution={"kind": "ordinal", "index": 1})],
        concierge_reply="It has a generator.",
    )
    
    state = await service.get_session_state(session_id="test-session", redis=fake_redis)
    state.last_result_listing_ids = ["listing-1"]
    from app.ai_search.session_store import SessionStore
    await SessionStore(fake_redis).save(state)

    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="does the first one have a gen?", session_id="test-session"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )
    assert response.intent == "ask_property_question"
    assert response.assistant_message == "It has a generator."
    assert "Listing: Test Property" in (response.model_dump().get("property_answer") or "")


@pytest.mark.asyncio
async def test_ask_area_question(fake_redis, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    llm = _FakeLLM(
        [_llm_payload(intent="ask_area_question", parameters={"raw_query": "is jabi safe?"})],
        concierge_reply="Jabi is very safe.",
    )
    response = await service.run_chat_query(
        payload=ChatRequestPayload(query="is jabi safe?"),
        db=cast("object", object()),  # type: ignore[arg-type]
        redis=cast("object", fake_redis),  # type: ignore[arg-type]
        llm=cast("object", llm),  # type: ignore[arg-type]
    )
    assert response.intent == "ask_area_question"
    assert response.assistant_message == "Jabi is very safe."
    assert response.model_dump().get("area_answer") is not None
