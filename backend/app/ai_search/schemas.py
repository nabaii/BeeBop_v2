"""Pydantic schemas for the AI/NLP pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models._enums import ListingCategory


Intent = Literal["search", "clarification", "information", "transactional"]
VerificationTier = Literal["fully_verified", "doc_verified", "unverified"]


class ExtractedParameters(BaseModel):
    listing_category: ListingCategory | None = None
    raw_query: str
    locations: list[str] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    min_price: float | None = None
    max_price: float | None = None
    bedroom_count: int | None = None
    verification_tiers: list[VerificationTier] = Field(
        default_factory=lambda: ["fully_verified", "doc_verified"]
    )
    duration_years: int | None = None
    urgency: Literal["immediate", "soon", "flexible"] | None = None


class ReferenceResolution(BaseModel):
    kind: str
    index: int | None = None
    amenity: str | None = None
    action_kind: str | None = None


class LLMResponse(BaseModel):
    """The raw, validated shape we expect from the LLM. The pipeline
    consumes this and produces a `SearchResult` for the caller."""

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
    last_result_listing_ids: list[str] = []
    turns: list[ChatTurn] = []


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
    rank_signals: dict


class ChatResponse(BaseModel):
    session_id: str
    intent: Intent
    parameters: ExtractedParameters | None = None
    missing_parameter_prompt: str | None = None
    reference_resolution: ReferenceResolution | None = None
    assistant_message: str
    results: list[ResultListingSummary] = []
    used_fallback: bool = False
    prompt_version: str
    query_id: str


class ClickThroughPayload(BaseModel):
    query_id: str
    listing_id: str
