"""Agreement schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models._enums import AgreementStatus, AgreementType, ListingCategory


class SignaturePayload(BaseModel):
    """Caller passes their OTP. The service verifies it (already-stored from
    /auth/otp/request via the same channel) and records the signature."""

    channel: Literal["email", "whatsapp"]
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class SignatureRequestPayload(BaseModel):
    """Trigger an OTP send before the user enters it on the sign step."""

    channel: Literal["email", "whatsapp"]


class SignatureRecord(BaseModel):
    party: Literal["landlord", "seeker"]
    channel: Literal["email", "whatsapp"]
    signed_at: datetime


class AgreementView(BaseModel):
    id: str
    listing_id: str
    listing_title: str
    listing_category: ListingCategory
    type: AgreementType
    status: AgreementStatus
    landlord_id: str
    landlord_name: str
    seeker_id: str
    seeker_name: str
    price: float
    start_date: date | None = None
    end_date: date | None = None
    conditions: str | None = None
    signatures: list[SignatureRecord] = []
    pdf_available: bool
    sales_invoice_url: str | None = None
    sales_invoice_due_at: datetime | None = None
    landlord_fee_total: float | None = None
    seeker_fee_total: float | None = None
    seller_fee_total: float | None = None
    payment_confirmed_at: datetime | None = None


class AgreementPresignedView(BaseModel):
    url: str
    expires_in_seconds: int
