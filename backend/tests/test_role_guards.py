"""Tests for the role-based route guard dependency.

The guard is framework-flavoured — we exercise it by driving the returned
callable directly with a fake user record rather than spinning up a full
app fixture.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.core.dependencies import require_role
from app.core.exceptions import ForbiddenError
from app.models._enums import UserRole


def _user(role: UserRole) -> object:
    return SimpleNamespace(id=uuid.uuid4(), role=role, is_active=True, is_suspended=False)


@pytest.mark.asyncio
async def test_permits_allowed_role() -> None:
    guard = require_role(UserRole.ADMIN)
    admin = _user(UserRole.ADMIN)
    assert await guard(user=admin) is admin  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_rejects_disallowed_role() -> None:
    guard = require_role(UserRole.ADMIN)
    seeker = _user(UserRole.SEEKER)
    with pytest.raises(ForbiddenError) as exc:
        await guard(user=seeker)  # type: ignore[arg-type]
    assert exc.value.code == "role_forbidden"


@pytest.mark.asyncio
async def test_allows_any_of_multiple_roles() -> None:
    guard = require_role(UserRole.INSPECTOR, UserRole.TRUSTED_AGENT)
    inspector = _user(UserRole.INSPECTOR)
    assert await guard(user=inspector) is inspector  # type: ignore[arg-type]

    agent = _user(UserRole.TRUSTED_AGENT)
    assert await guard(user=agent) is agent  # type: ignore[arg-type]
