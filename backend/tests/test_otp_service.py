"""OTP service unit tests — generation, hashing, attempt counter, rate limit.

Delivery is mocked by swapping the integration client factories so the test
never hits Resend / WhatsApp.
"""

from __future__ import annotations

from typing import cast

import pytest

from app.auth.otp_service import (
    MAX_VERIFY_ATTEMPTS,
    REQUEST_RATE_LIMIT,
    OtpService,
    _hash_code,
)
from app.core.exceptions import RateLimitedError, UnauthorisedError, ValidationError


class RecordingEmail:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    async def send(
        self, *, to: str, subject: str, html: str, text: str | None = None
    ) -> str:
        self.sent.append((to, subject, text or html))
        return "stub-id"


@pytest.fixture(autouse=True)
def _patch_email(monkeypatch: pytest.MonkeyPatch) -> RecordingEmail:
    rec = RecordingEmail()
    monkeypatch.setattr("app.auth.otp_service.get_email_client", lambda: rec)
    monkeypatch.setattr("app.auth.otp_service.get_whatsapp_client", lambda: rec)  # unused here
    return rec


def _extract_code(email_text: str) -> str:
    # The delivered body contains "code is NNNNNN."
    for token in email_text.split():
        if token.rstrip(".").isdigit() and len(token.rstrip(".")) == 6:
            return token.rstrip(".")
    raise AssertionError(f"Could not find OTP in email body: {email_text}")


@pytest.mark.asyncio
async def test_request_and_verify_happy_path(fake_redis, _patch_email) -> None:  # type: ignore[no-untyped-def]
    svc = OtpService(cast("object", fake_redis))  # type: ignore[arg-type]
    await svc.request(channel="email", identifier="user@example.com")

    code = _extract_code(_patch_email.sent[-1][2])
    await svc.verify(channel="email", identifier="user@example.com", code=code)

    # Record is deleted on success.
    assert await fake_redis.get("otp:email:user@example.com") is None


@pytest.mark.asyncio
async def test_verify_wrong_code_increments_attempts(fake_redis, _patch_email) -> None:  # type: ignore[no-untyped-def]
    svc = OtpService(cast("object", fake_redis))  # type: ignore[arg-type]
    await svc.request(channel="email", identifier="user@example.com")

    with pytest.raises(UnauthorisedError) as exc:
        await svc.verify(channel="email", identifier="user@example.com", code="000000")
    assert exc.value.code == "otp_mismatch"

    raw = await fake_redis.get("otp:email:user@example.com")
    assert raw is not None
    assert raw.endswith("|1")


@pytest.mark.asyncio
async def test_verify_after_max_attempts_evicts(fake_redis, _patch_email) -> None:  # type: ignore[no-untyped-def]
    svc = OtpService(cast("object", fake_redis))  # type: ignore[arg-type]
    await svc.request(channel="email", identifier="user@example.com")
    for _ in range(MAX_VERIFY_ATTEMPTS):
        with pytest.raises(UnauthorisedError):
            await svc.verify(channel="email", identifier="user@example.com", code="000000")

    # Next attempt hits attempts_exceeded branch and deletes.
    with pytest.raises(UnauthorisedError) as exc:
        await svc.verify(channel="email", identifier="user@example.com", code="000000")
    assert exc.value.code == "otp_attempts_exceeded"
    assert await fake_redis.get("otp:email:user@example.com") is None


@pytest.mark.asyncio
async def test_verify_rejects_bad_format(fake_redis, _patch_email) -> None:  # type: ignore[no-untyped-def]
    svc = OtpService(cast("object", fake_redis))  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        await svc.verify(channel="email", identifier="user@example.com", code="12ab56")


@pytest.mark.asyncio
async def test_request_rate_limit(fake_redis, _patch_email) -> None:  # type: ignore[no-untyped-def]
    svc = OtpService(cast("object", fake_redis))  # type: ignore[arg-type]
    for _ in range(REQUEST_RATE_LIMIT):
        await svc.request(channel="email", identifier="user@example.com")
    with pytest.raises(RateLimitedError):
        await svc.request(channel="email", identifier="user@example.com")


def test_hash_is_deterministic_and_hex() -> None:
    h1 = _hash_code("123456")
    h2 = _hash_code("123456")
    h3 = _hash_code("654321")
    assert h1 == h2
    assert h1 != h3
    int(h1, 16)     # parses as hex
