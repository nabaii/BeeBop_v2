"""Conversational search service for the Sprint 13 homepage workflow.

The pipeline stays session-scoped in Redis, validates LLM output through
Pydantic, and falls back to deterministic local extraction when the LLM is not
available. Search execution reuses the public-search services so the homepage
and browse pages stay aligned.
"""

from __future__ import annotations

import contextlib
import json
import logging
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from pydantic import ValidationError as PydanticValidationError
from redis.asyncio import Redis

logger = logging.getLogger(__name__)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai_search import prompts, area_knowledge, history
from app.ai_search.schemas import (
    ActionKind,
    ChatRequestPayload,
    ChatResponse,
    ExtractedParameters,
    Intent,
    LLMResponse,
    ReferenceResolution,
    ResultListingSummary,
    SessionStateView,
)
from app.ai_search.session_store import SessionStore, new_session_id
from app.ai_search.vocabulary import (
    ABUJA_LOCATIONS,
    INSTITUTIONS,
    LANDMARKS,
    normalise_location,
)
from app.core.exceptions import ExternalServiceError
from app.integrations.openai_client import (
    LLMClient,
    StubLLMClient,
    get_llm_client,
)
from app.listings.schemas import AMENITY_GROUPS
from app.models._enums import ListingCategory, ListingStatus
from app.models.listing import Listing
from app.models.review import Review
from app.models.user import User
from app.search import service as public_search
from app.search.schemas import (
    OffCampusFilters,
    RentFilters,
    SalesFilters,
    SearchResponse,
    ShortLetFilters,
)

_SEARCH_LIMIT = 48
_CHAT_RESULT_LIMIT = 8
# How many of the top results the concierge actually narrates. The card grid
# still shows every result; this only bounds the prose so it stays scannable.
_CONCIERGE_VIEW_LIMIT = 5
# A price gap only counts as a real differentiator past this fraction of the
# pricier listing — avoids "cheapest by ₦5,000" noise on near-identical homes.
_PRICE_GAP_RATIO = 0.1

# Status values that mean the listing cleared Beebop's on-site inspection.
_PHYSICALLY_VERIFIED_STATUSES = {"fully_verified", "let_agreed", "sale_agreed"}

_ORDINAL_WORDS: dict[str, int] = {
    "first": 1,
    "1st": 1,
    "second": 2,
    "2nd": 2,
    "third": 3,
    "3rd": 3,
    "fourth": 4,
    "4th": 4,
    "fifth": 5,
    "5th": 5,
}

_AMENITY_SYNONYMS: dict[str, str] = {
    "generator": "power:generator",
    "solar": "power:solar",
    "inverter": "power:inverter",
    "prepaid meter": "power:prepaid_meter",
    "borehole": "water:borehole",
    "running water": "water:running_water",
    "water treatment": "water:water_treatment",
    "tank": "water:tank",
    "gated estate": "security:gated_estate",
    "cctv": "security:cctv",
    "perimeter fence": "security:perimeter_fence",
    "security guards": "security:security_guards",
    "guard": "security:security_guards",
    "fibre": "internet:fibre_available",
    "fiber": "internet:fibre_available",
    "wifi": "internet:wifi_included",
    "wi-fi": "internet:wifi_included",
    "private parking": "parking:private_parking",
    "shared parking": "parking:shared_parking",
    "gated parking": "parking:gated_parking",
    "fitted cabinets": "kitchen:fitted_cabinets",
    "gas cooker": "kitchen:gas_cooker",
    "fridge": "kitchen:fridge",
    "microwave": "kitchen:microwave",
    "washing machine": "laundry:washing_machine",
    "dryer": "laundry:dryer",
    "external line": "laundry:external_line",
}

_DEFAULT_VERIFICATION = ["fully_verified", "doc_verified", "unverified"]


@dataclass(frozen=True)
class _HandledTurn:
    assistant_message: str
    parameters: ExtractedParameters | None
    results: list[ResultListingSummary]
    missing_parameter_prompt: str | None
    reference_resolution: ReferenceResolution | None
    next_result_listing_ids: list[str] | None
    property_answer: str | None = None
    area_answer: str | None = None
    suggested_followups: list[str] = field(default_factory=list)


async def run_chat_query(
    *,
    payload: ChatRequestPayload,
    db: AsyncSession,
    redis: Redis,
    llm: LLMClient | None = None,
    user: User | None = None,
) -> ChatResponse:
    store = SessionStore(redis)
    session_id = payload.session_id or new_session_id()
    state = await store.load(session_id)

    llm_client: LLMClient
    try:
        llm_client = llm or get_llm_client()
    except ExternalServiceError as exc:
        logger.warning("Failed to initialize LLM client: %s. Falling back to StubLLMClient.", exc)
        llm_client = StubLLMClient()

    interpreted, used_fallback = await _interpret_query(
        query=payload.query,
        state=state,
        llm=llm_client,
    )

    handled = await _handle_intent(
        interpreted=interpreted,
        state=state,
        db=db,
    )

    # The single most useful distinction across the set, computed
    # deterministically — true and free of LLM cost. Surfaced as a styled note
    # beside the results rather than woven into the prose.
    result_note = _result_note(handled.results)

    # Stage two: hand the deterministic facts to the concierge for warmer,
    # honest prose. The template message that `_handle_intent` produced is the
    # fallback — if the concierge is unconfigured, skipped, or fails, we keep it.
    # Generic, unconstrained searches stay on the template to save LLM cost; the
    # difference note still ships, so they lose little.
    assistant_message = handled.assistant_message
    concierge_version: str | None = None
    if _should_use_concierge(intent=interpreted.intent, handled=handled):
        concierge_message = await _generate_concierge_message(
            intent=interpreted.intent,
            user_message=payload.query,
            results=handled.results,
            session_summary=_session_summary(state),
            llm=llm_client,
            property_answer=handled.property_answer,
            area_answer=handled.area_answer,
        )
        if concierge_message:
            assistant_message = concierge_message
            concierge_version = prompts.CONCIERGE_PROMPT_VERSION

    if handled.parameters is not None:
        state.parameters = handled.parameters
    if handled.next_result_listing_ids is not None:
        state.last_result_listing_ids = handled.next_result_listing_ids

    await store.append_turn(
        state=state,
        role="user",
        content=payload.query,
        intent=interpreted.intent,
    )
    await store.append_turn(
        state=state,
        role="assistant",
        content=assistant_message,
        intent=interpreted.intent,
    )
    await store.save(state)

    # Signed-in seekers get the turn written to their durable history, which is
    # what the profile's "Recent queries" card reads. Anonymous visitors keep
    # the Redis session only — there is no account to attach the row to.
    if user is not None:
        await _record_history(
            db=db,
            user=user,
            query=payload.query,
            intent=interpreted.intent,
            parameters=handled.parameters,
            result_count=len(handled.results),
        )

    query_id = uuid.uuid4().hex
    # Phase-4 attribution: tie behaviour shifts to the exact prompt revisions.
    logger.info(
        "[ai-search] query_id=%s intent=%s prompt_version=%s concierge_version=%s used_fallback=%s",
        query_id,
        interpreted.intent,
        prompts.PROMPT_VERSION,
        concierge_version or "-",
        used_fallback,
    )

    return ChatResponse(
        session_id=session_id,
        intent=interpreted.intent,
        parameters=handled.parameters,
        missing_parameter_prompt=handled.missing_parameter_prompt,
        reference_resolution=handled.reference_resolution,
        assistant_message=assistant_message,
        result_note=result_note,
        results=handled.results,
        used_fallback=used_fallback,
        prompt_version=prompts.PROMPT_VERSION,
        concierge_prompt_version=concierge_version,
        query_id=query_id,
        suggested_followups=handled.suggested_followups,
        property_answer=handled.property_answer,
        area_answer=handled.area_answer,
    )


async def _record_history(
    *,
    db: AsyncSession,
    user: User,
    query: str,
    intent: str,
    parameters: ExtractedParameters | None,
    result_count: int,
) -> None:
    """Write the turn to the seeker's history.

    History is a convenience, never a reason to fail a search the user already
    paid for in latency — every failure mode here is swallowed and logged.
    """
    if not history.is_recordable(
        intent=intent,
        has_parameters=parameters is not None,
        result_count=result_count,
    ):
        return
    try:
        await history.record_query(
            db=db,
            user_id=user.id,
            query=query,
            intent=intent,
            listing_category=parameters.listing_category if parameters else None,
            parameters=parameters.model_dump(mode="json") if parameters else None,
            result_count=result_count,
        )
    except Exception:
        logger.exception("[ai-search] failed to record query history")
        # Leave the session usable for whatever the request does next.
        with contextlib.suppress(Exception):
            await db.rollback()


async def get_session_state(*, session_id: str, redis: Redis) -> SessionStateView:
    return await SessionStore(redis).load(session_id)


async def clear_session(*, session_id: str, redis: Redis) -> None:
    await SessionStore(redis).clear(session_id)


async def record_click(*, query_id: str, listing_id: str) -> None:
    # Reserved for PostHog / warehouse wiring in Phase 4. The API contract
    # lands now so the frontend can emit click-through telemetry safely.
    del query_id, listing_id


async def _interpret_query(
    *,
    query: str,
    state: SessionStateView,
    llm: LLMClient,
) -> tuple[LLMResponse, bool]:
    if isinstance(llm, StubLLMClient):
        return _heuristic_interpretation(query=query, previous=state.parameters), True

    summary = _session_summary(state)
    last_error: Exception | None = None
    for _attempt in range(3):
        try:
            completion = await llm.structured_completion(
                system_prompt=prompts.system_prompt(),
                user_message=prompts.user_message(query=query, session_summary=summary),
                json_schema=prompts.RESPONSE_SCHEMA,
                temperature=0.0,
            )
            response = LLMResponse.model_validate(completion.parsed)
            return response, False
        except PydanticValidationError as exc:
            last_error = exc
        except Exception as exc:
            last_error = exc

    logger.warning(
        "OpenAI structured completion failed after 3 attempts. Falling back to heuristic interpreter. Last error: %s",
        last_error,
        exc_info=True,
    )
    return _heuristic_interpretation(query=query, previous=state.parameters), True


async def _handle_intent(
    *,
    interpreted: LLMResponse,
    state: SessionStateView,
    db: AsyncSession,
) -> _HandledTurn:
    parameters = _merge_parameters(
        previous=state.parameters,
        incoming=interpreted.parameters,
        query=interpreted.parameters.raw_query,
    )

    if interpreted.intent == "information":
        message = _information_message(interpreted.parameters.raw_query)
        return _HandledTurn(
            assistant_message=message,
            parameters=state.parameters,
            results=[],
            missing_parameter_prompt=None,
            reference_resolution=interpreted.reference_resolution,
            next_result_listing_ids=None,
        )

    if interpreted.intent == "clarification":
        return await _handle_clarification(
            interpreted=interpreted,
            parameters=parameters,
            state=state,
            db=db,
        )

    if interpreted.intent == "compare_listings":
        return await _handle_compare(
            interpreted=interpreted,
            parameters=parameters,
            state=state,
            db=db,
        )

    if interpreted.intent == "ask_property_question":
        return await _handle_property_question(
            interpreted=interpreted,
            parameters=parameters,
            state=state,
            db=db,
        )

    if interpreted.intent == "ask_area_question":
        return await _handle_area_question(
            interpreted=interpreted,
            parameters=parameters,
            state=state,
            db=db,
        )

    if interpreted.intent == "transactional":
        return await _handle_transactional(
            interpreted=interpreted,
            parameters=parameters,
            state=state,
            db=db,
        )

    # Search confidence check
    if interpreted.confidence == "low" or (interpreted.confidence == "medium" and interpreted.missing_parameter_prompt):
        prompt = interpreted.missing_parameter_prompt or "Can you tell me a bit more about what you are looking for?"
        
        # If medium confidence, we search anyway but ask the question
        if interpreted.confidence == "medium":
            results, relaxed = await _execute_search_with_fallback(parameters=parameters, db=db)
            if results:
                message = _search_message(parameters=parameters, results=results, relaxed=relaxed)
                return _HandledTurn(
                    assistant_message=message,
                    parameters=parameters,
                    results=results,
                    missing_parameter_prompt=prompt,
                    reference_resolution=interpreted.reference_resolution,
                    next_result_listing_ids=[item.id for item in results],
                    suggested_followups=_suggest_followups(parameters, results),
                )
                
        return _HandledTurn(
            assistant_message=prompt,
            parameters=parameters,
            results=[],
            missing_parameter_prompt=prompt,
            reference_resolution=interpreted.reference_resolution,
            next_result_listing_ids=None,
        )

    results, relaxed = await _execute_search_with_fallback(parameters=parameters, db=db)
    message = _search_message(parameters=parameters, results=results, relaxed=relaxed)
    return _HandledTurn(
        assistant_message=message,
        parameters=parameters,
        results=results,
        missing_parameter_prompt=None,
        reference_resolution=interpreted.reference_resolution,
        next_result_listing_ids=[item.id for item in results],
        suggested_followups=_suggest_followups(parameters, results),
    )


async def _handle_clarification(
    *,
    interpreted: LLMResponse,
    parameters: ExtractedParameters,
    state: SessionStateView,
    db: AsyncSession,
) -> _HandledTurn:
    parameters = _carry_forward_raw_query(parameters=parameters, state=state)
    reference = interpreted.reference_resolution
    if reference is None:
        if parameters.listing_category is None:
            prompt = "Tell me which category you want to refine first."
            return _HandledTurn(
                assistant_message=prompt,
                parameters=parameters,
                results=[],
                missing_parameter_prompt=prompt,
                reference_resolution=None,
                next_result_listing_ids=None,
            )
        results, relaxed = await _execute_search_with_fallback(parameters=parameters, db=db)
        return _HandledTurn(
            assistant_message=_search_message(
                parameters=parameters, results=results, relaxed=relaxed
            ),
            parameters=parameters,
            results=results,
            missing_parameter_prompt=None,
            reference_resolution=None,
            next_result_listing_ids=[item.id for item in results],
        )

    if reference.kind == "filter" and reference.amenity:
        token = _normalise_amenity(reference.amenity)
        if token is not None and token not in parameters.amenities:
            parameters.amenities = [*parameters.amenities, token]
        results = await _execute_search(parameters=parameters, db=db)
        return _HandledTurn(
            assistant_message=_search_message(parameters=parameters, results=results),
            parameters=parameters,
            results=results,
            missing_parameter_prompt=None,
            reference_resolution=reference,
            next_result_listing_ids=[item.id for item in results],
        )

    if reference.kind == "all":
        if parameters.listing_category is None:
            prompt = "Tell me which category you want to search."
            return _HandledTurn(
                assistant_message=prompt,
                parameters=parameters,
                results=[],
                missing_parameter_prompt=prompt,
                reference_resolution=reference,
                next_result_listing_ids=None,
            )
        results, relaxed = await _execute_search_with_fallback(parameters=parameters, db=db)
        return _HandledTurn(
            assistant_message=_search_message(
                parameters=parameters, results=results, relaxed=relaxed
            ),
            parameters=parameters,
            results=results,
            missing_parameter_prompt=None,
            reference_resolution=reference,
            next_result_listing_ids=[item.id for item in results],
        )

    selected = await _resolve_listing_reference(
        reference=reference,
        state=state,
        parameters=parameters,
        db=db,
    )
    if selected is None:
        prompt = "I could not tell which listing you meant. Try saying 'the first one' or ask me to show the results again."
        return _HandledTurn(
            assistant_message=prompt,
            parameters=parameters,
            results=[],
            missing_parameter_prompt=prompt,
            reference_resolution=reference,
            next_result_listing_ids=None,
        )

    return _HandledTurn(
        assistant_message=f"Here is the option you pointed to: {selected.title}.",
        parameters=parameters,
        results=[selected],
        missing_parameter_prompt=None,
        reference_resolution=reference,
        next_result_listing_ids=None,
    )


async def _handle_compare(
    *,
    interpreted: LLMResponse,
    parameters: ExtractedParameters,
    state: SessionStateView,
    db: AsyncSession,
) -> _HandledTurn:
    parameters = _carry_forward_raw_query(parameters=parameters, state=state)

    # Compare the top of what the seeker last saw, in the order they saw it.
    listing_ids = state.last_result_listing_ids[:3]
    results = (
        await _summaries_for_ids(ids=listing_ids, parameters=parameters, db=db)
        if listing_ids
        else []
    )
    if not results:
        prompt = "I don't have any recent results to compare. Tell me what you're looking for first."
        return _HandledTurn(
            assistant_message=prompt,
            parameters=parameters,
            results=[],
            missing_parameter_prompt=prompt,
            reference_resolution=None,
            next_result_listing_ids=None,
        )

    return _HandledTurn(
        assistant_message="Here is a comparison of those options.",
        parameters=parameters,
        results=results,
        missing_parameter_prompt=None,
        reference_resolution=interpreted.reference_resolution,
        next_result_listing_ids=[item.id for item in results],
        suggested_followups=["Which one is cheaper?", "Book inspection for the first"],
    )


async def _handle_property_question(
    *,
    interpreted: LLMResponse,
    parameters: ExtractedParameters,
    state: SessionStateView,
    db: AsyncSession,
) -> _HandledTurn:
    parameters = _carry_forward_raw_query(parameters=parameters, state=state)
    reference = interpreted.reference_resolution
    
    selected = None
    if reference:
        selected = await _resolve_listing_reference(reference=reference, state=state, parameters=parameters, db=db)
    elif state.last_result_listing_ids:
        # Default to the first listing if they didn't specify
        selected = await _resolve_listing_reference(
            reference=ReferenceResolution(kind="ordinal", index=1), 
            state=state, 
            parameters=parameters, 
            db=db
        )
        
    if not selected:
        prompt = "Which listing are you asking about?"
        return _HandledTurn(
            assistant_message=prompt,
            parameters=parameters,
            results=[],
            missing_parameter_prompt=prompt,
            reference_resolution=None,
            next_result_listing_ids=None,
        )
        
    # We pass the question to the concierge along with the listing metadata
    return _HandledTurn(
        assistant_message="Checking the details for you...",
        parameters=parameters,
        results=[selected],
        missing_parameter_prompt=None,
        reference_resolution=reference,
        next_result_listing_ids=[selected.id],
        property_answer=f"Listing: {selected.title}. Type Data: {selected.rank_signals}. Amenities context in DB.",
        suggested_followups=["Book inspection", "Show me something else"],
    )


async def _handle_area_question(
    *,
    interpreted: LLMResponse,
    parameters: ExtractedParameters,
    state: SessionStateView,
    db: AsyncSession,
) -> _HandledTurn:
    parameters = _carry_forward_raw_query(parameters=parameters, state=state)
    
    answer = area_knowledge.get_area_answer(parameters.raw_query)
    
    return _HandledTurn(
        assistant_message=answer,
        parameters=parameters,
        results=[],
        missing_parameter_prompt=None,
        reference_resolution=interpreted.reference_resolution,
        next_result_listing_ids=state.last_result_listing_ids,
        area_answer=answer,
        suggested_followups=["Show me properties there"],
    )


def _suggest_followups(parameters: ExtractedParameters, results: list[ResultListingSummary]) -> list[str]:
    """Contextual quick-tap suggestions based on search state."""
    suggestions = []
    if parameters.listing_category == "off_campus":
        if "female" not in (parameters.gender_preference or ""):
            suggestions.append("Female only")
        suggestions.append("Under 500k")
    elif parameters.listing_category == "rent":
        suggestions.append("Must have a generator")
        suggestions.append("Only verified properties")
    else:
        suggestions.append("Cheaper options")
        suggestions.append("Close to campus")
        
    return suggestions[:3]


async def _handle_transactional(
    *,
    interpreted: LLMResponse,
    parameters: ExtractedParameters,
    state: SessionStateView,
    db: AsyncSession,
) -> _HandledTurn:
    parameters = _carry_forward_raw_query(parameters=parameters, state=state)
    reference = interpreted.reference_resolution
    selected: ResultListingSummary | None = None
    if reference is not None:
        selected = await _resolve_listing_reference(
            reference=reference,
            state=state,
            parameters=parameters,
            db=db,
        )

    action_kind = reference.action_kind if reference is not None else None
    if selected is None and parameters.listing_category is not None:
        results = await _execute_search(parameters=parameters, db=db)
        if results:
            message = _transactional_message(action_kind=action_kind, selected=None)
            return _HandledTurn(
                assistant_message=message,
                parameters=parameters,
                results=results,
                missing_parameter_prompt=None,
                reference_resolution=reference,
                next_result_listing_ids=[item.id for item in results],
            )

    if selected is None:
        prompt = "Tell me which listing you mean so I can point you to the next step."
        return _HandledTurn(
            assistant_message=prompt,
            parameters=parameters,
            results=[],
            missing_parameter_prompt=prompt,
            reference_resolution=reference,
            next_result_listing_ids=None,
        )

    return _HandledTurn(
        assistant_message=_transactional_message(
            action_kind=action_kind,
            selected=selected,
        ),
        parameters=parameters,
        results=[selected],
        missing_parameter_prompt=None,
        reference_resolution=reference,
        next_result_listing_ids=None,
    )


def _merge_parameters(
    *,
    previous: ExtractedParameters | None,
    incoming: ExtractedParameters,
    query: str,
) -> ExtractedParameters:
    heuristic = _heuristic_parameters(query=query, previous=previous)
    base = previous or ExtractedParameters(raw_query=query)
    verification_tiers = (
        incoming.verification_tiers
        if _query_mentions_verification(query)
        else (base.verification_tiers or heuristic.verification_tiers or _DEFAULT_VERIFICATION)
    )

    return ExtractedParameters(
        listing_category=(
            incoming.listing_category
            or heuristic.listing_category
            or base.listing_category
        ),
        raw_query=query,
        locations=_merge_list(
            incoming.locations,
            heuristic.locations,
            base.locations,
            normaliser=normalise_location,
        ),
        institution=_coalesce(
            incoming.institution,
            heuristic.institution,
            base.institution,
        ),
        amenities=_merge_list(
            incoming.amenities,
            heuristic.amenities,
            base.amenities,
            normaliser=lambda value: value.strip().lower(),
        ),
        min_price=_coalesce(incoming.min_price, heuristic.min_price, base.min_price),
        max_price=_coalesce(incoming.max_price, heuristic.max_price, base.max_price),
        bedroom_count=_coalesce(
            incoming.bedroom_count,
            heuristic.bedroom_count,
            base.bedroom_count,
        ),
        verification_tiers=verification_tiers,
        duration_years=_coalesce(
            incoming.duration_years,
            heuristic.duration_years,
            base.duration_years,
        ),
        urgency=incoming.urgency or heuristic.urgency or base.urgency,
        occupancy=incoming.occupancy or heuristic.occupancy or base.occupancy,
        property_type=incoming.property_type or heuristic.property_type or base.property_type,
        furnished=_coalesce(incoming.furnished, heuristic.furnished, base.furnished),
        pet_friendly=_coalesce(incoming.pet_friendly, heuristic.pet_friendly, base.pet_friendly),
        gender_preference=incoming.gender_preference or heuristic.gender_preference or base.gender_preference,
    )


def _session_summary(state: SessionStateView) -> str:
    if state.parameters is None and not state.turns:
        return ""
    lines: list[str] = []
    if state.parameters is not None:
        lines.append(
            "Current search parameters: "
            + state.parameters.model_dump_json(exclude_none=True)
        )
    if state.last_result_listing_ids:
        lines.append(
            f"Last result set ({len(state.last_result_listing_ids)} listings) - "
            + ", ".join(state.last_result_listing_ids[:10])
        )
    if state.turns:
        lines.append("Recent turns:")
        for turn in state.turns[-6:]:
            lines.append(f"  [{turn.role}] {turn.content}")
    return "\n".join(lines)


def _carry_forward_raw_query(
    *,
    parameters: ExtractedParameters,
    state: SessionStateView,
) -> ExtractedParameters:
    if state.parameters is None or not state.parameters.raw_query:
        return parameters
    return parameters.model_copy(update={"raw_query": state.parameters.raw_query})


def _coalesce[T](*values: T | None) -> T | None:
    for value in values:
        if value is not None:
            return value
    return None


def _merge_list(
    primary: list[str],
    secondary: list[str],
    fallback: list[str],
    *,
    normaliser: Callable[[str], str | None],
) -> list[str]:
    values: list[str] = []
    for group in (primary, secondary, fallback):
        for item in group:
            if not item:
                continue
            normalised = normaliser(item)
            if not normalised:
                continue
            if normalised not in values:
                values.append(normalised)
    return values


def _heuristic_interpretation(
    *,
    query: str,
    previous: ExtractedParameters | None,
) -> LLMResponse:
    intent = _heuristic_intent(query)
    parameters = _heuristic_parameters(query=query, previous=previous)
    reference = _heuristic_reference(query)
    missing: str | None = None
    if intent == "search" and parameters.listing_category is None:
        missing = "Which category should I search: off-campus, short-let, rent, or sales?"
    return LLMResponse(
        intent=intent,
        parameters=parameters,
        missing_parameter_prompt=missing,
        reference_resolution=reference,
    )


def _heuristic_intent(query: str) -> Intent:
    lower = query.lower().strip()
    if any(word in lower for word in ("schedule", "visit", "make offer", "offer on", "book", "bookmark", "save this")):
        return "transactional"
    if any(word in lower for word in ("the first", "the second", "the third", "show me all", "ones with", "bigger ones", "cheaper ones")):
        return "clarification"
    if lower.startswith(("how ", "what ", "why ", "is ", "are ", "can ", "do ", "does ")):
        return "information"
    return "search"


def _heuristic_reference(query: str) -> ReferenceResolution | None:
    lower = query.lower()
    for token, index in _ORDINAL_WORDS.items():
        if f"the {token}" in lower or lower == token:
            action_kind = _action_kind(lower)
            return ReferenceResolution(kind="ordinal", index=index, action_kind=action_kind)

    if "show me all" in lower or "all of them" in lower:
        return ReferenceResolution(kind="all", action_kind=_action_kind(lower))

    for phrase, token in _AMENITY_SYNONYMS.items():
        if phrase in lower and ("with" in lower or "having" in lower):
            return ReferenceResolution(kind="filter", amenity=token, action_kind=_action_kind(lower))

    action_kind = _action_kind(lower)
    if action_kind is not None:
        return ReferenceResolution(kind="action", action_kind=action_kind)
    return None


def _action_kind(lower: str) -> ActionKind | None:
    if "visit" in lower or "schedule" in lower:
        return "schedule_visit"
    if "offer" in lower:
        return "make_offer"
    if "book" in lower:
        return "book"
    if "bookmark" in lower or "save" in lower:
        return "bookmark"
    return None


def _heuristic_parameters(
    *,
    query: str,
    previous: ExtractedParameters | None,
) -> ExtractedParameters:
    lower = query.lower()
    min_price, max_price = _extract_price_bounds(lower)
    verification = _extract_verification(lower)
    return ExtractedParameters(
        listing_category=_infer_category(lower, previous=previous),
        raw_query=query,
        locations=_extract_locations(lower),
        institution=_extract_institution(lower),
        amenities=_extract_amenities(lower),
        min_price=min_price,
        max_price=max_price,
        bedroom_count=_extract_bedroom_count(lower),
        verification_tiers=verification or _DEFAULT_VERIFICATION,
        duration_years=_extract_duration_years(lower),
        urgency=_extract_urgency(lower),
        occupancy=previous.occupancy if previous else None,
        property_type=previous.property_type if previous else None,
        furnished=previous.furnished if previous else None,
        pet_friendly=previous.pet_friendly if previous else None,
        gender_preference=previous.gender_preference if previous else None,
    )


# Synonyms tried longest-first so "nile university" wins over the bare "nile"
# (both resolve to the same canonical name, but matching the longer form keeps
# the keyword stripping below precise).
_INSTITUTION_SYNONYMS_BY_LENGTH = sorted(INSTITUTIONS, key=len, reverse=True)


def _extract_institution(lower: str) -> str | None:
    """Map any university reference in the query to its canonical name."""
    for synonym in _INSTITUTION_SYNONYMS_BY_LENGTH:
        if re.search(rf"\b{re.escape(synonym)}\b", lower):
            return INSTITUTIONS[synonym]
    return None


def _infer_category(
    lower: str,
    *,
    previous: ExtractedParameters | None,
) -> ListingCategory | None:
    if any(token in lower for token in ("short-let", "shortlet", "airbnb", "weekend stay", "per night")):
        return ListingCategory.SHORT_LET
    if any(token in lower for token in ("for sale", "buy ", "purchase ", "distress sale", "plot of land", "land for sale")):
        return ListingCategory.SALES
    if any(token in lower for token in ("student", "hostel", "off-campus", "self-con near")):
        return ListingCategory.OFF_CAMPUS
    if any(landmark in lower for landmark in LANDMARKS):
        return ListingCategory.OFF_CAMPUS
    if any(token in lower for token in ("rent", "to let", "lease", "2-bed", "3-bed", "bedroom flat")):
        return ListingCategory.RENT
    # Property-type words in combination with a recognised Abuja location
    # strongly imply a rental search (the most common category).
    _property_type_tokens = (
        "duplex", "bungalow", "penthouse", "terrace", "terraced",
        "detached", "semi-detached", "semi detached", "maisonette",
        "serviced", "furnished", "self-con", "self-contain",
    )
    has_property_type = any(tok in lower for tok in _property_type_tokens)
    has_location = any(loc in lower for loc in ABUJA_LOCATIONS)
    has_bedroom = bool(re.search(r"\b\d+\s*[-]?\s*(?:bed|bedroom|br)\b", lower))
    if has_property_type or (has_location and has_bedroom):
        return ListingCategory.RENT
    return previous.listing_category if previous is not None else None


# Landmarks → nearest district for the location filter.  When a user says
# "near Baze" we inject "Jabi" as a location because that's where Baze sits.
_LANDMARK_DISTRICT: dict[str, str] = {
    "baze": "Jabi",
    "baze university": "Jabi",
    "nile university": "Jabi",
    "nileuni": "Jabi",
    "university of abuja": "Gwagwalada",
    "uniabuja": "Gwagwalada",
    "veritas": "Bwari",
    "national hospital": "Central Area",
    "asokoro hospital": "Asokoro",
    "ceddi plaza": "Central Area",
    "jabi lake mall": "Jabi",
    "shoprite jabi": "Jabi",
}


def _extract_locations(lower: str) -> list[str]:
    locations: list[str] = []
    tokens = re.split(r"[,.;]| near | around | in | at | close to ", lower)
    for token in tokens:
        canonical = normalise_location(token)
        if canonical and canonical not in locations:
            locations.append(canonical)

    # Resolve landmarks to their host district when no explicit location was
    # found (e.g. "near Baze" → "Jabi").
    for landmark, district in _LANDMARK_DISTRICT.items():
        if landmark in lower and district not in locations:
            locations.append(district)
    return locations


def _extract_amenities(lower: str) -> list[str]:
    found: list[str] = []
    for phrase, token in _AMENITY_SYNONYMS.items():
        if phrase in lower and token not in found:
            found.append(token)
    return found


def _extract_bedroom_count(lower: str) -> int | None:
    match = re.search(r"\b(\d+)\s*[-]?\s*(?:bed|beds|bedroom|bedrooms|br)\b", lower)
    if match is None:
        return None
    return int(match.group(1))


def _extract_price_bounds(lower: str) -> tuple[float | None, float | None]:
    between = re.search(
        r"\bbetween\s+([0-9][0-9,]*(?:\.\d+)?[km]?)\s+(?:and|to)\s+([0-9][0-9,]*(?:\.\d+)?[km]?)",
        lower,
    )
    if between is not None:
        return _parse_money(between.group(1)), _parse_money(between.group(2))

    max_match = re.search(
        r"\b(?:under|below|less than|max(?:imum)?|budget of)\s+([0-9][0-9,]*(?:\.\d+)?[km]?)",
        lower,
    )
    min_match = re.search(
        r"\b(?:above|over|at least|from)\s+([0-9][0-9,]*(?:\.\d+)?[km]?)",
        lower,
    )
    return (
        _parse_money(min_match.group(1)) if min_match is not None else None,
        _parse_money(max_match.group(1)) if max_match is not None else None,
    )


def _parse_money(raw: str) -> float | None:
    token = raw.strip().lower().replace(",", "")
    if not token:
        return None
    multiplier = 1.0
    if token.endswith("m"):
        multiplier = 1_000_000.0
        token = token[:-1]
    elif token.endswith("k"):
        multiplier = 1_000.0
        token = token[:-1]
    try:
        value = float(token)
    except ValueError:
        return None
    if multiplier == 1.0 and value < 1_000:
        value *= 1_000.0
    return value * multiplier


def _extract_verification(lower: str) -> list[str]:
    if "unverified" in lower:
        return ["unverified"]
    tiers: list[str] = []
    if "fully verified" in lower:
        tiers.append("fully_verified")
    if "doc verified" in lower or "document verified" in lower:
        tiers.append("doc_verified")
    return tiers


def _query_mentions_verification(query: str) -> bool:
    lower = query.lower()
    return any(
        token in lower
        for token in ("verified", "verification", "unverified", "badge", "doc verified")
    )


def _extract_duration_years(lower: str) -> int | None:
    match = re.search(r"\b(\d+)\s*(?:year|years)\b", lower)
    if match is None:
        return None
    return int(match.group(1))


def _extract_urgency(lower: str) -> str | None:
    if any(token in lower for token in ("immediately", "urgent", "asap", "right away")):
        return "immediate"
    if any(token in lower for token in ("soon", "next month", "this month")):
        return "soon"
    if "flexible" in lower:
        return "flexible"
    return None


async def _execute_search(
    *,
    parameters: ExtractedParameters,
    db: AsyncSession,
    drop_keywords: bool = False,
) -> list[ResultListingSummary]:
    candidates = await _fetch_candidates(
        parameters=parameters, db=db, drop_keywords=drop_keywords
    )
    if not candidates:
        return []
    ratings = await _rating_map(candidates=candidates, db=db)
    video_ids = await public_search._video_listing_ids(
        db, [listing.id for listing in candidates]
    )
    ranked = sorted(
        (
            _result_summary(
                listing=listing,
                parameters=parameters,
                rating=ratings.get(str(listing.id)),
                video_ids=video_ids,
            )
            for listing in candidates
        ),
        key=lambda item: item.rank_score,
        reverse=True,
    )
    return ranked[:_CHAT_RESULT_LIMIT]


async def _execute_search_with_fallback(
    *,
    parameters: ExtractedParameters,
    db: AsyncSession,
) -> tuple[list[ResultListingSummary], bool]:
    """Run the strict search, then relax brittle free-text on a miss.

    Returns ``(results, relaxed)`` where ``relaxed`` is True when results came
    from the keyword-dropped fallback. The structured filters (location, price,
    institution, bedrooms, verification) are always kept; only the free-text
    keyword gate is relaxed, so a single stray or misspelled word can't produce
    a dead-end empty response.
    """
    results = await _execute_search(parameters=parameters, db=db)
    if results:
        return results, False
        
    if _extract_search_keywords(parameters) is not None:
        relaxed = await _execute_search(parameters=parameters, db=db, drop_keywords=True)
        if relaxed:
            return relaxed, True
            
    # Try budget expansion (+30%)
    if parameters.max_price:
        expanded_params = parameters.model_copy(update={"max_price": parameters.max_price * 1.3})
        relaxed = await _execute_search(parameters=expanded_params, db=db, drop_keywords=True)
        if relaxed:
            return relaxed, True
            
    # Try nearby districts
    if parameters.locations:
        expanded_locations = list(parameters.locations)
        for loc in parameters.locations:
            from app.ai_search.vocabulary import nearby_districts
            expanded_locations.extend(nearby_districts(loc))
        expanded_params = parameters.model_copy(update={"locations": list(set(expanded_locations))})
        relaxed = await _execute_search(parameters=expanded_params, db=db, drop_keywords=True)
        if relaxed:
            return relaxed, True
            
    return [], False


async def _fetch_candidates(
    *,
    parameters: ExtractedParameters,
    db: AsyncSession,
    drop_keywords: bool = False,
) -> list[Listing]:
    categories_to_search = [parameters.listing_category] if parameters.listing_category else [
        ListingCategory.RENT, ListingCategory.OFF_CAMPUS, ListingCategory.SALES, ListingCategory.SHORT_LET
    ]
    
    all_results = []
    for cat in categories_to_search:
        param_copy = parameters.model_copy(update={"listing_category": cat})
        response = await _search_response(
            parameters=param_copy, db=db, drop_keywords=drop_keywords
        )
        all_results.extend(response.results)
        
    ids = [uuid.UUID(item.id) for item in all_results]
    if not ids:
        return []

    stmt = (
        select(Listing)
        .where(Listing.id.in_(ids))
        .options(selectinload(Listing.photos), selectinload(Listing.unit_types))
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    by_id = {str(listing.id): listing for listing in rows}
    ordered: list[Listing] = []
    for identifier in all_results:
        listing = by_id.get(identifier.id)
        if listing is not None and listing not in ordered:
            ordered.append(listing)
    return ordered


async def _search_response(
    *,
    parameters: ExtractedParameters,
    db: AsyncSession,
    drop_keywords: bool = False,
) -> SearchResponse:
    # Build a clean keyword string for the ILIKE search instead of using the
    # full conversational raw_query.  The raw_query is a natural-language
    # sentence like "2-bedroom in Wuse 2 under 300k" — passing it verbatim
    # as an ILIKE pattern returns zero rows because no listing title/description
    # contains that exact substring.
    #
    # `drop_keywords` powers the relaxation fallback: when a strict search
    # returns nothing we retry with the brittle free-text terms removed but the
    # high-confidence structured filters (category, location, price, institution)
    # intact, so a stray or misspelled word never zeroes out otherwise-good
    # matches.
    search_keywords = None if drop_keywords else _extract_search_keywords(parameters)
    shared = {
        "q": search_keywords if search_keywords else None,
        "locations": parameters.locations,
        "verification": parameters.verification_tiers or _DEFAULT_VERIFICATION,
        "amenities": parameters.amenities,
        "min_price": parameters.min_price,
        "max_price": parameters.max_price,
        "sort": "relevance",
        "page": 1,
        "page_size": _SEARCH_LIMIT,
    }
    bedroom_counts = (
        [parameters.bedroom_count]
        if parameters.bedroom_count is not None
        else []
    )

    category = parameters.listing_category
    if category == ListingCategory.OFF_CAMPUS:
        return await public_search.search_off_campus(
            OffCampusFilters(**shared, institution=parameters.institution),
            db=db,
        )
    if category == ListingCategory.SHORT_LET:
        return await public_search.search_short_let(
            ShortLetFilters(**shared),
            db=db,
        )
    if category == ListingCategory.SALES:
        return await public_search.search_sales(
            SalesFilters(
                **shared,
                bedroom_counts=bedroom_counts,
            ),
            db=db,
        )
    return await public_search.search_rent(
        RentFilters(
            **shared,
            bedroom_counts=bedroom_counts,
        ),
        db=db,
    )


# Tokens stripped from the raw query before passing to ILIKE.  These are
# either handled by dedicated structured filters or are conversational noise.
_SEARCH_STOPWORDS: set[str] = {
    # Conversational noise
    "show", "me", "find", "get", "looking", "for", "want", "need", "can",
    "you", "i", "a", "an", "the", "and", "or", "with", "in", "at", "near",
    "around", "close", "please", "some", "any", "good", "nice",
    # Category tokens (handled by listing_category filter)
    "rent", "rental", "rentals", "sale", "sales", "buy", "purchase",
    "short", "let", "hostel", "hostels", "student", "students", "airbnb",
    "accommodation", "accomodation", "accom", "lodge", "lodging", "lodgings",
    "university", "uni", "campus", "school", "college",
    # Price tokens (handled by min_price / max_price filter)
    "under", "below", "above", "over", "less", "than", "budget",
    "between", "from", "maximum", "max", "minimum", "min",
    # Generic housing terms
    "house", "houses", "home", "homes", "apartment", "apartments",
    "flat", "flats", "place", "property", "properties", "listing",
    "listings", "options", "room", "rooms", "bedroom", "bedrooms", "bed",
    # Misc
    "verified", "unverified", "fully", "doc", "ones", "that", "are", "is",
    "have", "has", "do", "does", "of", "to", "on", "per", "year", "month",
    "night", "term",
}


def _extract_search_keywords(parameters: ExtractedParameters) -> str | None:
    """Derive a lean keyword string from the raw query for ILIKE matching.

    The public search service runs ``ILIKE %q%`` against title, description,
    and district. Passing the full conversational sentence (e.g.
    "show me 2-bed in Wuse 2 under 300k") returns zero rows because no
    listing contains that exact substring. Instead we strip out:

    * Locations  - already handled by the ``locations`` filter.
    * Prices     - already handled by ``min_price`` / ``max_price``.
    * Categories - already handled by ``listing_category``.
    * Bedroom counts - already handled by ``bedroom_counts``.
    * Stopwords  - conversational filler ("show me", "looking for", etc.).

    What remains are property-descriptive terms like "duplex", "serviced",
    "penthouse", etc. that genuinely narrow listings via ILIKE.
    """
    raw = parameters.raw_query.lower()

    # Remove location tokens so they don't pollute the keyword search.
    for loc in parameters.locations:
        raw = raw.replace(loc.lower(), " ")

    # Remove landmark names (they're resolved to a district in locations,
    # but their raw text shouldn't appear in the ILIKE keywords).
    for landmark in LANDMARKS:
        raw = raw.replace(landmark, " ")

    # Remove university references — they're handled by the structured
    # `institution` filter (against type_data["institutions_accepted"]), so the
    # school name must not leak into the title/description ILIKE keywords.
    for synonym in _INSTITUTION_SYNONYMS_BY_LENGTH:
        raw = re.sub(rf"\b{re.escape(synonym)}\b", " ", raw)

    # Remove price-like tokens (e.g. "300k", "4,000,000", "2m").
    raw = re.sub(r"\b\d[\d,]*(?:\.\d+)?[km]?\b", " ", raw)

    # Remove bedroom patterns (e.g. "2-bed", "3 bedroom").
    raw = re.sub(r"\b\d+\s*[-]?\s*(?:bed|beds|bedroom|bedrooms|br)\b", " ", raw)

    # Tokenise on non-alpha boundaries and filter stopwords.
    tokens = re.split(r"[^a-z]+", raw)
    keywords = [
        tok for tok in tokens
        if tok and len(tok) >= 2 and tok not in _SEARCH_STOPWORDS
    ]

    if not keywords:
        return None
    return " ".join(keywords)


async def _rating_map(
    *,
    candidates: list[Listing],
    db: AsyncSession,
) -> dict[str, tuple[float | None, int]]:
    ids = [listing.id for listing in candidates]
    if not ids:
        return {}
    stmt = (
        select(
            Review.listing_id,
            func.avg(Review.overall_rating),
            func.count(Review.id),
        )
        .where(Review.listing_id.in_(ids))
        .group_by(Review.listing_id)
    )
    rows = (await db.execute(stmt)).all()
    return {
        str(listing_id): (
            float(avg_rating) if avg_rating is not None else None,
            int(review_count),
        )
        for listing_id, avg_rating, review_count in rows
    }


def _as_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _as_int(value: object) -> int | None:
    number = _as_float(value)
    return int(number) if number is not None else None


def _result_summary(
    *,
    listing: Listing,
    parameters: ExtractedParameters,
    rating: tuple[float | None, int] | None,
    video_ids: set[uuid.UUID] | None = None,
) -> ResultListingSummary:
    photos = sorted(listing.photos, key=lambda photo: photo.display_order)
    cover = next((photo for photo in photos if photo.is_cover), None) or (
        photos[0] if photos else None
    )
    secondary = next((photo for photo in photos if photo is not cover), None)
    avg_rating = rating[0] if rating is not None else None
    review_count = rating[1] if rating is not None else 0
    type_data = listing.type_data or {}
    # One source of truth: off-campus uses the cheapest unit's price/period,
    # matching the listing detail and CTA bar. Requires unit_types eager-loaded.
    if listing.category == ListingCategory.OFF_CAMPUS:
        price, price_period = public_search.off_campus_starting_unit(listing)
    else:
        price = float(listing.price) if listing.price is not None else None
        price_period = None

    signals = _rank_signals(
        listing=listing,
        parameters=parameters,
        avg_rating=avg_rating,
        review_count=review_count,
    )
    return ResultListingSummary(
        id=str(listing.id),
        title=listing.title or "Untitled listing",
        category=listing.category,
        status=listing.status.value,
        price=price,
        price_period=price_period,
        district=listing.district,
        cover_url=cover.url if cover is not None else None,
        secondary_url=secondary.url if secondary is not None else None,
        has_video=listing.id in video_ids if video_ids else False,
        rating=avg_rating,
        review_count=review_count,
        bedroom_count=_as_int(type_data.get("bedroom_count")),
        bathroom_count=_as_float(type_data.get("bathroom_count")),
        rank_score=signals["score"],
        rank_signals=signals,
    )


def _rank_signals(
    *,
    listing: Listing,
    parameters: ExtractedParameters,
    avg_rating: float | None,
    review_count: int,
) -> dict[str, float | int | str | None]:
    verification_score = _verification_score(listing.status)
    rating_score = round((avg_rating or 0.0) * 4.0, 2)
    match_score = round(_parameter_match_score(listing=listing, parameters=parameters), 2)
    recency_score = round(_recency_score(listing.created_at), 2)
    price_score = round(_price_score(listing=listing, parameters=parameters), 2)
    total = round(
        verification_score + rating_score + match_score + recency_score + price_score,
        2,
    )
    return {
        "score": total,
        "verification": verification_score,
        "rating": avg_rating,
        "review_count": review_count,
        "parameter_match": match_score,
        "recency": recency_score,
        "price": price_score,
    }


def _verification_score(status: ListingStatus) -> float:
    if status in (ListingStatus.FULLY_VERIFIED, ListingStatus.LET_AGREED, ListingStatus.SALE_AGREED):
        return 40.0
    if status == ListingStatus.DOC_VERIFIED:
        return 28.0
    return 12.0


def _parameter_match_score(
    *,
    listing: Listing,
    parameters: ExtractedParameters,
) -> float:
    score = 0.0
    if parameters.locations and listing.district in parameters.locations:
        score += 8.0

    listing_bedrooms = listing.type_data.get("bedroom_count")
    if parameters.bedroom_count is not None and listing_bedrooms == parameters.bedroom_count:
        score += 6.0

    matched_amenities = 0
    for token in parameters.amenities:
        if _listing_has_amenity(listing=listing, token=token):
            matched_amenities += 1
    score += matched_amenities * 3.0

    haystack = " ".join(
        piece.lower()
        for piece in (
            listing.title or "",
            listing.description or "",
            listing.district or "",
        )
    )
    query_terms = [
        token
        for token in re.split(r"\W+", parameters.raw_query.lower())
        if len(token) >= 4 and token not in {"with", "under", "show", "home", "house", "rent"}
    ]
    overlap = sum(1 for token in query_terms if token and token in haystack)
    score += min(overlap, 4) * 1.5
    return score


def _listing_has_amenity(*, listing: Listing, token: str) -> bool:
    if ":" not in token:
        return False
    group, key = token.split(":", 1)
    group_payload = listing.amenities.get(group)
    if not isinstance(group_payload, dict):
        return False
    entry = group_payload.get(key)
    return isinstance(entry, dict) and bool(entry.get("present"))


def _recency_score(created_at: datetime) -> float:
    age_days = max(
        0.0,
        (datetime.now(UTC) - created_at).total_seconds() / 86_400.0,
    )
    return max(0.0, 10.0 - min(age_days / 10.0, 10.0))


def _price_score(*, listing: Listing, parameters: ExtractedParameters) -> float:
    if listing.price is None:
        return 0.0
    price = float(listing.price)
    score = 0.0
    if parameters.max_price is not None and price <= parameters.max_price:
        if parameters.max_price > 0:
            score += min(4.0, ((parameters.max_price - price) / parameters.max_price) * 4.0)
        else:
            score += 1.0
    if parameters.min_price is not None and price >= parameters.min_price:
        score += 1.0
    return score


async def _resolve_listing_reference(
    *,
    reference: ReferenceResolution,
    state: SessionStateView,
    parameters: ExtractedParameters,
    db: AsyncSession,
) -> ResultListingSummary | None:
    if reference.kind == "ordinal" and reference.index is not None:
        if not state.last_result_listing_ids:
            return None
        zero_based = reference.index - 1
        if zero_based < 0 or zero_based >= len(state.last_result_listing_ids):
            return None
        identifier = state.last_result_listing_ids[zero_based]
        summaries = await _summaries_for_ids(
            ids=[identifier], parameters=parameters, db=db
        )
        return summaries[0] if summaries else None

    if reference.kind == "filter" and reference.amenity:
        token = _normalise_amenity(reference.amenity)
        if token is not None and token not in parameters.amenities:
            parameters.amenities = [*parameters.amenities, token]
        results = await _execute_search(parameters=parameters, db=db)
        return results[0] if results else None

    return None


async def _summaries_for_ids(
    *,
    ids: list[str],
    parameters: ExtractedParameters,
    db: AsyncSession,
) -> list[ResultListingSummary]:
    """Rank a set of known listing ids into result summaries.

    Order follows `ids`, so the ordinals the seeker saw ("the first one")
    keep pointing at the same listing across turns.
    """
    listings = await _listings_by_ids(ids=ids, db=db)
    if not listings:
        return []
    ratings = await _rating_map(candidates=listings, db=db)
    video_ids = await public_search._video_listing_ids(
        db, [listing.id for listing in listings]
    )
    return [
        _result_summary(
            listing=listing,
            parameters=parameters,
            rating=ratings.get(str(listing.id)),
            video_ids=video_ids,
        )
        for listing in listings
    ]


async def _listings_by_ids(*, ids: list[str], db: AsyncSession) -> list[Listing]:
    """Load listings for caller-supplied ids, preserving the caller's order.

    Ids reach here from session state, which can outlive a listing or hold a
    value the current schema no longer produces, so anything that is not a
    UUID is skipped rather than raising.
    """
    parsed: list[uuid.UUID] = []
    for identifier in ids:
        try:
            parsed.append(uuid.UUID(str(identifier)))
        except ValueError:
            continue
    if not parsed:
        return []
    stmt = (
        select(Listing)
        .where(Listing.id.in_(parsed))
        .options(selectinload(Listing.photos), selectinload(Listing.unit_types))
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    by_id = {str(listing.id): listing for listing in rows}
    return [by_id[str(identifier)] for identifier in ids if str(identifier) in by_id]


def _normalise_amenity(raw: str) -> str | None:
    token = raw.strip().lower()
    if token in _AMENITY_SYNONYMS.values():
        return token
    if token in _AMENITY_SYNONYMS:
        return _AMENITY_SYNONYMS[token]
    for group, items in AMENITY_GROUPS.items():
        for item in items:
            if token == item or token == item.replace("_", " "):
                return f"{group}:{item}"
    return None


# --- Concierge response generator -------------------------------------------


def _should_use_concierge(*, intent: Intent, handled: _HandledTurn) -> bool:
    """Run the LLM concierge only where prose adds value.

    Transactional confirmations stay on deterministic templates so an action
    confirmation can never drift. Clarifying questions (missing category, an
    ambiguous reference) also stay deterministic — they are precise prompts,
    not result presentations, and `missing_parameter_prompt` flags them.

    Generic, unconstrained searches ("looking for student accommodation", "a
    house to rent") are the highest-volume queries and gain the least from
    bespoke prose, so they stay on the template to save LLM cost. The
    deterministic difference note still ships with them.
    """
    if intent not in ("search", "clarification", "information", "compare_listings", "ask_property_question", "ask_area_question"):
        return False
    if handled.missing_parameter_prompt is not None:
        return False
    # Answers benefit from natural phrasing regardless of filters — and the
    # property/area handlers hand over raw facts, not seeker-ready prose.
    if intent in ("information", "ask_property_question", "ask_area_question"):
        return True
    return not _is_generic_query(handled.parameters)


def _is_generic_query(parameters: ExtractedParameters | None) -> bool:
    """A query is generic when the seeker named only a category (or less) — no
    location, institution, budget, bedroom count, or amenity to tailor around."""
    if parameters is None:
        return True
    return not (
        parameters.locations
        or parameters.institution
        or parameters.amenities
        or parameters.min_price is not None
        or parameters.max_price is not None
        or parameters.bedroom_count is not None
    )


def _result_note(results: list[ResultListingSummary]) -> str | None:
    """The single most useful distinction across the set, or None. Deterministic
    by design — surfaced as a styled note, never authored by the model."""
    facts = _compute_differentiators(results)
    return facts[0] if facts else None


async def _generate_concierge_message(
    *,
    intent: Intent,
    user_message: str,
    results: list[ResultListingSummary],
    session_summary: str,
    llm: LLMClient,
    property_answer: str | None = None,
    area_answer: str | None = None,
) -> str | None:
    """Turn the deterministic facts into warm concierge prose.

    Returns ``None`` whenever we should keep the template message: the dev stub
    (no API key) and any LLM failure. The caller treats the template it already
    built as the fallback, so the chat never breaks on a flaky model.
    """
    if isinstance(llm, StubLLMClient):
        return None

    narrated = results[:_CONCIERGE_VIEW_LIMIT]
    payload = {
        "intent": intent,
        "user_message": user_message,
        "context": session_summary or None,
        "results": [
            _concierge_result_view(item, index)
            for index, item in enumerate(narrated, start=1)
        ],
        "differentiators": _compute_differentiators(narrated),
        "property_answer": property_answer,
        "area_answer": area_answer,
    }
    try:
        completion = await llm.structured_completion(
            system_prompt=prompts.concierge_system_prompt(),
            user_message=prompts.concierge_user_message(
                payload_json=json.dumps(payload, ensure_ascii=False)
            ),
            json_schema=prompts.CONCIERGE_RESPONSE_SCHEMA,
            temperature=0.4,
        )
    except Exception:
        logger.warning("Concierge generation failed; using template message.", exc_info=True)
        return None

    reply = completion.parsed.get("reply") if isinstance(completion.parsed, dict) else None
    if not isinstance(reply, str):
        return None
    reply = reply.strip()
    return reply or None


def _concierge_result_view(result: ResultListingSummary, index: int) -> dict[str, object]:
    """Sanitized, narration-only projection. We never hand raw ORM rows or
    internal ranking signals to the concierge — only the facts a seeker sees."""
    view: dict[str, object] = {
        "index": index,
        "title": result.title,
        "verification": _verification_label(result.status),
    }
    price = _format_listing_price(result)
    if price is not None:
        view["price"] = price
    if result.district:
        view["district"] = result.district
    if result.bedroom_count is not None:
        view["bedrooms"] = result.bedroom_count
    if result.bathroom_count is not None:
        view["bathrooms"] = result.bathroom_count
    if result.rating is not None and result.review_count > 0:
        view["rating"] = result.rating
        view["review_count"] = result.review_count
    return view


def _verification_label(status: str) -> str:
    if status in _PHYSICALLY_VERIFIED_STATUSES:
        return "physically verified"
    if status == "doc_verified":
        return "document verified"
    return "unverified"


def _format_listing_price(result: ResultListingSummary) -> str | None:
    if result.price is None:
        return None
    amount = f"₦{result.price:,.0f}"
    if result.category == ListingCategory.SHORT_LET:
        return f"{amount}/night"
    if result.category == ListingCategory.RENT:
        return f"{amount}/year"
    if result.category == ListingCategory.OFF_CAMPUS:
        period = result.price_period or "year"
        return f"from {amount}/{period}"
    return amount


def _compute_differentiators(results: list[ResultListingSummary]) -> list[str]:
    """Deterministic facts about how the narrated results differ, ordered by
    usefulness. The concierge phrases at most one — but computing them here
    (not in the model) keeps comparisons true to the data, never hallucinated."""
    if len(results) < 2:
        return []

    # 1-based positions match the order the seeker sees, and the `index` we
    # hand the concierge in each result view.
    indexed = list(enumerate(results, start=1))
    facts: list[str] = []

    physically_verified = [
        (pos, item) for pos, item in indexed if item.status in _PHYSICALLY_VERIFIED_STATUSES
    ]
    if len(physically_verified) == 1:
        pos, only = physically_verified[0]
        facts.append(
            f"Listing {pos} ({only.title}) is the only one Beebop has physically verified."
        )

    priced = sorted(
        ((pos, item) for pos, item in indexed if item.price is not None),
        key=lambda pair: pair[1].price or 0.0,
    )
    if len(priced) >= 2:
        (cheap_pos, cheapest), (_, runner_up) = priced[0], priced[1]
        gap = (runner_up.price or 0.0) - (cheapest.price or 0.0)
        if runner_up.price and gap >= _PRICE_GAP_RATIO * runner_up.price:
            facts.append(
                f"Listing {cheap_pos} ({cheapest.title}) is the most affordable, "
                f"by about ₦{gap:,.0f}."
            )

    rated = [
        (pos, item)
        for pos, item in indexed
        if item.rating is not None and item.review_count > 0
    ]
    if len(rated) >= 2:
        top_pos, top = max(rated, key=lambda pair: pair[1].rating or 0.0)
        others = [item.rating or 0.0 for pos, item in rated if pos != top_pos]
        if others and (top.rating or 0.0) - max(others) >= 0.5:
            facts.append(
                f"Listing {top_pos} ({top.title}) has the strongest reviews "
                f"at {top.rating:.1f}."
            )

    return facts


def _search_message(
    *,
    parameters: ExtractedParameters,
    results: list[ResultListingSummary],
    relaxed: bool = False,
) -> str:
    category = _category_label(parameters.listing_category)
    near = f" near {parameters.institution}" if parameters.institution else ""
    where = ""
    if parameters.locations:
        where = f" in {', '.join(parameters.locations)}"
    budget = _budget_label(parameters)
    scope = f"{near}{where}{budget}"

    if not results:
        return f"I could not find any {category}{scope} yet.{_empty_state_advice(parameters)}"

    if relaxed:
        return (
            f"I could not find an exact match{scope}, but here are {len(results)} "
            f"close {category} you might like. You can ask for a specific one, "
            "compare amenities, or open the full browse view."
        )

    selected_tiers = set(parameters.verification_tiers or [])
    qualifier = "verified " if selected_tiers and "unverified" not in selected_tiers else ""
    return (
        f"I found {len(results)} {qualifier}{category}{scope}. "
        "You can ask for a specific one, compare amenities, or open the full browse view."
    )


def _empty_state_advice(parameters: ExtractedParameters) -> str:
    """Suggest relaxing only the filters the seeker actually set.

    The previous copy always told seekers to "widen the area, budget, or
    verification filter" even when they had set none of those — which read as
    robotic and unhelpful. This tailors the advice to the real constraints.
    """
    levers: list[str] = []
    if parameters.institution:
        levers.append("a nearby campus or area")
    if parameters.locations:
        levers.append("a different area")
    if parameters.min_price is not None or parameters.max_price is not None:
        levers.append("your budget")
    if parameters.bedroom_count is not None:
        levers.append("the bedroom count")
    tiers = set(parameters.verification_tiers or [])
    if tiers and "unverified" not in tiers:
        levers.append("the verification filter")

    if not levers:
        return " New listings go live regularly, so check back soon or try a different area or category."
    if len(levers) == 1:
        return f" Try adjusting {levers[0]}."
    return f" Try adjusting {', '.join(levers[:-1])} or {levers[-1]}."


def _transactional_message(
    *,
    action_kind: ActionKind | None,
    selected: ResultListingSummary | None,
) -> str:
    subject = (
        f"{selected.title}. Open the listing to continue."
        if selected is not None
        else "Choose one of these listings and open it to continue."
    )
    if action_kind == "schedule_visit":
        return f"I matched the listing for your visit request: {subject}"
    if action_kind == "make_offer":
        return f"I matched the listing for your offer flow: {subject}"
    if action_kind == "book":
        return f"I matched the listing for your booking flow: {subject}"
    if action_kind == "bookmark":
        return f"I matched the listing you want to save: {subject}"
    return f"I found the listing you are referring to: {subject}"


def _information_message(query: str) -> str:
    lower = query.lower()
    if "verif" in lower or "badge" in lower:
        return (
            "Beebop uses two badges. Doc Verified means the title documents were approved. "
            "Fully Verified means the listing also passed Beebop's physical inspection."
        )
    if "category" in lower or "what can i find" in lower:
        return (
            "Beebop covers four categories: off-campus accommodation, short-let stays, homes for rent, and homes for sale."
        )
    if "visit" in lower or "offer" in lower or "book" in lower:
        return (
            "Once you open a listing, Beebop can guide you into visits, offers, agreements, or short-let booking depending on the category."
        )
    return (
        "I can help you search Beebop listings across off-campus, short-let, rent, and sales. "
        "Tell me the category, location, and budget you want."
    )


def _category_label(category: ListingCategory | None) -> str:
    if category == ListingCategory.OFF_CAMPUS:
        return "off-campus listings"
    if category == ListingCategory.SHORT_LET:
        return "short-let stays"
    if category == ListingCategory.SALES:
        return "homes for sale"
    if category == ListingCategory.RENT:
        return "rental homes"
    return "listings"


def _budget_label(parameters: ExtractedParameters) -> str:
    if parameters.min_price is not None and parameters.max_price is not None:
        return (
            f" between N{parameters.min_price:,.0f} and N{parameters.max_price:,.0f}"
        )
    if parameters.max_price is not None:
        return f" under N{parameters.max_price:,.0f}"
    if parameters.min_price is not None:
        return f" above N{parameters.min_price:,.0f}"
    return ""
