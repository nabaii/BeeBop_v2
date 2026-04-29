"""Agreement routes — list, detail, signature OTP, signature submit, download.

The Paystack webhook lives in `app/payments/routes.py` so all payment-side
code is colocated.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.agreements import service
from app.agreements.schemas import (
    AgreementPresignedView,
    AgreementView,
    SignaturePayload,
    SignatureRequestPayload,
)
from app.core.dependencies import get_current_user
from app.core.redis_client import get_redis
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/agreements", tags=["agreements"])


@router.get("/mine", response_model=list[AgreementView])
async def my_agreements(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AgreementView]:
    return await service.list_my_agreements(user=user, db=db)


@router.get("/{agreement_id}", response_model=AgreementView)
async def get_agreement(
    agreement_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgreementView:
    return await service.agreement_detail(user=user, agreement_id=agreement_id, db=db)


@router.post(
    "/{agreement_id}/signature/otp",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def signature_otp(
    agreement_id: uuid.UUID,
    payload: SignatureRequestPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> None:
    await service.request_signature_otp(
        user=user,
        agreement_id=agreement_id,
        channel=payload.channel,
        db=db,
        redis=redis,
    )


@router.post("/{agreement_id}/signature", response_model=AgreementView)
async def submit_signature(
    agreement_id: uuid.UUID,
    payload: SignaturePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> AgreementView:
    await service.submit_signature(
        user=user,
        agreement_id=agreement_id,
        channel=payload.channel,
        code=payload.code,
        db=db,
        redis=redis,
    )
    await db.commit()
    return await service.agreement_detail(user=user, agreement_id=agreement_id, db=db)


@router.get("/{agreement_id}/download", response_model=AgreementPresignedView)
async def download(
    agreement_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgreementPresignedView:
    url, expires = await service.presigned_download(
        user=user, agreement_id=agreement_id, db=db
    )
    return AgreementPresignedView(url=url, expires_in_seconds=expires)
