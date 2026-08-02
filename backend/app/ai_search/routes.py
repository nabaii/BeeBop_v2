"""HTTP routes for the Sprint 13 conversational search layer."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_search import history, service
from app.ai_search.schemas import (
    ChatRequestPayload,
    ChatResponse,
    ClickThroughPayload,
    RecentQueryView,
    SessionStateView,
)
from app.core.dependencies import get_current_user, get_current_user_optional
from app.core.redis_client import get_redis
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/ai-search", tags=["ai-search"])
DB_DEP = Depends(get_db)
REDIS_DEP = Depends(get_redis)
USER_DEP = Depends(get_current_user)
# Chat stays open to logged-out visitors; the identity is only used to attach
# the turn to a seeker's saved history when there is one.
OPTIONAL_USER_DEP = Depends(get_current_user_optional)


@router.post("/chat", response_model=ChatResponse)
async def chat_search(
    payload: ChatRequestPayload,
    user: User | None = OPTIONAL_USER_DEP,
    db: AsyncSession = DB_DEP,
    redis: Redis = REDIS_DEP,
) -> ChatResponse:
    return await service.run_chat_query(payload=payload, db=db, redis=redis, user=user)


@router.get("/history", response_model=list[RecentQueryView])
async def list_query_history(
    user: User = USER_DEP,
    db: AsyncSession = DB_DEP,
) -> list[RecentQueryView]:
    return await history.list_recent(db=db, user_id=user.id)


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_query_history(
    user: User = USER_DEP,
    db: AsyncSession = DB_DEP,
) -> Response:
    await history.clear_history(db=db, user_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/history/{query_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_query_history_entry(
    query_id: uuid.UUID,
    user: User = USER_DEP,
    db: AsyncSession = DB_DEP,
) -> Response:
    await history.delete_query(db=db, user_id=user.id, query_id=query_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions/{session_id}", response_model=SessionStateView)
async def get_session(
    session_id: str,
    redis: Redis = REDIS_DEP,
) -> SessionStateView:
    return await service.get_session_state(session_id=session_id, redis=redis)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    redis: Redis = REDIS_DEP,
) -> Response:
    await service.clear_session(session_id=session_id, redis=redis)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/click", status_code=status.HTTP_204_NO_CONTENT)
async def record_click(payload: ClickThroughPayload) -> Response:
    await service.record_click(query_id=payload.query_id, listing_id=payload.listing_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
