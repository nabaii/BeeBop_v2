"""Production-safe first-admin bootstrap.

Production uses OTP plus password login for accounts that have a password hash.
This module lets operators seed the first admin account via backend environment
variables so staff can reach `/internal/admin`.
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.config import Settings
from app.core.security import hash_password
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
            account = User(
                email=email,
                role=UserRole.ADMIN,
                first_name=settings.admin_bootstrap_first_name,
                last_name=settings.admin_bootstrap_last_name,
                is_active=True,
                is_suspended=False,
            )
            db.add(account)
            action = "created"
        else:
            account = existing
            account.role = UserRole.ADMIN
            account.first_name = settings.admin_bootstrap_first_name
            account.last_name = settings.admin_bootstrap_last_name
            account.is_active = True
            account.is_suspended = False
            action = "promoted"

        password = settings.admin_bootstrap_password.strip()
        if password:
            if (
                len(password) < 8
                or not any(c.isalpha() for c in password)
                or not any(c.isdigit() for c in password)
            ):
                logger.warning(
                    "Bootstrap admin password ignored for %s: must be 8+ chars with a letter and number",
                    email,
                )
            else:
                account.password_hash = hash_password(password)
                action = f"{action} with password"

        await db.commit()
        logger.info("Bootstrap admin %s: %s", action, email)
