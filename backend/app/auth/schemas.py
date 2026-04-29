"""Pydantic schemas for auth endpoints."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models._enums import UserRole

Channel = Literal["email", "whatsapp"]

_NG_PHONE_RE = re.compile(r"^\+234[0-9]{10}$")


class OtpRequestPayload(BaseModel):
    """Identifier plus channel. Phone numbers normalised to E.164 (+234...)."""

    channel: Channel
    identifier: str = Field(..., description="Email address or E.164 phone.")

    @field_validator("identifier")
    @classmethod
    def _validate_identifier(cls, v: str, info) -> str:  # type: ignore[no-untyped-def]
        channel = info.data.get("channel")
        v = v.strip().lower() if channel == "email" else v.strip()
        if channel == "email":
            if "@" not in v or len(v) > 255:
                raise ValueError("Invalid email.")
        elif channel == "whatsapp":
            if not _NG_PHONE_RE.match(v):
                raise ValueError("Phone must be Nigerian E.164, e.g. +2348012345678.")
        return v


class OtpRequestResponse(BaseModel):
    delivered: bool = True
    resend_available_in_seconds: int = 30


class OtpVerifyPayload(BaseModel):
    channel: Channel
    identifier: str
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"


class AuthenticatedUser(BaseModel):
    id: str
    email: str
    role: UserRole
    first_name: str | None = None
    last_name: str | None = None
    onboarding_complete: bool


class VerifyResponse(BaseModel):
    tokens: TokenPair
    user: AuthenticatedUser
    is_new_user: bool


class RefreshPayload(BaseModel):
    refresh_token: str
