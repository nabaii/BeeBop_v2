"""Pydantic schemas for the offer state machine."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models._enums import ListingCategory, OfferStatus


class OfferSubmitPayload(BaseModel):
    """Seeker submits the original offer (round 1)."""

    price: float = Field(..., gt=0)
    move_in_date: date | None = None
    conditions: str | None = Field(default=None, max_length=2_000)


class CounterPayload(BaseModel):
    price: float = Field(..., gt=0)
    conditions: str | None = Field(default=None, max_length=2_000)


class RejectPayload(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class OfferRoundView(BaseModel):
    id: str
    round_number: int
    price: float
    conditions: str | None = None
    submitted_by: str           # "seeker" | "landlord"
    created_at: datetime


class OfferThreadView(BaseModel):
    """A thread is the chain of related Offer rows. The current latest row
    drives the timer + status."""

    listing_id: str
    listing_title: str
    listing_category: ListingCategory
    seeker_id: str
    seeker_name: str
    landlord_id: str
    landlord_name: str
    current_offer_id: str
    status: OfferStatus
    awaiting_landlord_response: bool
    expires_at: datetime
    move_in_date: date | None = None
    requires_visit_before_acceptance: bool
    visit_id: str | None = None
    rounds: list[OfferRoundView] = []
