"""Module-level async Redis client used by OTP store, session context, and
the Celery broker connection."""

from __future__ import annotations

from redis.asyncio import Redis

from app.config import get_settings

settings = get_settings()

_redis: Redis | None = None


def get_redis() -> Redis:
    """Lazily initialise the module-level Redis connection.

    `redis.asyncio.Redis.from_url` returns a pool — safe to share across the
    process. Called as a FastAPI dependency in routes that need it.
    """
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis
