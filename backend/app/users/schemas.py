"""Pydantic schemas for user onboarding and profile endpoints."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models._enums import AccountType, Gender, ListingCategory, UserRole

_NIN_RE = re.compile(r"^\d{11}$")
_CAC_RE = re.compile(r"^RC\d+$")


class UserView(BaseModel):
    id: str
    email: str
    role: UserRole
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    has_password: bool = False

    account_type: AccountType | None = None
    nin_verified: bool = False
    nin_document_url: str | None = None
    nin_document_uploaded_at: datetime | None = None
    nin_review_note: str | None = None
    cac_verified: bool = False
    business_name: str | None = None
    cac_number: str | None = None

    profile_photo_url: str | None = None
    bio: str | None = None
    operating_area: str | None = None

    category_preferences: list[ListingCategory] | None = None
    institution: str | None = None
    academic_level: str | None = None
    gender: Gender | None = None

    # Optional self-reported seeker profile.
    age_band: str | None = None
    occupation: str | None = None
    budget_min: int | None = None
    budget_max: int | None = None
    preferred_area: str | None = None

    onboarding_complete: bool


class IdentityPayload(BaseModel):
    """Step 1 — shared between seeker and landlord."""

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    # Email is only writable if the user signed in via WhatsApp — enforced in service.
    email: EmailStr | None = None


class SeekerCategoryPayload(BaseModel):
    """Step 2 — seeker category preference (multi-select)."""

    categories: list[ListingCategory] = Field(..., min_length=1)


class StudentExtrasPayload(BaseModel):
    """Step 2b — student variant additions."""

    institution: str = Field(..., min_length=1, max_length=255)
    academic_level: Literal["100", "200", "300", "400", "500", "Postgrad"]
    gender: Literal[Gender.FEMALE, Gender.MALE]


class SeekerExtrasPayload(BaseModel):
    """Optional seeker profile — age band, occupation, budget, preferred area.

    Every field is optional; the onboarding step is skippable and these never
    gate onboarding completion. Only provided fields are written (a None for a
    field means "leave unchanged"), so the step can be saved partially.
    """

    age_band: Literal["18-24", "25-34", "35-44", "45-54", "55+"] | None = None
    occupation: str | None = Field(default=None, max_length=100)
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    preferred_area: str | None = Field(default=None, max_length=255)

    @field_validator("occupation", "preferred_area")
    @classmethod
    def _blank_to_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None

    @field_validator("budget_max")
    @classmethod
    def _max_not_below_min(cls, v: int | None, info) -> int | None:  # type: ignore[no-untyped-def]
        lo = info.data.get("budget_min")
        if v is not None and lo is not None and v < lo:
            raise ValueError("Maximum budget cannot be less than the minimum.")
        return v


class LandlordAccountTypePayload(BaseModel):
    account_type: AccountType


class NinVerifyPayload(BaseModel):
    nin: str

    @field_validator("nin")
    @classmethod
    def _validate_nin(cls, v: str) -> str:
        v = v.strip()
        if not _NIN_RE.match(v):
            raise ValueError("NIN must be 11 digits.")
        return v


class NinVerifyResponse(BaseModel):
    verified: bool
    admin_review: bool = False   # set when retries exhausted or timeout


class NinDocumentRegisterPayload(BaseModel):
    """Manual NIN review — landlord uploads an ID image to Cloudinary, then
    posts the resulting URL here. Admin reviews via /internal/admin/nin-review.
    """

    url: str = Field(..., min_length=1, max_length=500)


class NinDocumentRegisterResponse(BaseModel):
    nin_document_url: str
    nin_document_uploaded_at: datetime


class CacVerifyPayload(BaseModel):
    cac_number: str
    business_name: str = Field(..., min_length=1, max_length=255)
    agency_areas: list[str] = Field(default_factory=list)

    @field_validator("cac_number")
    @classmethod
    def _validate_cac(cls, v: str) -> str:
        v = v.strip().upper()
        if not _CAC_RE.match(v):
            raise ValueError("CAC number must start with RC followed by digits.")
        return v


class CacVerifyResponse(BaseModel):
    verified: bool
    pending: bool = False


class ProfilePayload(BaseModel):
    profile_photo_url: str | None = None
    bio: str | None = Field(default=None, max_length=1000)
    operating_area: str | None = Field(default=None, max_length=255)
    agency_logo_url: str | None = None
