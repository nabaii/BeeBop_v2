"""Auth service — OTP verify -> user lookup/creation -> JWT issuance."""

from __future__ import annotations

import uuid

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.otp_service import OtpService
from app.auth.refresh_store import RefreshTokenStore
from app.auth.schemas import AuthenticatedUser, TokenPair, VerifyResponse
from app.core.exceptions import UnauthorisedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    user_id_from_claims,
)
from app.models._enums import AccountType, UserRole
from app.models.user import User

DEV_LANDLORD_EMAIL = "landlord-super@beebop.ng"


def _is_onboarded(user: User) -> bool:
    # Sprint 1 definition: identity complete. Landlords additionally need
    # verification status applied; agency users need CAC status set.
    if not (user.first_name and user.last_name):
        return False
    if user.role == UserRole.LANDLORD and user.account_type is None:
        return False
    return True


def _to_authenticated(user: User) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(user.id),
        email=user.email,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        onboarding_complete=_is_onboarded(user),
    )


async def _issue_token_pair(
    *, user: User, refresh_store: RefreshTokenStore
) -> TokenPair:
    access, _ = create_access_token(user.id, user.role)
    refresh, refresh_jti = create_refresh_token(user.id, user.role)
    await refresh_store.record(user_id=str(user.id), jti=refresh_jti)
    return TokenPair(access_token=access, refresh_token=refresh)


async def verify_otp_and_issue_tokens(
    *,
    channel: str,
    identifier: str,
    code: str,
    role_if_new: UserRole,
    db: AsyncSession,
    redis: Redis,
) -> VerifyResponse:
    otp = OtpService(redis)
    await otp.verify(channel=channel, identifier=identifier, code=code)  # type: ignore[arg-type]

    # Email is the primary platform identifier. For WhatsApp flows the phone
    # is stored; the user's email is captured during onboarding.
    lookup_col = User.email if channel == "email" else User.phone
    result = await db.execute(select(User).where(lookup_col == identifier))
    user = result.scalar_one_or_none()

    is_new = False
    if user is None:
        is_new = True
        user = User(
            email=identifier if channel == "email" else f"pending-{uuid.uuid4().hex[:12]}@beebop.ng",
            phone=identifier if channel == "whatsapp" else None,
            role=role_if_new,
        )
        db.add(user)
        await db.flush()

    refresh_store = RefreshTokenStore(redis)
    tokens = await _issue_token_pair(user=user, refresh_store=refresh_store)
    await db.commit()
    return VerifyResponse(tokens=tokens, user=_to_authenticated(user), is_new_user=is_new)


async def rotate_refresh_token(
    *, refresh_token: str, db: AsyncSession, redis: Redis
) -> TokenPair:
    claims = decode_token(refresh_token, expected_kind="refresh")
    store = RefreshTokenStore(redis)
    if not await store.is_current(user_id=claims.sub, jti=claims.jti):
        # Possible replay or stolen token — revoke any active refresh and 401.
        await store.revoke(claims.sub)
        raise UnauthorisedError("Refresh token has been rotated.", code="refresh_replay")

    user = await db.get(User, user_id_from_claims(claims))
    if user is None or not user.is_active or user.is_suspended:
        raise UnauthorisedError("User not found or inactive.", code="user_inactive")

    return await _issue_token_pair(user=user, refresh_store=store)


async def dev_login_as_landlord_super(
    *, db: AsyncSession, redis: Redis
) -> VerifyResponse:
    """Dev-only bypass: load or create `landlord-super@beebop.ng` and issue a
    real token pair. Owns the listings created by `scripts.seed_listings`.
    """
    result = await db.execute(select(User).where(User.email == DEV_LANDLORD_EMAIL))
    user = result.scalar_one_or_none()

    is_new = False
    if user is None:
        is_new = True
        user = User(
            email=DEV_LANDLORD_EMAIL,
            role=UserRole.LANDLORD,
            first_name="Landlord",
            last_name="Super",
            account_type=AccountType.INDIVIDUAL,
            nin_verified=True,
            bvn_verified=True,
        )
        db.add(user)
        await db.flush()

    refresh_store = RefreshTokenStore(redis)
    tokens = await _issue_token_pair(user=user, refresh_store=refresh_store)
    await db.commit()
    return VerifyResponse(tokens=tokens, user=_to_authenticated(user), is_new_user=is_new)


async def logout(*, user_id: uuid.UUID, redis: Redis) -> None:
    await RefreshTokenStore(redis).revoke(str(user_id))


async def get_authenticated_user_view(user: User) -> AuthenticatedUser:
    return _to_authenticated(user)
