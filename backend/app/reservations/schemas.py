"""Schemas for the off-campus 'Book now' reservation flow."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models._enums import ReservationStatus


class ReservationQuote(BaseModel):
    unit_type_id: str
    unit_type_name: str
    price_period: str
    base_total: float
    seeker_fee: float
    grand_total: float
    beds_available: int


class CreateReservationPayload(BaseModel):
    unit_type_id: str = Field(..., min_length=1)


class CancelReservationPayload(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class ReservationView(BaseModel):
    id: str
    listing_id: str
    listing_title: str
    seeker_id: str
    unit_type_id: str
    unit_type_name: str
    price_period: str
    status: ReservationStatus
    base_total: float
    seeker_fee: float
    grand_total: float
    payment_confirmed_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None
    created_at: datetime
    paystack_authorization_url: str | None = None
