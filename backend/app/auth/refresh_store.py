"""Refresh token rotation state — stored in Redis.

Each issued refresh token's jti lives in Redis for the token's lifetime.
Verify flow:
    1. Decode token -> get user_id, jti.
    2. Look up the stored jti for that user.
    3. If it doesn't match the current jti, reject — the token was replayed
       or a newer one has been issued (reuse detection).
    4. On a successful refresh, rotate: delete old jti, store new jti.

This is a single active-refresh-per-user model. Good enough for Sprint 1.
Multi-device support can swap to a sorted-set-per-user later without breaking
the API.
"""

from __future__ import annotations

from datetime import timedelta

from redis.asyncio import Redis

from app.config import get_settings

settings = get_settings()

REFRESH_TTL = timedelta(days=settings.jwt_refresh_token_expire_days)


def _key(user_id: str) -> str:
    return f"refresh:user:{user_id}"


class RefreshTokenStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def record(self, *, user_id: str, jti: str) -> None:
        await self._redis.set(_key(user_id), jti, ex=int(REFRESH_TTL.total_seconds()))

    async def is_current(self, *, user_id: str, jti: str) -> bool:
        current = await self._redis.get(_key(user_id))
        return current == jti

    async def revoke(self, user_id: str) -> None:
        await self._redis.delete(_key(user_id))
