"""OpenAI GPT-4o client for the conversational search layer.

Per project preference (see project memory: BeeBop LLM primary is OpenAI
GPT-4o), the conversational pipeline uses GPT-4o as the primary engine.
The Sprint-7 valuation-report generator continues to use Claude — those
paths are independent.

The dev stub returns deterministic structured output so the pipeline runs
end-to-end locally without an API key. Live calls use the official `openai`
Python SDK.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Protocol

from app.config import get_settings
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)
settings = get_settings()

DEFAULT_MODEL = "gpt-4o-2024-08-06"


@dataclass
class StructuredCompletion:
    parsed: dict[str, Any]
    raw_text: str
    finish_reason: str | None
    model: str


class LLMClient(Protocol):
    async def structured_completion(
        self,
        *,
        system_prompt: str,
        user_message: str,
        json_schema: dict[str, Any] | None = None,
        temperature: float = 0.0,
        model: str | None = None,
    ) -> StructuredCompletion: ...


class OpenAIClient:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._client = None

    def _ensure_client(self):  # type: ignore[no-untyped-def]
        if self._client is None:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(api_key=self._api_key)
        return self._client

    async def structured_completion(
        self,
        *,
        system_prompt: str,
        user_message: str,
        json_schema: dict[str, Any] | None = None,
        temperature: float = 0.0,
        model: str | None = None,
    ) -> StructuredCompletion:
        client = self._ensure_client()
        response_format: dict[str, Any]
        if json_schema is not None:
            response_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": json_schema.get("title", "BeeBopResponse"),
                    "schema": json_schema,
                    "strict": True,
                },
            }
        else:
            response_format = {"type": "json_object"}

        try:
            completion = await client.chat.completions.create(
                model=model or DEFAULT_MODEL,
                temperature=temperature,
                response_format=response_format,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
            )
        except Exception as exc:  # noqa: BLE001 — network/auth surface routes through ExternalServiceError
            raise ExternalServiceError(
                "OpenAI request failed.", code="openai_request_failed"
            ) from exc

        choice = completion.choices[0]
        text = choice.message.content or "{}"
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ExternalServiceError(
                "OpenAI returned invalid JSON.", code="openai_invalid_json"
            ) from exc
        return StructuredCompletion(
            parsed=parsed,
            raw_text=text,
            finish_reason=choice.finish_reason,
            model=completion.model,
        )


class StubLLMClient:
    """Deterministic fallback. Returns intent='search' with shallow parameter
    extraction (the user query becomes a free-text search term). Lets the
    full pipeline + ranking + result rendering run locally."""

    async def structured_completion(
        self,
        *,
        system_prompt: str,
        user_message: str,
        json_schema: dict[str, Any] | None = None,
        temperature: float = 0.0,
        model: str | None = None,
    ) -> StructuredCompletion:
        logger.info("[llm:stub] message=%s", user_message)
        # Heuristic intent guessing — keeps the dev experience usable.
        msg = user_message.lower().strip()
        intent = "search"
        if msg.startswith(("how", "what", "is ", "are ", "do ", "does ")):
            intent = "information"
        elif "the third" in msg or "the second" in msg or "ones with" in msg or msg.startswith(("show me",)):
            intent = "clarification"
        elif "schedule" in msg or "visit" in msg or "book" in msg:
            intent = "transactional"

        # Minimal parameter extraction: route to rent by default, pull
        # location-like words after "in".
        location: str | None = None
        if " in " in msg:
            tail = msg.split(" in ", 1)[1].strip()
            location = tail.split(",")[0].split(" under ")[0].strip()
            if location:
                location = location.title()
        parsed = {
            "intent": intent,
            "parameters": {
                "listing_category": "rent",
                "raw_query": user_message,
                "locations": [location] if location else [],
                "amenities": [],
                "verification_tiers": ["fully_verified", "doc_verified"],
            },
            "missing_parameter_prompt": None,
            "reference_resolution": None,
        }
        return StructuredCompletion(
            parsed=parsed,
            raw_text=json.dumps(parsed),
            finish_reason="stop",
            model="stub-llm",
        )


def get_llm_client() -> LLMClient:
    if settings.openai_api_key:
        return OpenAIClient(settings.openai_api_key)
    if settings.environment != "development":
        raise ExternalServiceError(
            "OPENAI_API_KEY must be set outside development.",
            code="openai_unconfigured",
        )
    return StubLLMClient()
