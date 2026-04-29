"""CAC (Corporate Affairs Commission) agency verification.

Async-fallback pattern: if the CAC API queues the request, we store a
pending state and admin sees the status until the upstream responds.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.config import get_settings
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class CacVerificationResult:
    verified: bool
    business_name: str | None = None
    reason: str | None = None
    is_pending: bool = False


class CacClient(Protocol):
    async def verify_cac(
        self, *, cac_number: str, business_name: str
    ) -> CacVerificationResult: ...


class LiveCacClient:
    def __init__(self, api_key: str, base_url: str) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    async def verify_cac(
        self, *, cac_number: str, business_name: str
    ) -> CacVerificationResult:
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.post(
                    f"{self._base_url}/verify",
                    json={"rc_number": cac_number, "business_name": business_name},
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
            except httpx.TimeoutException:
                return CacVerificationResult(
                    verified=False, reason="cac_timeout", is_pending=True
                )
            except httpx.HTTPError as exc:
                raise ExternalServiceError(
                    "CAC unreachable.", code="cac_unreachable"
                ) from exc
        if resp.status_code == 404:
            return CacVerificationResult(verified=False, reason="cac_not_found")
        if resp.status_code == 202:
            return CacVerificationResult(
                verified=False, reason="cac_pending", is_pending=True
            )
        if resp.status_code >= 500:
            raise ExternalServiceError(
                f"CAC returned {resp.status_code}.", code="cac_server_error"
            )
        data = resp.json()
        return CacVerificationResult(
            verified=bool(data.get("verified")),
            business_name=data.get("business_name"),
            reason=data.get("reason"),
        )


class StubCacClient:
    """Dev stub.

    Test CAC numbers:
      * RC000000 -> not found
      * RC111111 -> pending (admin queue)
      * RC + any 5+ digits -> verified
    """

    async def verify_cac(
        self, *, cac_number: str, business_name: str
    ) -> CacVerificationResult:
        logger.info("[cac:stub] cac=%s name=%s", cac_number, business_name)
        if cac_number == "RC000000":
            return CacVerificationResult(verified=False, reason="cac_not_found")
        if cac_number == "RC111111":
            return CacVerificationResult(
                verified=False, reason="cac_pending", is_pending=True
            )
        if cac_number.startswith("RC") and cac_number[2:].isdigit() and len(cac_number) >= 7:
            return CacVerificationResult(verified=True, business_name=business_name)
        return CacVerificationResult(verified=False, reason="invalid_format")


def get_cac_client() -> CacClient:
    if settings.cac_api_key and settings.cac_api_url:
        return LiveCacClient(settings.cac_api_key, settings.cac_api_url)
    return StubCacClient()
