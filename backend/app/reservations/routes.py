"""Reservation routes — quote, create (Paystack), cancel, list (seeker)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.exceptions import NotFoundError
from app.database import get_db
from app.models.user import User
from app.reservations import service
from app.reservations.schemas import (
    CancelReservationPayload,
    CreateReservationPayload,
    ReservationQuote,
    ReservationView,
)

router = APIRouter(prefix="/reservations", tags=["reservations"])


@router.get(
    "/listing/{listing_id}/quote/{unit_type_id}", response_model=ReservationQuote
)
async def quote(
    listing_id: uuid.UUID,
    unit_type_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ReservationQuote:
    return await service.quote(
        listing_id=listing_id, unit_type_id=unit_type_id, db=db
    )


@router.post("/listing/{listing_id}", response_model=ReservationView)
async def create(
    listing_id: uuid.UUID,
    payload: CreateReservationPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReservationView:
    reservation, auth_url = await service.create_reservation(
        seeker=user,
        listing_id=listing_id,
        unit_type_id=uuid.UUID(payload.unit_type_id),
        db=db,
    )
    await db.commit()
    rows = await service.list_seeker_reservations(seeker=user, db=db)
    match = next((r for r in rows if r.id == str(reservation.id)), None)
    if match is None:
        raise NotFoundError("Reservation vanished after create.", code="reservation_missing")
    match.paystack_authorization_url = auth_url
    return match


@router.post("/{reservation_id}/cancel", response_model=ReservationView)
async def cancel(
    reservation_id: uuid.UUID,
    payload: CancelReservationPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReservationView:
    reservation = await service.cancel_reservation(
        actor=user, reservation_id=reservation_id, reason=payload.reason, db=db
    )
    await db.commit()
    rows = await service.list_seeker_reservations(seeker=user, db=db)
    match = next((r for r in rows if r.id == str(reservation.id)), None)
    if match is None:
        # Cancelled by landlord/admin — re-fetch a single view.
        from app.models.listing import Listing

        listing = await db.get(Listing, reservation.listing_id)
        if listing is None:
            raise NotFoundError("Reservation vanished after cancel.", code="reservation_missing")
        return service._to_view(reservation=reservation, listing=listing)
    return match


@router.get("/mine", response_model=list[ReservationView])
async def my_reservations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReservationView]:
    return await service.list_seeker_reservations(seeker=user, db=db)
