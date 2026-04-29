"""Auth endpoints — OTP request/verify, token refresh, logout."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.otp_service import OtpService
from app.auth.schemas import (
    OtpRequestPayload,
    OtpRequestResponse,
    OtpVerifyPayload,
    RefreshPayload,
    TokenPair,
    VerifyResponse,
)
from app.core.dependencies import get_current_user
from app.core.redis_client import get_redis
from app.database import get_db
from app.models._enums import UserRole
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/otp/request",
    response_model=OtpRequestResponse,
    status_code=status.HTTP_200_OK,
)
async def request_otp(
    payload: OtpRequestPayload,
    redis: Redis = Depends(get_redis),
) -> OtpRequestResponse:
    """Dispatch a fresh 6-digit OTP via email or WhatsApp.

    Same endpoint handles login and registration — a user's existence is
    checked at verify time, not at request time. This avoids leaking which
    email/phone values are registered.
    """
    otp = OtpService(redis)
    await otp.request(channel=payload.channel, identifier=payload.identifier)
    return OtpRequestResponse()


@router.post("/otp/verify", response_model=VerifyResponse)
async def verify_otp(
    payload: OtpVerifyPayload,
    role_if_new: UserRole = UserRole.SEEKER,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> VerifyResponse:
    """Verify code and issue tokens. New users are created with role_if_new
    (default seeker). Landlord registration passes role=landlord.
    """
    return await service.verify_otp_and_issue_tokens(
        channel=payload.channel,
        identifier=payload.identifier,
        code=payload.code,
        role_if_new=role_if_new,
        db=db,
        redis=redis,
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    payload: RefreshPayload,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> TokenPair:
    """Rotate refresh token. Replay of the old jti is detected and revokes
    the active session (forces re-login)."""
    return await service.rotate_refresh_token(
        refresh_token=payload.refresh_token, db=db, redis=redis
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
) -> None:
    await service.logout(user_id=user.id, redis=redis)
