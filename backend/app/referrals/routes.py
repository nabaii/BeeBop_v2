"""Referral endpoints — the user's own code, and applying a code at checkout.

The dashboard (balances, activity feed) and admin views land in later sprints.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.referrals import service
from app.referrals.codes import get_or_create_code
from app.referrals.schemas import ApplyCodePayload, AttributionView, MyCodeView

router = APIRouter(prefix="/referrals", tags=["referrals"])
settings = get_settings()


def _share_link(code: str) -> str:
    return f"{settings.public_web_base_url.rstrip('/')}/r/{code}"


@router.get("/me/code", response_model=MyCodeView)
async def my_code(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> MyCodeView:
    """The signed-in user's referral code + share link. Issues one lazily for
    any pre-existing account that predates auto-issuance."""
    code = await get_or_create_code(user=user, db=db)
    await db.commit()
    return MyCodeView(
        code=code.code,
        share_link=_share_link(code.code),
        tier=code.tier,
        status=code.status,
    )


@router.post("/apply", response_model=AttributionView)
async def apply_code(
    payload: ApplyCodePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttributionView:
    """Path B — attach a referral code to the seeker's transaction at checkout."""
    attribution = await service.apply_referral_code(
        seeker=user,
        agreement_id=payload.agreement_id,
        raw_code=payload.code,
        db=db,
    )
    await db.commit()
    return AttributionView(
        agreement_id=str(attribution.agreement_id),
        code=attribution.code,
        applied_at=attribution.applied_at,
        sealed=attribution.sealed_at is not None,
    )


@router.get("/agreement/{agreement_id}", response_model=AttributionView | None)
async def agreement_attribution(
    agreement_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AttributionView | None:
    """The code currently written onto an agreement, or null. Used by the
    checkout UI to show the applied/locked state."""
    attribution = await service._existing_attribution(agreement_id=agreement_id, db=db)
    if attribution is None:
        return None
    return AttributionView(
        agreement_id=str(attribution.agreement_id),
        code=attribution.code,
        applied_at=attribution.applied_at,
        sealed=attribution.sealed_at is not None,
    )
