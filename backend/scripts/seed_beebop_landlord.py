"""Seed the BeeBop-managed landlord account.

Run once per environment:

    python -m scripts.seed_beebop_landlord

Idempotent - running again upgrades the same email to a landlord account and
refreshes the BeeBop-owned profile fields.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models._enums import AccountType, UserRole
from app.models.user import User

DEFAULT_EMAIL = "landlord-super@beebop.ng"
DEFAULT_FIRST_NAME = "BeeBop"
DEFAULT_LAST_NAME = "Landlord"


async def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the BeeBop landlord user.")
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--first", default=DEFAULT_FIRST_NAME)
    parser.add_argument("--last", default=DEFAULT_LAST_NAME)
    args = parser.parse_args()

    email = args.email.strip().lower()
    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing is None:
            existing = User(email=email)
            db.add(existing)
            action = "Created"
        else:
            action = "Updated"

        existing.role = UserRole.LANDLORD
        existing.first_name = args.first.strip()
        existing.last_name = args.last.strip()
        existing.account_type = AccountType.INDIVIDUAL
        existing.nin_verified = True
        existing.bvn_verified = True
        existing.is_active = True
        existing.is_suspended = False

        await db.commit()
        print(f"{action} BeeBop landlord {email}.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
