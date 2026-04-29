"""Anthropic-backed valuation report note generation with a dev fallback."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Protocol

from anthropic import APIError, AsyncAnthropic
from pydantic import BaseModel, Field, ValidationError as PydanticValidationError

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

DEFAULT_MODEL = "claude-3-5-haiku-latest"
SYSTEM_PROMPT = """You write short neutral property-inspection report notes.
Return JSON only with:
{
  "inspector_note": "short factual note",
  "formatted_text": "plain text report"
}
Do not add markdown fences.
The report must contain only area infrastructure scores, inspector note, and report date.
Do not mention price, valuation, fair market value, or comparable listings."""


class GeneratedValuationDraft(BaseModel):
    inspector_note: str | None = Field(default=None, max_length=2_000)
    formatted_text: str = Field(..., min_length=1, max_length=10_000)


class ValuationClient(Protocol):
    async def generate(
        self,
        *,
        area_scores: dict[str, int | None],
        inspector_note: str | None,
        report_date: str,
        area_scores_last_updated: str | None,
    ) -> GeneratedValuationDraft: ...


@dataclass(frozen=True)
class AnthropicValuationClient:
    api_key: str
    model: str = DEFAULT_MODEL

    async def generate(
        self,
        *,
        area_scores: dict[str, int | None],
        inspector_note: str | None,
        report_date: str,
        area_scores_last_updated: str | None,
    ) -> GeneratedValuationDraft:
        client = AsyncAnthropic(api_key=self.api_key)
        prompt = json.dumps(
            {
                "area_scores": area_scores,
                "inspector_note": inspector_note,
                "report_date": report_date,
                "area_scores_last_updated": area_scores_last_updated,
            }
        )
        try:
            message = await client.messages.create(
                model=self.model,
                max_tokens=800,
                temperature=0,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
        except APIError as exc:
            logger.warning("Anthropic valuation generation failed: %s", exc)
            raise

        chunks: list[str] = []
        for block in message.content:
            text = getattr(block, "text", None)
            if text:
                chunks.append(text)
        payload = "".join(chunks).strip()
        if payload.startswith("```"):
            payload = payload.strip("`")
            if payload.lower().startswith("json"):
                payload = payload[4:].lstrip()
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ValueError("Anthropic did not return valid JSON.") from exc
        try:
            return GeneratedValuationDraft.model_validate(data)
        except PydanticValidationError as exc:
            raise ValueError("Anthropic returned an invalid valuation payload.") from exc


class StubValuationClient:
    async def generate(
        self,
        *,
        area_scores: dict[str, int | None],
        inspector_note: str | None,
        report_date: str,
        area_scores_last_updated: str | None,
    ) -> GeneratedValuationDraft:
        note = (inspector_note or "").strip() or "Property assessed on-site by BeeBop."
        score_lines = [
            f"- {key.replace('_', ' ').title()}: {value}/5"
            for key, value in area_scores.items()
            if value is not None
        ]
        stamp = area_scores_last_updated or "Not yet recorded"
        formatted = "\n".join(
            [
                "BeeBop Valuation Report",
                f"Report date: {report_date}",
                f"Area scores last updated: {stamp}",
                "",
                "Area infrastructure scores:",
                *score_lines,
                "",
                f"Inspector note: {note}",
            ]
        )
        return GeneratedValuationDraft(inspector_note=note, formatted_text=formatted)


def get_valuation_client() -> ValuationClient:
    if settings.anthropic_api_key:
        return AnthropicValuationClient(api_key=settings.anthropic_api_key)
    return StubValuationClient()
