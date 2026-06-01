"""Seed the first admin account.

Run once per environment:

    python -m scripts.seed_admin --email founder@beebop.store --first Bee --last Bop

Idempotent — running again with the same email upgrades the user's role to
admin without changing other fields.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models._enums import UserRole
from app.models.user import User


async def main() -> int:
    parser = argparse.ArgumentParser(description="Seed a BeeBop admin user.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--first", required=True)
    parser.add_argument("--last", required=True)
    args = parser.parse_args()

    email = args.email.strip().lower()
    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing is not None:
            existing.role = UserRole.ADMIN
            existing.first_name = args.first
            existing.last_name = args.last
            await db.commit()
            print(f"Upgraded {email} to admin.")
            return 0

        user = User(
            email=email,
            role=UserRole.ADMIN,
            first_name=args.first,
            last_name=args.last,
        )
        db.add(user)
        await db.commit()
        print(f"Created admin {email}.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
