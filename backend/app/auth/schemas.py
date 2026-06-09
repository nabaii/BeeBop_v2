"""Pydantic schemas for auth endpoints."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.email_normalize import canonicalize_email, is_disposable_email
from app.models._enums import UserRole

Channel = Literal["email", "whatsapp"]

_NG_PHONE_RE = re.compile(r"^\+234[0-9]{10}$")


def _normalise_identifier(channel: str | None, value: str, *, reject_disposable: bool) -> str:
    """Validate and canonicalise an OTP identifier.

    For email, collapses Gmail dot/plus variants to a single canonical form so
    downstream rate-limit and account-uniqueness checks actually bind, and
    optionally rejects disposable domains.
    """
    if channel == "email":
        value = canonicalize_email(value)
        if "@" not in value or len(value) > 255:
            raise ValueError("Invalid email.")
        if reject_disposable and is_disposable_email(value):
            raise ValueError("Disposable email addresses are not allowed.")
        return value
    if channel == "whatsapp":
        value = value.strip()
        if not _NG_PHONE_RE.match(value):
            raise ValueError("Phone must be Nigerian E.164, e.g. +2348012345678.")
        return value
    return value.strip()


class OtpRequestPayload(BaseModel):
    """Identifier plus channel. Phone numbers normalised to E.164 (+234...)."""

    channel: Channel
    identifier: str = Field(..., description="Email address or E.164 phone.")
    # Cloudflare Turnstile token from the widget. Optional so development (no
    # site key) and the verification step keep working; enforced server-side
    # when a secret key is configured.
    turnstile_token: str | None = Field(default=None, max_length=4096)
    # Honeypot — a field hidden from real users via CSS. Bots that fill every
    # input set it; we silently drop those requests. Must stay empty.
    company_website: str | None = Field(default=None, max_length=255)

    @field_validator("identifier")
    @classmethod
    def _validate_identifier(cls, v: str, info) -> str:  # type: ignore[no-untyped-def]
        return _normalise_identifier(
            info.data.get("channel"), v, reject_disposable=True
        )


class OtpRequestResponse(BaseModel):
    delivered: bool = True
    resend_available_in_seconds: int = 30
    dev_otp_code: str | None = None


class OtpVerifyPayload(BaseModel):
    channel: Channel
    identifier: str
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    password: str | None = Field(default=None, max_length=128)

    @field_validator("identifier")
    @classmethod
    def _validate_identifier(cls, v: str, info) -> str:  # type: ignore[no-untyped-def]
        # Canonicalise identically to the request step so the OTP store key and
        # user lookup resolve to the same canonical identity. Don't re-reject
        # disposable here — that gate belongs on the request step.
        return _normalise_identifier(
            info.data.get("channel"), v, reject_disposable=False
        )


class PasswordLoginPayload(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _normalise_email(cls, v: EmailStr) -> str:
        return canonicalize_email(str(v))


class SetPasswordPayload(BaseModel):
    current_password: str | None = Field(default=None, min_length=8, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _validate_new_password(cls, v: str) -> str:
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Password must include at least one letter and one number.")
        return v


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
    has_password: bool = False


class VerifyResponse(BaseModel):
    tokens: TokenPair
    user: AuthenticatedUser
    is_new_user: bool


class RefreshPayload(BaseModel):
    refresh_token: str


class DevLoginPayload(BaseModel):
    """Body for `/auth/dev-login`. Dev-only shortcut accounts are wired up — the
    service raises if any other role is passed."""

    role: Literal["seeker", "landlord", "admin"] = "landlord"
