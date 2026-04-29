"""Booking routes — quote, create, accept/decline, cancel, set access details,
confirm check-in, list (seeker + host)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.bookings import service
from app.bookings.schemas import (
    AccessDetailsPayload,
    BookingQuote,
    BookingQuotePayload,
    BookingView,
    CancelBookingPayload,
    CreateBookingPayload,
    DeclinePayload,
)
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("/listing/{listing_id}/quote", response_model=BookingQuote)
async def quote(
    listing_id: uuid.UUID,
    payload: BookingQuotePayload,
    db: AsyncSession = Depends(get_db),
) -> BookingQuote:
    return await service.quote(
        listing_id=listing_id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        db=db,
    )


@router.post("/listing/{listing_id}", response_model=BookingView)
async def create(
    listing_id: uuid.UUID,
    payload: CreateBookingPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingView:
    booking, auth_url = await service.submit_booking(
        seeker=user, listing_id=listing_id, payload=payload, db=db
    )
    await db.commit()
    # Re-fetch to build the view consistently.
    bookings = await service.list_seeker_bookings(seeker=user, db=db)
    match = next((b for b in bookings if b.id == str(booking.id)), None)
    if match is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Booking vanished after create.", code="booking_missing")
    if auth_url is not None:
        match.paystack_authorization_url = auth_url
    return match


@router.post("/{booking_id}/accept", response_model=BookingView)
async def accept(
    booking_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingView:
    booking, auth_url = await service.accept_request(
        host=user, booking_id=booking_id, db=db
    )
    await db.commit()
    bookings = await service.list_host_bookings(host=user, listing_id=booking.listing_id, db=db)
    match = next((b for b in bookings if b.id == str(booking.id)), None)
    if match and auth_url is not None:
        match.paystack_authorization_url = auth_url
    if match is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Booking vanished after accept.", code="booking_missing")
    return match


@router.post("/{booking_id}/decline", response_model=BookingView)
async def decline(
    booking_id: uuid.UUID,
    payload: DeclinePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingView:
    booking = await service.decline_request(
        host=user, booking_id=booking_id, payload=payload, db=db
    )
    await db.commit()
    rows = await service.list_host_bookings(host=user, listing_id=booking.listing_id, db=db)
    match = next((b for b in rows if b.id == str(booking.id)), None)
    if match is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Booking vanished after decline.", code="booking_missing")
    return match


@router.post("/{booking_id}/cancel", response_model=BookingView)
async def cancel(
    booking_id: uuid.UUID,
    payload: CancelBookingPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingView:
    booking = await service.cancel_booking(
        actor=user, booking_id=booking_id, payload=payload, db=db
    )
    await db.commit()
    rows = (
        await service.list_seeker_bookings(seeker=user, db=db)
        if str(user.id) == str(booking.seeker_id)
        else await service.list_host_bookings(host=user, listing_id=booking.listing_id, db=db)
    )
    match = next((b for b in rows if b.id == str(booking.id)), None)
    if match is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Booking vanished after cancel.", code="booking_missing")
    return match


@router.post("/{booking_id}/access-details", response_model=BookingView)
async def set_access_details(
    booking_id: uuid.UUID,
    payload: AccessDetailsPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingView:
    booking = await service.set_access_details(
        host=user, booking_id=booking_id, payload=payload, db=db
    )
    await db.commit()
    rows = await service.list_host_bookings(host=user, listing_id=booking.listing_id, db=db)
    match = next((b for b in rows if b.id == str(booking.id)), None)
    if match is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Booking vanished.", code="booking_missing")
    return match


@router.post("/{booking_id}/check-in", response_model=BookingView)
async def confirm_check_in(
    booking_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingView:
    booking = await service.confirm_check_in(
        host=user, booking_id=booking_id, db=db
    )
    await db.commit()
    rows = await service.list_host_bookings(host=user, listing_id=booking.listing_id, db=db)
    match = next((b for b in rows if b.id == str(booking.id)), None)
    if match is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Booking vanished.", code="booking_missing")
    return match


@router.get("/mine", response_model=list[BookingView])
async def my_bookings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BookingView]:
    return await service.list_seeker_bookings(seeker=user, db=db)


@router.get("/host", response_model=list[BookingView])
async def host_bookings(
    listing_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BookingView]:
    return await service.list_host_bookings(host=user, listing_id=listing_id, db=db)


@router.get("/listing/{listing_id}/calendar")
async def calendar(
    listing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await service.calendar_blocks(listing_id=listing_id, db=db)
