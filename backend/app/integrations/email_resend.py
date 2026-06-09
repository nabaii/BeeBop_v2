"""Resend email delivery — production path + dev-console stub."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Protocol

import httpx

from app.config import get_settings
from app.core.exceptions import ExternalServiceError
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)
settings = get_settings()

RESEND_API = "https://api.resend.com/emails"

# Counter key lives two days so the window straddles a UTC midnight cleanly.
_DAILY_CAP_TTL_SECONDS = 48 * 60 * 60


async def _enforce_daily_send_cap() -> None:
    """Raise once the per-UTC-day outbound email ceiling is reached.

    Counts send *attempts*, so a flood of failing sends still burns toward the
    cap — that is intentional: it bounds the blast radius regardless of outcome.
    """
    cap = settings.email_daily_send_cap
    if cap <= 0:
        return
    redis = get_redis()
    key = f"email:sent:{datetime.now(UTC):%Y-%m-%d}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, _DAILY_CAP_TTL_SECONDS)
    if count > cap:
        logger.error("Daily email send cap (%s) reached; refusing to send.", cap)
        raise ExternalServiceError(
            "Daily email send limit reached. Please try again later.",
            code="email_daily_cap_reached",
        )


class EmailClient(Protocol):
    async def send(self, *, to: str, subject: str, html: str, text: str | None = None) -> str: ...


class ResendClient:
    """Live client. Used when RESEND_API_KEY is configured."""

    def __init__(self, api_key: str, from_email: str) -> None:
        self._api_key = api_key
        self._from = from_email

    async def send(self, *, to: str, subject: str, html: str, text: str | None = None) -> str:
        await _enforce_daily_send_cap()
        payload: dict[str, object] = {
            "from": self._from,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if text:
            payload["text"] = text
        headers = {"Authorization": f"Bearer {self._api_key}"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.post(RESEND_API, json=payload, headers=headers)
            except httpx.HTTPError as exc:
                raise ExternalServiceError(
                    "Resend request failed.", code="resend_unreachable"
                ) from exc
        if resp.status_code >= 400:
            logger.warning("Resend error %s: %s", resp.status_code, resp.text)
            raise ExternalServiceError(
                f"Resend returned {resp.status_code}.", code="resend_error"
            )
        data = resp.json()
        return str(data.get("id", ""))


class StubEmailClient:
    """Dev stub — logs the email to stdout and returns a fake id. Activated
    when RESEND_API_KEY is empty. NEVER used in staging/production: the
    factory raises in those environments instead.
    """

    async def send(self, *, to: str, subject: str, html: str, text: str | None = None) -> str:
        logger.info("[email:stub] to=%s subject=%s\n%s", to, subject, text or html)
        return "stub-email-id"


def get_email_client() -> EmailClient:
    if settings.resend_api_key:
        return ResendClient(settings.resend_api_key, settings.resend_from_email)
    if settings.environment != "development":
        raise ExternalServiceError(
            "RESEND_API_KEY must be set outside development.",
            code="email_unconfigured",
        )
    return StubEmailClient()
