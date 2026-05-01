"""HTTP routes for the Sprint 13 conversational search layer."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_search import service
from app.ai_search.schemas import (
    ChatRequestPayload,
    ChatResponse,
    ClickThroughPayload,
    SessionStateView,
)
from app.core.redis_client import get_redis
from app.database import get_db

router = APIRouter(prefix="/ai-search", tags=["ai-search"])
DB_DEP = Depends(get_db)
REDIS_DEP = Depends(get_redis)


@router.post("/chat", response_model=ChatResponse)
async def chat_search(
    payload: ChatRequestPayload,
    db: AsyncSession = DB_DEP,
    redis: Redis = REDIS_DEP,
) -> ChatResponse:
    return await service.run_chat_query(payload=payload, db=db, redis=redis)


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
