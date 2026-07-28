"""Session-scoped Redis context for the conversational layer.

Per dev plan §10.4: no persistent chat history across sessions; the
session-scoped key expires after 30 minutes of inactivity OR when the user
clicks New Chat. Stores: current parameters, last result listing IDs,
last 10 conversation turns.
"""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.ai_search.schemas import (
    ChatTurn,
    ExtractedParameters,
    SessionStateView,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

SESSION_TTL_SECONDS = 30 * 60
MAX_TURNS = 20
MAX_RESULT_IDS = 100


def new_session_id() -> str:
    return secrets.token_urlsafe(18)


def _key(session_id: str) -> str:
    return f"chat:session:{session_id}"


class SessionStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def load(self, session_id: str) -> SessionStateView:
        raw = await self._redis.get(_key(session_id))
        if raw is None:
            return SessionStateView(session_id=session_id)
        data = json.loads(raw)
        params = (
            ExtractedParameters.model_validate(data["parameters"])
            if data.get("parameters")
            else None
        )
        return SessionStateView(
            session_id=session_id,
            parameters=params,
            last_result_listing_ids=list(data.get("last_result_listing_ids", [])),
            turns=[ChatTurn.model_validate(t) for t in data.get("turns", [])],
        )

    async def save(self, state: SessionStateView) -> None:
        # Bound the conversation history so a long session can't blow past
        # the OpenAI context window or the Upstash 256MB ceiling.
        trimmed_turns = state.turns[-MAX_TURNS:]
        trimmed_ids = state.last_result_listing_ids[:MAX_RESULT_IDS]
        payload = {
            "session_id": state.session_id,
            "parameters": state.parameters.model_dump(mode="json")
            if state.parameters
            else None,
            "last_result_listing_ids": trimmed_ids,
            "turns": [t.model_dump(mode="json") for t in trimmed_turns],
        }
        await self._redis.set(
            _key(state.session_id), json.dumps(payload), ex=SESSION_TTL_SECONDS
        )

    async def clear(self, session_id: str) -> None:
        await self._redis.delete(_key(session_id))

    async def append_turn(
        self, *, state: SessionStateView, role: str, content: str, intent: str | None
    ) -> None:
        state.turns.append(
            ChatTurn(
                role=role,
                content=content,
                created_at=datetime.now(UTC),
                intent=intent,
            )
        )

    def session_summary(self, state: SessionStateView) -> str:
        """Renders the carry-over context block included in the user message."""
        if state.parameters is None and not state.turns:
            return ""
        lines: list[str] = []
        if state.parameters is not None:
            lines.append(
                "Current search parameters: "
                + state.parameters.model_dump_json(exclude_none=True)
            )
        if state.last_result_listing_ids:
            lines.append(
                f"Last result set ({len(state.last_result_listing_ids)} listings) — "
                + ", ".join(state.last_result_listing_ids[:10])
            )
        if state.turns:
            lines.append("Recent turns:")
            for t in state.turns[-6:]:
                lines.append(f"  [{t.role}] {t.content}")
        return "\n".join(lines)
