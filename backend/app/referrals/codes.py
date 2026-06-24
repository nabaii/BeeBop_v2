"""Referral code generation and issuance (§2.1).

Format: a short name-derived uppercase prefix + a random suffix drawn from an
unambiguous alphabet (no 0/O/1/I/L), e.g. AMINA7K2. Globally unique — we check
for a collision and regenerate. Stored and compared uppercased so input is
case-insensitive (§2.1).
"""

from __future__ import annotations

import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.referral import ReferralCode
from app.models.user import User

# Excludes 0 O 1 I L per spec to avoid user transcription errors.
_SUFFIX_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_PREFIX_MAX = 5
_SUFFIX_LEN = 4
_FALLBACK_PREFIX = "BEE"
_MAX_COLLISION_RETRIES = 25


def _prefix_from_user(user: User) -> str:
    """A short alphabetic prefix derived from the user's name (or email)."""
    source = user.first_name or user.last_name or ""
    if not source and user.email:
        source = user.email.split("@", 1)[0]
    cleaned = re.sub(r"[^A-Za-z]", "", source).upper()
    if len(cleaned) < 3:
        cleaned = (cleaned + _FALLBACK_PREFIX)[:3]
    return cleaned[:_PREFIX_MAX]


def _random_suffix() -> str:
    return "".join(secrets.choice(_SUFFIX_ALPHABET) for _ in range(_SUFFIX_LEN))


def generate_code(user: User) -> str:
    """A candidate code. Caller must check global uniqueness before persisting."""
    return f"{_prefix_from_user(user)}{_random_suffix()}"


def normalize_code(raw: str) -> str:
    """Canonicalise user-entered codes — strip whitespace, uppercase."""
    return re.sub(r"\s+", "", raw or "").upper()


async def _code_taken(code: str, db: AsyncSession) -> bool:
    result = await db.execute(
        select(func.count()).select_from(ReferralCode).where(ReferralCode.code == code)
    )
    return (result.scalar() or 0) > 0


async def get_or_create_code(*, user: User, db: AsyncSession) -> ReferralCode:
    """Return the user's referral code, issuing one on first request.

    Idempotent: every user has exactly one code (unique on user_id). Safe to call
    at registration and lazily thereafter. Flushes but does not commit — the
    caller owns the transaction.
    """
    existing = (
        await db.execute(select(ReferralCode).where(ReferralCode.user_id == user.id))
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    for _ in range(_MAX_COLLISION_RETRIES):
        candidate = generate_code(user)
        if not await _code_taken(candidate, db):
            code = ReferralCode(user_id=user.id, code=candidate)
            db.add(code)
            await db.flush()
            return code

    raise RuntimeError("Could not generate a unique referral code after retries.")
