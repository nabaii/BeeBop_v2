"""Schemas for the short-let booking flow."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.models._enums import BookingStatus


class BookingQuotePayload(BaseModel):
    check_in: date
    check_out: date
    guest_count: int = Field(default=1, ge=1)

    @model_validator(mode="after")
    def _check_range(self) -> "BookingQuotePayload":
        if self.check_out <= self.check_in:
            raise ValueError("Check-out must be after check-in.")
        return self


class BookingQuote(BaseModel):
    nights: int
    base_total: float
    weekend_uplift: float
    seeker_fee: float
    grand_total: float
    host_payout: float
    instant_booking: bool
    min_stay_satisfied: bool


class CreateBookingPayload(BookingQuotePayload):
    pass


class DeclinePayload(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class CancelBookingPayload(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class AccessDetailsPayload(BaseModel):
    access_details: str = Field(..., min_length=1, max_length=4_000)


class BookingView(BaseModel):
    id: str
    listing_id: str
    listing_title: str
    seeker_id: str
    seeker_first_name: str | None = None
    host_id: str
    host_first_name: str | None = None
    check_in: date
    check_out: date
    guest_count: int
    status: BookingStatus
    instant_booking: bool
    base_total: float
    weekend_uplift: float
    seeker_fee: float
    host_fee: float
    grand_total: float
    payment_confirmed_at: datetime | None = None
    decided_at: datetime | None = None
    decision_deadline: datetime | None = None
    decline_reason: str | None = None
    access_details_visible: bool
    access_details: str | None = None
    checked_in_at: datetime | None = None
    payout_at: datetime | None = None
    payout_amount: float | None = None
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None
    paystack_authorization_url: str | None = None


class CalendarRange(BaseModel):
    listing_id: str
    days: list[dict]
