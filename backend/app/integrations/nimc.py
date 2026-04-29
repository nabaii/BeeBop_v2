"""NIMC NIN verification — individual landlord identity check.

Retry policy per dev plan §7.1:
- First failure: retry once (exponential backoff)
- Third failure (after retries exhausted): flag for admin manual verification
- NIMC API timeout: mark as async; admin sees pending status
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.config import get_settings
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class NinVerificationResult:
    verified: bool
    full_name: str | None = None
    date_of_birth: str | None = None
    reason: str | None = None
    is_timeout: bool = False   # caller should mark user as pending_verification


class NimcClient(Protocol):
    async def verify_nin(self, nin: str) -> NinVerificationResult: ...


class LiveNimcClient:
    def __init__(self, api_key: str, base_url: str) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    async def verify_nin(self, nin: str) -> NinVerificationResult:
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(
                    f"{self._base_url}/nin/verify",
                    json={"nin": nin},
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
            except httpx.TimeoutException:
                return NinVerificationResult(
                    verified=False, reason="nimc_timeout", is_timeout=True
                )
            except httpx.HTTPError as exc:
                raise ExternalServiceError(
                    "NIMC unreachable.", code="nimc_unreachable"
                ) from exc
        if resp.status_code == 404:
            return NinVerificationResult(verified=False, reason="nin_not_found")
        if resp.status_code >= 500:
            raise ExternalServiceError(
                f"NIMC returned {resp.status_code}.", code="nimc_server_error"
            )
        data = resp.json()
        return NinVerificationResult(
            verified=bool(data.get("verified")),
            full_name=data.get("full_name"),
            date_of_birth=data.get("date_of_birth"),
            reason=data.get("reason"),
        )


class StubNimcClient:
    """Dev stub: accepts any 11-digit numeric NIN and returns verified=True.

    Special test NINs per convention:
      * 00000000000 -> not verified
      * 11111111111 -> timeout (admin queue)
    """

    async def verify_nin(self, nin: str) -> NinVerificationResult:
        logger.info("[nimc:stub] nin=%s", nin)
        if nin == "0" * 11:
            return NinVerificationResult(verified=False, reason="nin_not_found")
        if nin == "1" * 11:
            return NinVerificationResult(verified=False, reason="nimc_timeout", is_timeout=True)
        if len(nin) == 11 and nin.isdigit():
            return NinVerificationResult(
                verified=True, full_name="Test Nigerian Citizen", date_of_birth="1990-01-01"
            )
        return NinVerificationResult(verified=False, reason="invalid_format")


def get_nimc_client() -> NimcClient:
    if settings.nimc_api_key and settings.nimc_api_url:
        return LiveNimcClient(settings.nimc_api_key, settings.nimc_api_url)
    return StubNimcClient()


async def verify_nin_with_retry(
    nin: str,
    *,
    max_attempts: int = 2,
    client: NimcClient | None = None,
) -> NinVerificationResult:
    """Wrap a NIMC call with a single retry on timeout/server error. After
    max_attempts failures, callers should flag the user for admin review.
    """
    svc = client or get_nimc_client()
    last: NinVerificationResult | None = None
    for attempt in range(max_attempts):
        last = await svc.verify_nin(nin)
        if last.verified or not last.is_timeout:
            return last
        if attempt + 1 < max_attempts:
            await asyncio.sleep(0.5 * (attempt + 1))
    assert last is not None
    return last
