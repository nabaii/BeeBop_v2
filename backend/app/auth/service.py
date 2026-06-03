"""Auth service — OTP verify -> user lookup/creation -> JWT issuance."""

from __future__ import annotations

import uuid

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.otp_service import OtpService
from app.auth.refresh_store import RefreshTokenStore
from app.auth.schemas import AuthenticatedUser, TokenPair, VerifyResponse
from app.core.exceptions import UnauthorisedError, ValidationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    user_id_from_claims,
    verify_password,
)
from app.models._enums import AccountType, ListingCategory, UserRole
from app.models.user import User

DEV_USERS: dict[UserRole, dict[str, str | bool | list[str]]] = {
    UserRole.SEEKER: {
        "email": "seeker-super@beebop.store",
        "first_name": "Seeker",
        "last_name": "Super",
        "needs_account_type": False,
        "category_preferences": [
            ListingCategory.OFF_CAMPUS.value,
            ListingCategory.SHORT_LET.value,
            ListingCategory.RENT.value,
            ListingCategory.SALES.value,
        ],
    },
    UserRole.LANDLORD: {
        "email": "landlord-super@beebop.ng",
        "first_name": "BeeBop",
        "last_name": "Landlord",
        "needs_account_type": True,
    },
    UserRole.ADMIN: {
        "email": "admin-super@beebop.store",
        "first_name": "Admin",
        "last_name": "Super",
        "needs_account_type": False,
    },
}

PUBLIC_SIGNUP_ROLES = frozenset({UserRole.SEEKER, UserRole.LANDLORD})


def _is_onboarded(user: User) -> bool:
    # Sprint 1 definition: identity complete. Landlords additionally need
    # verification status applied; agency users need CAC status set.
    if not (user.first_name and user.last_name):
        return False
    if user.role == UserRole.LANDLORD and user.account_type is None:
        return False
    if user.role == UserRole.SEEKER and not user.category_preferences:
        return False
    return True


def _apply_dev_user_spec(
    *, user: User, role: UserRole, spec: dict[str, str | bool | list[str]]
) -> None:
    user.role = role
    user.first_name = str(spec["first_name"])
    user.last_name = str(spec["last_name"])
    user.is_active = True
    user.is_suspended = False
    user.nin_verified = True
    user.bvn_verified = True

    if spec["needs_account_type"]:
        user.account_type = AccountType.INDIVIDUAL

    category_preferences = spec.get("category_preferences")
    if category_preferences is not None:
        user.category_preferences = list(category_preferences)


def _to_authenticated(user: User) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(user.id),
        email=user.email,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        onboarding_complete=_is_onboarded(user),
        has_password=user.password_hash is not None,
    )


def _normalise_email(email: str) -> str:
    return email.strip().lower()


def _assert_user_can_sign_in(user: User) -> None:
    if not user.is_active or user.is_suspended:
        raise UnauthorisedError("User not found or inactive.", code="user_inactive")


async def _issue_token_pair(
    *, user: User, refresh_store: RefreshTokenStore
) -> TokenPair:
    access, _ = create_access_token(user.id, user.role)
    refresh, refresh_jti = create_refresh_token(user.id, user.role)
    await refresh_store.record(user_id=str(user.id), jti=refresh_jti)
    return TokenPair(access_token=access, refresh_token=refresh)


async def login_with_password(
    *,
    email: str,
    password: str,
    db: AsyncSession,
    redis: Redis,
) -> VerifyResponse:
    """Verify an existing user's password and issue tokens."""
    result = await db.execute(select(User).where(User.email == _normalise_email(email)))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorisedError(
            "Invalid email or password.",
            code="invalid_credentials",
        )

    _assert_user_can_sign_in(user)
    refresh_store = RefreshTokenStore(redis)
    tokens = await _issue_token_pair(user=user, refresh_store=refresh_store)
    return VerifyResponse(tokens=tokens, user=_to_authenticated(user), is_new_user=False)


async def set_password(
    *,
    user: User,
    current_password: str | None,
    new_password: str,
    db: AsyncSession,
) -> AuthenticatedUser:
    """Set or rotate the signed-in user's password."""
    if user.password_hash and not verify_password(
        current_password or "", user.password_hash
    ):
        raise UnauthorisedError(
            "Current password is incorrect.",
            code="invalid_current_password",
        )

    user.password_hash = hash_password(new_password)
    await db.flush()
    return _to_authenticated(user)


async def verify_otp_and_issue_tokens(
    *,
    channel: str,
    identifier: str,
    code: str,
    role_if_new: UserRole,
    db: AsyncSession,
    redis: Redis,
    password: str | None = None,
) -> VerifyResponse:
    if role_if_new not in PUBLIC_SIGNUP_ROLES:
        raise ValidationError(
            "Only seeker and landlord accounts can self-register.",
            code="role_not_public_signup",
        )

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
        if not password:
            raise ValidationError(
                "Password is required for registration.",
                code="password_required",
            )
        if len(password) <= 10:
            raise ValidationError(
                "Password must be above 10 characters.",
                code="password_too_short",
            )
        if not any(c.isdigit() for c in password):
            raise ValidationError(
                "Password must contain at least one number.",
                code="password_no_number",
            )

        user = User(
            email=identifier if channel == "email" else f"pending-{uuid.uuid4().hex[:12]}@beebop.store",
            phone=identifier if channel == "whatsapp" else None,
            role=role_if_new,
            password_hash=hash_password(password),
            is_active=True,
            is_suspended=False,
        )
        db.add(user)
        await db.flush()

    _assert_user_can_sign_in(user)
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


async def dev_login_as(
    *, role: UserRole, db: AsyncSession, redis: Redis
) -> VerifyResponse:
    """Dev-only bypass: load or create a canonical `<role>-super@beebop.store`
    user and issue a real token pair. The landlord account owns listings
    created by `scripts.seed_listings`.
    """
    spec = DEV_USERS.get(role)
    if spec is None:
        raise ValueError(f"dev-login does not support role={role}")

    email = str(spec["email"])
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    is_new = False
    if user is None:
        is_new = True
        user = User(
            email=email,
        )
        db.add(user)

    _apply_dev_user_spec(user=user, role=role, spec=spec)
    await db.flush()

    refresh_store = RefreshTokenStore(redis)
    tokens = await _issue_token_pair(user=user, refresh_store=refresh_store)
    await db.commit()
    return VerifyResponse(tokens=tokens, user=_to_authenticated(user), is_new_user=is_new)


async def logout(*, user_id: uuid.UUID, redis: Redis) -> None:
    await RefreshTokenStore(redis).revoke(str(user_id))


async def get_authenticated_user_view(user: User) -> AuthenticatedUser:
    return _to_authenticated(user)
