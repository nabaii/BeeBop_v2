"""WhatsApp Business API client — Meta Graph API v21.0.

All messages use pre-approved templates per dev plan §3.4. Free-form messages
are rejected at the client level — there is no fallback to non-approved text.
"""

from __future__ import annotations

import logging
from typing import Protocol

import httpx

from app.config import get_settings
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)
settings = get_settings()

WHATSAPP_API = "https://graph.facebook.com/v21.0"


class WhatsAppClient(Protocol):
    async def send_template(
        self,
        *,
        to: str,
        template_name: str,
        parameters: list[str],
        language: str = "en",
    ) -> str: ...


class MetaWhatsAppClient:
    """Live client."""

    def __init__(self, token: str, phone_number_id: str) -> None:
        self._token = token
        self._phone_id = phone_number_id

    async def send_template(
        self,
        *,
        to: str,
        template_name: str,
        parameters: list[str],
        language: str = "en",
    ) -> str:
        url = f"{WHATSAPP_API}/{self._phone_id}/messages"
        body = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
                "components": [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": p} for p in parameters],
                    }
                ],
            },
        }
        headers = {"Authorization": f"Bearer {self._token}"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.post(url, json=body, headers=headers)
            except httpx.HTTPError as exc:
                raise ExternalServiceError(
                    "WhatsApp request failed.", code="whatsapp_unreachable"
                ) from exc
        if resp.status_code >= 400:
            logger.warning("WhatsApp error %s: %s", resp.status_code, resp.text)
            raise ExternalServiceError(
                f"WhatsApp returned {resp.status_code}.",
                code="whatsapp_error",
            )
        data = resp.json()
        messages = data.get("messages", [])
        return str(messages[0]["id"]) if messages else ""


class StubWhatsAppClient:
    async def send_template(
        self,
        *,
        to: str,
        template_name: str,
        parameters: list[str],
        language: str = "en",
    ) -> str:
        logger.info(
            "[whatsapp:stub] to=%s template=%s params=%s lang=%s",
            to,
            template_name,
            parameters,
            language,
        )
        return "stub-whatsapp-id"


def get_whatsapp_client() -> WhatsAppClient:
    if settings.whatsapp_business_api_token and settings.whatsapp_phone_number_id:
        return MetaWhatsAppClient(
            settings.whatsapp_business_api_token, settings.whatsapp_phone_number_id
        )
    if settings.environment != "development":
        raise ExternalServiceError(
            "WhatsApp credentials must be set outside development.",
            code="whatsapp_unconfigured",
        )
    return StubWhatsAppClient()
