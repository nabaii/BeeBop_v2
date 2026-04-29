"""Reusable FastAPI dependencies: auth, role guards, DB/Redis access."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, UnauthorisedError
from app.core.security import decode_token, user_id_from_claims
from app.database import get_db
from app.models._enums import UserRole
from app.models.user import User


async def _auth_user(
    authorization: str | None,
    db: AsyncSession,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise UnauthorisedError("Missing bearer token.", code="missing_token")
    token = authorization.split(" ", 1)[1].strip()
    claims = decode_token(token, expected_kind="access")
    user = await db.get(User, user_id_from_claims(claims))
    if user is None or not user.is_active or user.is_suspended:
        raise UnauthorisedError("User not found or inactive.", code="user_inactive")
    return user


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the authenticated user from the Authorization header."""
    return await _auth_user(authorization, db)


async def get_current_user_optional(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Used by endpoints that differ for logged-out visitors (e.g. listing
    page with gated valuation report). Returns None instead of raising 401."""
    if not authorization:
        return None
    try:
        return await _auth_user(authorization, db)
    except UnauthorisedError:
        return None


def require_role(*roles: UserRole):
    """Dependency factory for role-gated routes.

    Usage:
        @router.get("/admin/queue", dependencies=[Depends(require_role(UserRole.ADMIN))])
    """
    allowed: frozenset[UserRole] = frozenset(roles)

    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise ForbiddenError(
                f"Role {user.role} not permitted.",
                code="role_forbidden",
            )
        return user

    return _dep


async def get_user_by_id(
    user_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> User:
    user = await db.get(User, user_id)
    if user is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("User not found.", code="user_not_found")
    return user
