"""Pydantic schemas for the AI/NLP pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models._enums import ListingCategory

Intent = Literal[
    "search",
    "clarification",
    "information",
    "transactional",
    "compare_listings",
    "ask_property_question",
    "ask_area_question",
]
Confidence = Literal["high", "medium", "low"]
VerificationTier = Literal["fully_verified", "doc_verified", "unverified"]
ReferenceKind = Literal["ordinal", "filter", "all", "action"]
ActionKind = Literal["make_offer", "book", "schedule_visit", "bookmark"]
Occupancy = Literal["shared", "single", "any"]


def default_verification_tiers() -> list[VerificationTier]:
    return ["fully_verified", "doc_verified", "unverified"]


class ExtractedParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_category: ListingCategory | None = None
    raw_query: str
    locations: list[str] = Field(default_factory=list)
    # University/college the seeker named (off-campus only). Stored as a
    # canonical institution name and matched against
    # ``type_data["institutions_accepted"]`` rather than the free-text keyword
    # search, which only covers title/description/district.
    institution: str | None = None
    amenities: list[str] = Field(default_factory=list)
    min_price: float | None = None
    max_price: float | None = None
    bedroom_count: int | None = None
    verification_tiers: list[VerificationTier] = Field(default_factory=default_verification_tiers)
    duration_years: int | None = None
    urgency: Literal["immediate", "soon", "flexible"] | None = None
    # --- New fields per conversational search spec ---
    # Room occupancy preference (student accommodation).
    occupancy: Occupancy | None = None
    # Property type descriptor (e.g. "duplex", "bungalow", "terrace").
    property_type: str | None = None
    # Whether the seeker wants a furnished property.
    furnished: bool | None = None
    # Whether the seeker wants pet-friendly property.
    pet_friendly: bool | None = None
    # Gender preference for accommodation (female-only, male-only).
    gender_preference: Literal["female", "male"] | None = None


class ReferenceResolution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ReferenceKind
    index: int | None = None
    amenity: str | None = None
    action_kind: ActionKind | None = None


class LLMResponse(BaseModel):
    """The raw, validated shape we expect from the LLM. The pipeline
    consumes this and produces a `SearchResult` for the caller."""

    model_config = ConfigDict(extra="forbid")

    intent: Intent
    parameters: ExtractedParameters
    missing_parameter_prompt: str | None = None
    reference_resolution: ReferenceResolution | None = None
    # How confident the LLM is that enough information exists to search.
    # high  → search immediately, no clarification
    # medium → search, then ask one refining question
    # low   → ask one clarification before searching
    confidence: Confidence = "medium"


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime
    intent: Intent | None = None


class SessionStateView(BaseModel):
    session_id: str
    parameters: ExtractedParameters | None = None
    last_result_listing_ids: list[str] = Field(default_factory=list)
    turns: list[ChatTurn] = Field(default_factory=list)


class ChatRequestPayload(BaseModel):
    session_id: str | None = None
    query: str = Field(..., min_length=1, max_length=2_000)


class ResultListingSummary(BaseModel):
    """Compact projection used in the chat response, separate from the
    public-search summary so we can colocate ranking metadata."""

    id: str
    title: str
    category: ListingCategory
    status: str
    price: float | None = None
    price_period: str | None = None
    district: str | None = None
    cover_url: str | None = None
    # First non-cover photo, when present — powers the hover crossfade on cards.
    secondary_url: str | None = None
    # Listing has at least one video tour, in any of its galleries.
    has_video: bool = False
    rating: float | None = None
    review_count: int = 0
    bedroom_count: int | None = None
    bathroom_count: float | None = None
    rank_score: float
    rank_signals: dict[str, object]


class ChatResponse(BaseModel):
    session_id: str
    intent: Intent
    parameters: ExtractedParameters | None = None
    missing_parameter_prompt: str | None = None
    reference_resolution: ReferenceResolution | None = None
    assistant_message: str
    # The single most useful distinction across the result set (e.g. "The first
    # is the only one Beebop has physically verified"). Computed deterministically
    # from the data — never model-authored — so it is true and free of LLM cost.
    # The frontend renders it as a styled note beside the results, not inline.
    result_note: str | None = None
    results: list[ResultListingSummary] = Field(default_factory=list)
    used_fallback: bool = False
    prompt_version: str
    # Concierge prompt revision when stage-two prose actually ran; null when the
    # turn used the deterministic template. Logged for Phase-4 attribution.
    concierge_prompt_version: str | None = None
    query_id: str
    # Contextual follow-up suggestions based on the current search state.
    # Rendered as quick-tap chips beneath the assistant message.
    suggested_followups: list[str] = Field(default_factory=list)
    property_answer: str | None = None
    area_answer: str | None = None


class ClickThroughPayload(BaseModel):
    query_id: str
    listing_id: str


class RecentQueryView(BaseModel):
    """One row of a seeker's stored search history.

    Distinct from `ChatTurn`, which is session-scoped Redis state: this survives
    the session and is bound to an account.
    """

    id: str
    query: str
    intent: str
    listing_category: ListingCategory | None = None
    result_count: int = 0
    # Parameter snapshot from the turn that produced this row. Not rendered —
    # kept so a stored query can seed browse filters without a fresh LLM call.
    parameters: dict[str, object] | None = None
    created_at: datetime
