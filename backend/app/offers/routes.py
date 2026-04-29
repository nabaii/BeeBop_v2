"""Offer routes — submission, response (counter/accept/reject), and listing
endpoints for both seeker and landlord dashboards."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.offers import service
from app.offers.schemas import (
    CounterPayload,
    OfferSubmitPayload,
    OfferThreadView,
    RejectPayload,
)

router = APIRouter(prefix="/offers", tags=["offers"])


# ---------------------------------------------------------------------------
# Seeker
# ---------------------------------------------------------------------------


@router.post("/listing/{listing_id}", response_model=OfferThreadView)
async def submit_offer(
    listing_id: uuid.UUID,
    payload: OfferSubmitPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferThreadView:
    offer = await service.submit_offer(
        seeker=user, listing_id=listing_id, payload=payload, db=db
    )
    await db.commit()
    return await service._build_thread_view(current=offer, db=db)


@router.get("/mine", response_model=list[OfferThreadView])
async def my_offers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OfferThreadView]:
    return await service.list_seeker_offers(seeker=user, db=db)


@router.get("/landlord", response_model=list[OfferThreadView])
async def landlord_offers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OfferThreadView]:
    return await service.list_landlord_offers(landlord=user, db=db)


# ---------------------------------------------------------------------------
# Per-offer responses (either party may act when it's their turn)
# ---------------------------------------------------------------------------


@router.post("/{offer_id}/accept", response_model=OfferThreadView)
async def accept(
    offer_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferThreadView:
    offer, _visit = await service.accept_offer(actor=user, offer_id=offer_id, db=db)
    await db.commit()
    return await service._build_thread_view(current=offer, db=db)


@router.post("/{offer_id}/counter", response_model=OfferThreadView)
async def counter(
    offer_id: uuid.UUID,
    payload: CounterPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferThreadView:
    offer = await service.counter_offer(
        actor=user, offer_id=offer_id, payload=payload, db=db
    )
    await db.commit()
    return await service._build_thread_view(current=offer, db=db)


@router.post("/{offer_id}/reject", response_model=OfferThreadView)
async def reject(
    offer_id: uuid.UUID,
    _payload: RejectPayload | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OfferThreadView:
    # Reason is captured client-side for analytics; backend records the
    # transition only. Empty body permitted.
    offer = await service.reject_offer(actor=user, offer_id=offer_id, db=db)
    await db.commit()
    return await service._build_thread_view(current=offer, db=db)
