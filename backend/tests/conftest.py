"""Shared pytest fixtures — in-memory fakes for Redis and the test DB.

The full integration suite (pytest + httpx async client against a real
Postgres service container) runs in CI via the workflow in .github/workflows.
For unit tests we avoid the network entirely.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

# Keep the Settings() defaults well-known for tests so JWTs round-trip
# deterministically.
os.environ.setdefault("SECRET_KEY", "test-secret-key-please-change")
os.environ.setdefault("ENVIRONMENT", "development")

import pytest


class FakeRedis:
    """Minimal async Redis stand-in. Implements only what OtpService and the
    refresh store use. Data lives for the life of the fixture."""

    def __init__(self) -> None:
        self._data: dict[str, str] = {}
        self._ttl: dict[str, int] = {}

    async def set(
        self,
        key: str,
        value: str,
        ex: int | None = None,
        **_: object,
    ) -> bool:
        self._data[key] = value
        if ex is not None:
            self._ttl[key] = ex
        return True

    async def get(self, key: str) -> str | None:
        return self._data.get(key)

    async def delete(self, *keys: str) -> int:
        removed = 0
        for k in keys:
            if k in self._data:
                del self._data[k]
                self._ttl.pop(k, None)
                removed += 1
        return removed

    async def incr(self, key: str) -> int:
        current = int(self._data.get(key, "0"))
        current += 1
        self._data[key] = str(current)
        return current

    async def expire(self, key: str, seconds: int) -> bool:
        if key in self._data:
            self._ttl[key] = seconds
            return True
        return False

    async def ttl(self, key: str) -> int:
        return self._ttl.get(key, -1)


@pytest.fixture
def fake_redis() -> FakeRedis:
    return FakeRedis()
