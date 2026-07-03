"""Short-let booking lifecycle.

Two flows — both gated on the listing's instant-booking flag.

  Instant booking:
    seeker confirms dates → Paystack initialise → seeker pays (Paystack
    redirect / inline) → webhook flips booking to CONFIRMED → access details
    released on check-in day by the booking sweeper.

  Request flow:
    seeker confirms dates → booking saved REQUESTED → host has 24h to
    Accept/Decline → Accept triggers Paystack initialise → same confirmation
    flow as above. Decline is final and the seeker is notified.

Double-booking prevention:
  • Application-level guard inside `submit_booking` and `accept_request` via
    `availability.has_conflict`.
  • PostgreSQL serialisable transaction recommended in production for the
    accept path so two simultaneous accepts can't both succeed (Sprint 11
    keeps it at the default isolation; the conflict check makes it safe in
    practice for MVP volume).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.bookings.availability import blocked_days_for_listing, has_conflict
from app.bookings.pricing import calculate_quote
from app.bookings.schemas import (
    AccessDetailsPayload,
    BookingQuote,
    BookingView,
    CancelBookingPayload,
    CreateBookingPayload,
    DeclinePayload,
)
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.integrations.paystack import get_paystack, make_reference, payment_callback_url
from app.models._enums import BookingStatus, ListingCategory, ListingStatus, UserRole
from app.models.booking import Booking
from app.models.listing import Listing
from app.models.user import User
from app.notifications.dispatch import dispatch_notification

REQUEST_DECISION_WINDOW = timedelta(hours=24)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _short_let_pricing(listing: Listing) -> tuple[float, float | None, int, int, bool]:
    td = listing.type_data or {}
    base = td.get("base_rate")
    if not base:
        raise ValidationError("Listing has no base rate set.", code="no_base_rate")
    return (
        float(base),
        float(td["weekend_rate"]) if td.get("weekend_rate") is not None else None,
        int(td.get("min_stay_nights") or 1),
        int(td.get("turnaround_days") or 0),
        bool(td.get("instant_booking")),
    )


async def _load_short_let(db: AsyncSession, listing_id: uuid.UUID) -> Listing:
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if listing.category != ListingCategory.SHORT_LET:
        raise ValidationError(
            "Bookings only apply to short-let listings.", code="not_short_let"
        )
    if listing.status not in (
        ListingStatus.DOC_VERIFIED,
        ListingStatus.FULLY_VERIFIED,
        ListingStatus.LIVE_UNVERIFIED,
    ):
        raise ConflictError(
            "Listing is not currently accepting bookings.",
            code="listing_not_accepting_bookings",
        )
    return listing


async def quote(
    *,
    listing_id: uuid.UUID,
    check_in: date,
    check_out: date,
    db: AsyncSession,
) -> BookingQuote:
    listing = await _load_short_let(db, listing_id)
    base, weekend, min_stay, _turn, instant = _short_let_pricing(listing)
    calc = calculate_quote(
        check_in=check_in, check_out=check_out, base_rate=base, weekend_rate=weekend
    )
    return BookingQuote(
        nights=calc.nights,
        base_total=calc.base_total,
        weekend_uplift=calc.weekend_uplift,
        seeker_fee=calc.seeker_fee,
        grand_total=calc.grand_total,
        host_payout=calc.host_payout,
        instant_booking=instant,
        min_stay_satisfied=calc.nights >= min_stay,
    )


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------


async def submit_booking(
    *,
    seeker: User,
    listing_id: uuid.UUID,
    payload: CreateBookingPayload,
    db: AsyncSession,
) -> tuple[Booking, str | None]:
    if seeker.role != UserRole.SEEKER:
        raise ForbiddenError("Only seekers can book.", code="not_seeker")

    listing = await _load_short_let(db, listing_id)
    if listing.owner_id == seeker.id:
        raise ForbiddenError("You cannot book your own listing.", code="self_booking")

    base, weekend, min_stay, turnaround, instant = _short_let_pricing(listing)

    if payload.check_in < date.today():
        raise ValidationError("Check-in must be today or later.", code="past_check_in")
    nights = (payload.check_out - payload.check_in).days
    if nights < min_stay:
        raise ValidationError(
            f"Minimum stay for this listing is {min_stay} night(s).",
            code="below_min_stay",
        )

    if await has_conflict(
        db=db,
        listing_id=listing_id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        turnaround_days=turnaround,
    ):
        raise ConflictError(
            "Those dates overlap with an existing booking.",
            code="dates_unavailable",
        )

    calc = calculate_quote(
        check_in=payload.check_in,
        check_out=payload.check_out,
        base_rate=base,
        weekend_rate=weekend,
    )

    booking = Booking(
        listing_id=listing.id,
        seeker_id=seeker.id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        guest_count=payload.guest_count,
        status=BookingStatus.REQUESTED,
        instant_booking=instant,
        base_total=calc.base_total,
        weekend_uplift=calc.weekend_uplift,
        seeker_fee=calc.seeker_fee,
        host_fee=calc.host_fee,
        grand_total=calc.grand_total,
    )
    if not instant:
        booking.decision_deadline = datetime.now(timezone.utc) + REQUEST_DECISION_WINDOW

    db.add(booking)
    await db.flush()

    auth_url: str | None = None
    if instant:
        # Capture payment immediately. Webhook will mark CONFIRMED on success.
        auth_url = await _initialise_payment(booking=booking, seeker=seeker, db=db)
        await dispatch_notification(
            user_id=listing.owner_id,
            event_type="booking.confirmed",
            payload={
                "listing_id": str(listing.id),
                "listing_title": listing.title or "your short-let",
                "check_in": booking.check_in.isoformat(),
                "check_out": booking.check_out.isoformat(),
            },
            db=db,
        )
    else:
        await dispatch_notification(
            user_id=listing.owner_id,
            event_type="booking.requested",
            payload={
                "booking_id": str(booking.id),
                "listing_id": str(listing.id),
                "listing_title": listing.title or "your short-let",
                "nights": calc.nights,
                "amount": calc.base_total,
                "decision_deadline": booking.decision_deadline.isoformat()
                if booking.decision_deadline
                else None,
            },
            db=db,
        )

    return booking, auth_url


async def _initialise_payment(
    *, booking: Booking, seeker: User, db: AsyncSession
) -> str | None:
    paystack = get_paystack()
    ref = make_reference("book")
    result = await paystack.initialise_payment(
        amount_naira=float(booking.grand_total),
        email=seeker.email,
        reference=ref,
        callback_url=payment_callback_url(),
        metadata={"booking_id": str(booking.id)},
    )
    booking.paystack_reference = ref
    await db.flush()
    return result.authorization_url


# ---------------------------------------------------------------------------
# Host: accept / decline a request-flow booking
# ---------------------------------------------------------------------------


async def accept_request(
    *, host: User, booking_id: uuid.UUID, db: AsyncSession
) -> tuple[Booking, str | None]:
    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found.", code="booking_not_found")
    listing = await db.get(Listing, booking.listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if str(listing.owner_id) != str(host.id):
        raise ForbiddenError("Not your listing.", code="listing_not_yours")
    if booking.status != BookingStatus.REQUESTED or booking.instant_booking:
        raise ConflictError(
            "Booking is not awaiting host decision.", code="not_pending_decision"
        )
    _, _, _, turnaround, _ = _short_let_pricing(listing)
    if await has_conflict(
        db=db,
        listing_id=listing.id,
        check_in=booking.check_in,
        check_out=booking.check_out,
        turnaround_days=turnaround,
        ignore_booking_id=booking.id,
    ):
        raise ConflictError(
            "Those dates were taken by another booking.", code="dates_unavailable"
        )

    booking.decided_at = datetime.now(timezone.utc)
    seeker = await db.get(User, booking.seeker_id)
    if seeker is None:
        raise NotFoundError("Seeker not found.", code="seeker_not_found")
    auth_url = await _initialise_payment(booking=booking, seeker=seeker, db=db)

    await dispatch_notification(
        user_id=booking.seeker_id,
        event_type="booking.confirmed",
        payload={
            "booking_id": str(booking.id),
            "listing_id": str(listing.id),
            "listing_title": listing.title or "the property",
            "check_in": booking.check_in.isoformat(),
            "check_out": booking.check_out.isoformat(),
            "authorization_url": auth_url,
        },
        db=db,
    )
    return booking, auth_url


async def decline_request(
    *,
    host: User,
    booking_id: uuid.UUID,
    payload: DeclinePayload,
    db: AsyncSession,
) -> Booking:
    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found.", code="booking_not_found")
    listing = await db.get(Listing, booking.listing_id)
    if listing is None or str(listing.owner_id) != str(host.id):
        raise ForbiddenError("Not your listing.", code="listing_not_yours")
    if booking.status != BookingStatus.REQUESTED:
        raise ConflictError("Booking is no longer pending.", code="not_pending")

    booking.status = BookingStatus.CANCELLED
    booking.decided_at = datetime.now(timezone.utc)
    booking.cancelled_at = booking.decided_at
    booking.decline_reason = payload.reason
    await db.flush()

    await dispatch_notification(
        user_id=booking.seeker_id,
        event_type="booking.declined",
        payload={
            "booking_id": str(booking.id),
            "listing_title": listing.title or "the property",
            "reason": payload.reason,
        },
        db=db,
    )
    return booking


# ---------------------------------------------------------------------------
# Cancellations (seeker)
# ---------------------------------------------------------------------------


async def cancel_booking(
    *,
    actor: User,
    booking_id: uuid.UUID,
    payload: CancelBookingPayload,
    db: AsyncSession,
) -> Booking:
    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found.", code="booking_not_found")
    listing = await db.get(Listing, booking.listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")

    if str(actor.id) not in (str(booking.seeker_id), str(listing.owner_id)) and actor.role != UserRole.ADMIN:
        raise ForbiddenError("Not your booking.", code="cancel_not_permitted")
    if booking.status not in (
        BookingStatus.REQUESTED,
        BookingStatus.CONFIRMED,
    ):
        raise ConflictError("Booking is no longer cancellable.", code="booking_terminal")

    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = datetime.now(timezone.utc)
    booking.cancellation_reason = payload.reason
    await db.flush()

    notify = {booking.seeker_id, listing.owner_id}
    notify.discard(actor.id)
    for uid in notify:
        await dispatch_notification(
            user_id=uid,
            event_type="booking.cancelled",
            payload={
                "booking_id": str(booking.id),
                "listing_title": listing.title or "the property",
                "reason": payload.reason,
            },
            db=db,
        )
    return booking


# ---------------------------------------------------------------------------
# Payment confirmation (called from the Paystack webhook)
# ---------------------------------------------------------------------------


async def confirm_payment(
    *, booking_id: uuid.UUID, reference: str, db: AsyncSession
) -> Booking | None:
    booking = await db.get(Booking, booking_id)
    if booking is None or booking.paystack_reference != reference:
        return None
    if booking.status not in (
        BookingStatus.REQUESTED,
        BookingStatus.CONFIRMED,
    ):
        return booking
    booking.status = BookingStatus.CONFIRMED
    booking.payment_confirmed_at = datetime.now(timezone.utc)
    await db.flush()
    return booking


# ---------------------------------------------------------------------------
# Access details + check-in confirmation + payout
# ---------------------------------------------------------------------------


async def set_access_details(
    *,
    host: User,
    booking_id: uuid.UUID,
    payload: AccessDetailsPayload,
    db: AsyncSession,
) -> Booking:
    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found.", code="booking_not_found")
    listing = await db.get(Listing, booking.listing_id)
    if listing is None or str(listing.owner_id) != str(host.id):
        raise ForbiddenError("Not your booking.", code="not_your_booking")
    if booking.status != BookingStatus.CONFIRMED:
        raise ConflictError(
            "Access details can only be set on confirmed bookings.",
            code="not_confirmed",
        )
    booking.access_details = payload.access_details
    await db.flush()
    return booking


async def release_access_details(
    *, booking: Booking, db: AsyncSession
) -> None:
    if booking.access_details_released_at is not None:
        return
    if booking.status != BookingStatus.CONFIRMED:
        return
    booking.access_details_released_at = datetime.now(timezone.utc)
    listing = await db.get(Listing, booking.listing_id)
    await dispatch_notification(
        user_id=booking.seeker_id,
        event_type="access_details.released",
        payload={
            "booking_id": str(booking.id),
            "listing_title": listing.title if listing else "your stay",
            "access_details": booking.access_details or "",
            "check_in": booking.check_in.isoformat(),
        },
        db=db,
    )


async def confirm_check_in(
    *, host: User, booking_id: uuid.UUID, db: AsyncSession
) -> Booking:
    """Triggers the host payout."""
    booking = await db.get(Booking, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found.", code="booking_not_found")
    listing = await db.get(Listing, booking.listing_id)
    if listing is None or str(listing.owner_id) != str(host.id):
        raise ForbiddenError("Not your booking.", code="not_your_booking")
    if booking.status != BookingStatus.CONFIRMED:
        raise ConflictError("Booking is not confirmed.", code="not_confirmed")
    if booking.checked_in_at is not None:
        return booking

    booking.checked_in_at = datetime.now(timezone.utc)
    payout_naira = float(Decimal(str(booking.base_total)) - Decimal(str(booking.host_fee)))
    booking.payout_amount = payout_naira
    booking.payout_at = datetime.now(timezone.utc)
    booking.payout_reference = make_reference("payout")
    booking.status = BookingStatus.COMPLETED
    await db.flush()

    # Live transfer happens via Paystack `/transfer`. The stub records the
    # intent; live integration uses the host's bank-account-recipient setup
    # captured during landlord onboarding (Sprint 1 placeholder).
    await dispatch_notification(
        user_id=listing.owner_id,
        event_type="host.payout",
        payload={
            "booking_id": str(booking.id),
            "amount": payout_naira,
            "listing_title": listing.title or "your short-let",
        },
        db=db,
    )
    return booking


# ---------------------------------------------------------------------------
# Lists + view
# ---------------------------------------------------------------------------


def _full_name(user: User) -> str:
    parts = [p for p in (user.first_name, user.last_name) if p]
    if parts:
        return " ".join(parts)
    return user.business_name or user.email


def _to_view(
    *,
    booking: Booking,
    listing: Listing,
    seeker: User,
    host: User,
    show_access: bool,
    auth_url: str | None = None,
) -> BookingView:
    return BookingView(
        id=str(booking.id),
        listing_id=str(listing.id),
        listing_title=listing.title or "Untitled",
        seeker_id=str(seeker.id),
        seeker_first_name=seeker.first_name,
        host_id=str(host.id),
        host_first_name=host.first_name,
        check_in=booking.check_in,
        check_out=booking.check_out,
        guest_count=booking.guest_count,
        status=booking.status,
        instant_booking=booking.instant_booking,
        base_total=float(booking.base_total),
        weekend_uplift=float(booking.weekend_uplift),
        seeker_fee=float(booking.seeker_fee),
        host_fee=float(booking.host_fee),
        grand_total=float(booking.grand_total),
        payment_confirmed_at=booking.payment_confirmed_at,
        decided_at=booking.decided_at,
        decision_deadline=booking.decision_deadline,
        decline_reason=booking.decline_reason,
        access_details_visible=show_access and booking.access_details_released_at is not None,
        access_details=(
            booking.access_details
            if show_access and booking.access_details_released_at is not None
            else None
        ),
        checked_in_at=booking.checked_in_at,
        payout_at=booking.payout_at,
        payout_amount=(
            float(booking.payout_amount) if booking.payout_amount is not None else None
        ),
        cancelled_at=booking.cancelled_at,
        cancellation_reason=booking.cancellation_reason,
        paystack_authorization_url=auth_url,
    )


async def list_seeker_bookings(
    *, seeker: User, db: AsyncSession
) -> list[BookingView]:
    if seeker.role != UserRole.SEEKER:
        raise ForbiddenError("Only seekers see their bookings.", code="not_seeker")
    stmt = (
        select(Booking)
        .where(Booking.seeker_id == seeker.id)
        .order_by(Booking.check_in.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    out: list[BookingView] = []
    for b in rows:
        listing = await db.get(Listing, b.listing_id)
        host = await db.get(User, listing.owner_id) if listing else None
        if listing and host:
            out.append(
                _to_view(booking=b, listing=listing, seeker=seeker, host=host, show_access=True)
            )
    return out


async def list_host_bookings(
    *, host: User, listing_id: uuid.UUID | None, db: AsyncSession
) -> list[BookingView]:
    stmt = (
        select(Booking)
        .join(Listing, Listing.id == Booking.listing_id)
        .where(Listing.owner_id == host.id)
        .order_by(Booking.check_in.desc())
    )
    if listing_id is not None:
        stmt = stmt.where(Booking.listing_id == listing_id)
    rows = (await db.execute(stmt)).scalars().all()
    out: list[BookingView] = []
    for b in rows:
        listing = await db.get(Listing, b.listing_id)
        seeker = await db.get(User, b.seeker_id)
        if listing and seeker:
            out.append(
                _to_view(booking=b, listing=listing, seeker=seeker, host=host, show_access=True)
            )
    return out


# ---------------------------------------------------------------------------
# Calendar (consumed by the short-let dashboard view)
# ---------------------------------------------------------------------------


async def calendar_blocks(
    *, listing_id: uuid.UUID, db: AsyncSession
) -> list[dict]:
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.category != ListingCategory.SHORT_LET:
        return []
    _, _, _, turnaround, _ = _short_let_pricing(listing)
    blocked = await blocked_days_for_listing(
        db=db, listing_id=listing_id, turnaround_days=turnaround
    )
    return [
        {
            "date": b.day.isoformat(),
            "state": b.state,
            "booking_id": str(b.booking_id),
        }
        for b in blocked
    ]
