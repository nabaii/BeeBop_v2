"""Pydantic schemas for the AI/NLP pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models._enums import ListingCategory

Intent = Literal["search", "clarification", "information", "transactional"]
VerificationTier = Literal["fully_verified", "doc_verified", "unverified"]
ReferenceKind = Literal["ordinal", "filter", "all", "action"]
ActionKind = Literal["make_offer", "book", "schedule_visit", "bookmark"]


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
    district: str | None = None
    cover_url: str | None = None
    rating: float | None = None
    review_count: int = 0
    rank_score: float
    rank_signals: dict[str, object]


class ChatResponse(BaseModel):
    session_id: str
    intent: Intent
    parameters: ExtractedParameters | None = None
    missing_parameter_prompt: str | None = None
    reference_resolution: ReferenceResolution | None = None
    assistant_message: str
    results: list[ResultListingSummary] = Field(default_factory=list)
    used_fallback: bool = False
    prompt_version: str
    query_id: str


class ClickThroughPayload(BaseModel):
    query_id: str
    listing_id: str
