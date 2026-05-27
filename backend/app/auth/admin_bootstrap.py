"""Production-safe first-admin bootstrap.

The public login form is OTP-only, so a deployed environment needs one user
record with role=admin before staff can reach `/internal/admin`. This module
lets operators seed that first account via backend environment variables.
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.config import Settings
from app.database import AsyncSessionLocal
from app.models._enums import UserRole
from app.models.user import User

logger = logging.getLogger(__name__)


def _normalise_email(email: str) -> str:
    return email.strip().lower()


async def bootstrap_admin_from_settings(settings: Settings) -> None:
    """Create or promote the configured bootstrap admin, if one is configured."""
    email = _normalise_email(settings.admin_bootstrap_email)
    if not email:
        return

    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()

        if existing is None:
            user = User(
                email=email,
                role=UserRole.ADMIN,
                first_name=settings.admin_bootstrap_first_name,
                last_name=settings.admin_bootstrap_last_name,
                is_active=True,
                is_suspended=False,
            )
            db.add(user)
            action = "created"
        else:
            existing.role = UserRole.ADMIN
            existing.first_name = settings.admin_bootstrap_first_name
            existing.last_name = settings.admin_bootstrap_last_name
            existing.is_active = True
            existing.is_suspended = False
            action = "promoted"

        await db.commit()
        logger.info("Bootstrap admin %s: %s", action, email)
