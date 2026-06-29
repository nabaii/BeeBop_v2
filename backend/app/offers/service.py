"""Offer + counter-offer state machine.

Round model (per dev plan §8.3):
  • Round 1: seeker submits → landlord turn (`awaiting_landlord_response=True`).
  • Each Counter creates a new Offer row, parent_offer_id links to the
    previous round, round_number increments, the turn flips, expires_at
    resets to +48h.
  • At most MAX_OFFER_ROUNDS rounds. Attempting a round 4 raises ConflictError.
  • Acceptance: terminal. Triggers visit-request creation when a visit hasn't
    yet been completed for this listing/seeker pair.
  • Rejection: terminal. Lower urgency notification (in-app only).
  • Expiry: 48 hours of non-response on the latest round flips status to
    EXPIRED via the Celery sweeper.

Listings re-open to other seekers when the latest offer in a thread expires.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.models._enums import (
    ListingCategory,
    ListingStatus,
    OfferStatus,
    UserRole,
    VisitStatus,
)
from app.models.listing import Listing
from app.models.offer import MAX_OFFER_ROUNDS, Offer
from app.models.user import User
from app.models.visit import Visit
from app.notifications.dispatch import dispatch_notification
from app.offers.schemas import (
    CounterPayload,
    OfferRoundView,
    OfferSubmitPayload,
    OfferThreadView,
)

OFFER_RESPONSE_WINDOW = timedelta(hours=48)

# Categories that route through the offer flow at all. Short-let uses Booking
# (Sprint 11); off-campus uses the Visit + 'Book now' Reservation flow and no
# longer negotiates via offers.
_OFFER_CATEGORIES = (
    ListingCategory.RENT,
    ListingCategory.SALES,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _full_name(user: User) -> str:
    parts = [p for p in (user.first_name, user.last_name) if p]
    if parts:
        return " ".join(parts)
    return user.business_name or user.email


def _expiry_from_now() -> datetime:
    return datetime.now(timezone.utc) + OFFER_RESPONSE_WINDOW


async def _load_listing(db: AsyncSession, listing_id: uuid.UUID) -> Listing:
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    return listing


async def _latest_open_offer_for(
    *, db: AsyncSession, listing_id: uuid.UUID, seeker_id: uuid.UUID
) -> Offer | None:
    stmt = (
        select(Offer)
        .where(
            Offer.listing_id == listing_id,
            Offer.seeker_id == seeker_id,
            Offer.status.in_(
                (OfferStatus.PENDING, OfferStatus.COUNTERED),
            ),
        )
        .order_by(Offer.round_number.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _completed_visit_exists(
    *, db: AsyncSession, listing_id: uuid.UUID, seeker_id: uuid.UUID
) -> bool:
    stmt = select(Visit).where(
        Visit.listing_id == listing_id,
        Visit.seeker_id == seeker_id,
        Visit.status == VisitStatus.COMPLETED,
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------


async def submit_offer(
    *,
    seeker: User,
    listing_id: uuid.UUID,
    payload: OfferSubmitPayload,
    db: AsyncSession,
) -> Offer:
    if seeker.role != UserRole.SEEKER:
        raise ForbiddenError("Only seekers may submit offers.", code="not_seeker")

    listing = await _load_listing(db, listing_id)
    if listing.category not in _OFFER_CATEGORIES:
        raise ValidationError(
            "Offers do not apply to this listing category.",
            code="category_no_offers",
        )
    if listing.owner_id == seeker.id:
        raise ForbiddenError(
            "You cannot offer on your own listing.", code="self_offer"
        )
    if listing.status not in (
        ListingStatus.DOC_VERIFIED,
        ListingStatus.FULLY_VERIFIED,
        ListingStatus.LIVE_UNVERIFIED,
    ):
        raise ConflictError(
            "Listing is not currently accepting offers.",
            code="listing_not_accepting_offers",
        )

    existing = await _latest_open_offer_for(
        db=db, listing_id=listing_id, seeker_id=seeker.id
    )
    if existing is not None:
        raise ConflictError(
            "You already have an active offer on this listing.",
            code="duplicate_offer",
        )

    requires_visit = not await _completed_visit_exists(
        db=db, listing_id=listing_id, seeker_id=seeker.id
    )

    offer = Offer(
        listing_id=listing_id,
        seeker_id=seeker.id,
        price=payload.price,
        move_in_date=payload.move_in_date,
        conditions=payload.conditions,
        status=OfferStatus.PENDING,
        round_number=1,
        awaiting_landlord_response=True,
        requires_visit_before_acceptance=requires_visit,
        expires_at=_expiry_from_now(),
        expiry_notifications_sent={},
    )
    db.add(offer)
    await db.flush()

    await dispatch_notification(
        user_id=listing.owner_id,
        event_type="offer.received",
        payload={
            "offer_id": str(offer.id),
            "listing_id": str(listing.id),
            "listing_title": listing.title or "Your listing",
            "offer_amount": float(offer.price),
        },
        db=db,
    )
    return offer


# ---------------------------------------------------------------------------
# Counter / Accept / Reject
# ---------------------------------------------------------------------------


async def counter_offer(
    *,
    actor: User,
    offer_id: uuid.UUID,
    payload: CounterPayload,
    db: AsyncSession,
) -> Offer:
    current = await db.get(Offer, offer_id)
    if current is None:
        raise NotFoundError("Offer not found.", code="offer_not_found")
    if current.status not in (OfferStatus.PENDING,):
        raise ConflictError(
            "Offer is no longer open for response.", code="offer_closed"
        )

    listing = await _load_listing(db, current.listing_id)
    is_landlord_turn = current.awaiting_landlord_response
    is_landlord = actor.id == listing.owner_id
    is_seeker = actor.id == current.seeker_id

    if is_landlord_turn and not is_landlord:
        raise ForbiddenError("It is the landlord's turn.", code="not_your_turn")
    if not is_landlord_turn and not is_seeker:
        raise ForbiddenError("It is the seeker's turn.", code="not_your_turn")

    if current.round_number >= MAX_OFFER_ROUNDS:
        # Counter on round 3 would create round 4 — not allowed.
        raise ConflictError(
            f"Maximum {MAX_OFFER_ROUNDS} counter-offer rounds reached.",
            code="max_rounds_exceeded",
        )

    # Mark the current round as countered (history retained).
    current.status = OfferStatus.COUNTERED
    current.responded_at = datetime.now(timezone.utc)

    next_round = Offer(
        listing_id=current.listing_id,
        seeker_id=current.seeker_id,
        price=payload.price,
        move_in_date=current.move_in_date,
        conditions=payload.conditions or current.conditions,
        status=OfferStatus.PENDING,
        round_number=current.round_number + 1,
        parent_offer_id=current.id,
        awaiting_landlord_response=not is_landlord_turn,   # turn flips
        requires_visit_before_acceptance=current.requires_visit_before_acceptance,
        expires_at=_expiry_from_now(),
        expiry_notifications_sent={},
    )
    db.add(next_round)
    await db.flush()

    # Notify the other side.
    notify_user_id = current.seeker_id if is_landlord else listing.owner_id
    await dispatch_notification(
        user_id=notify_user_id,
        event_type="offer.countered",
        payload={
            "offer_id": str(next_round.id),
            "listing_id": str(listing.id),
            "listing_title": listing.title or "Your listing",
            "offer_amount": float(next_round.price),
            "round": next_round.round_number,
        },
        db=db,
    )
    return next_round


async def accept_offer(
    *, actor: User, offer_id: uuid.UUID, db: AsyncSession
) -> tuple[Offer, Visit | None]:
    current = await db.get(Offer, offer_id)
    if current is None:
        raise NotFoundError("Offer not found.", code="offer_not_found")
    if current.status != OfferStatus.PENDING:
        raise ConflictError("Offer is no longer open.", code="offer_closed")

    listing = await _load_listing(db, current.listing_id)
    is_landlord_turn = current.awaiting_landlord_response
    is_landlord = actor.id == listing.owner_id
    is_seeker = actor.id == current.seeker_id

    if is_landlord_turn and not is_landlord:
        raise ForbiddenError("It is the landlord's turn.", code="not_your_turn")
    if not is_landlord_turn and not is_seeker:
        raise ForbiddenError("It is the seeker's turn.", code="not_your_turn")

    current.status = OfferStatus.ACCEPTED
    current.responded_at = datetime.now(timezone.utc)
    await db.flush()

    visit: Visit | None = None
    if current.requires_visit_before_acceptance:
        # Auto-create a visit request in the admin queue.
        visit = Visit(
            listing_id=current.listing_id,
            seeker_id=current.seeker_id,
            offer_id=current.id,
            status=VisitStatus.PENDING_ASSIGNMENT,
        )
        db.add(visit)
        await db.flush()

    await dispatch_notification(
        user_id=current.seeker_id,
        event_type="offer.accepted",
        payload={
            "offer_id": str(current.id),
            "listing_id": str(listing.id),
            "listing_title": listing.title or "the listing",
            "offer_amount": float(current.price),
            "visit_required": current.requires_visit_before_acceptance,
        },
        db=db,
    )
    await dispatch_notification(
        user_id=listing.owner_id,
        event_type="offer.accepted",
        payload={
            "offer_id": str(current.id),
            "listing_id": str(listing.id),
            "listing_title": listing.title or "Your listing",
            "offer_amount": float(current.price),
            "visit_required": current.requires_visit_before_acceptance,
        },
        db=db,
    )

    # Sprint 10: trigger agreement generation immediately when no visit is
    # required (seeker has a previous completed visit, or category is exempt).
    # Otherwise the visit-report-approved hook in the agent service will call
    # the same generator after admin approval.
    if not current.requires_visit_before_acceptance:
        from app.agreements.service import generate_agreement_for_offer

        await generate_agreement_for_offer(offer=current, db=db)

    return current, visit


async def reject_offer(
    *, actor: User, offer_id: uuid.UUID, db: AsyncSession
) -> Offer:
    current = await db.get(Offer, offer_id)
    if current is None:
        raise NotFoundError("Offer not found.", code="offer_not_found")
    if current.status != OfferStatus.PENDING:
        raise ConflictError("Offer is no longer open.", code="offer_closed")

    listing = await _load_listing(db, current.listing_id)
    is_landlord_turn = current.awaiting_landlord_response
    is_landlord = actor.id == listing.owner_id
    is_seeker = actor.id == current.seeker_id

    if is_landlord_turn and not is_landlord:
        raise ForbiddenError("It is the landlord's turn.", code="not_your_turn")
    if not is_landlord_turn and not is_seeker:
        raise ForbiddenError("It is the seeker's turn.", code="not_your_turn")

    current.status = OfferStatus.REJECTED
    current.responded_at = datetime.now(timezone.utc)
    await db.flush()

    # Lower-urgency notification — in-app only per dev plan §12.2.
    notify_user_id = current.seeker_id if is_landlord else listing.owner_id
    await dispatch_notification(
        user_id=notify_user_id,
        event_type="offer.rejected",
        payload={
            "offer_id": str(current.id),
            "listing_id": str(listing.id),
            "listing_title": listing.title or "the listing",
        },
        db=db,
    )
    return current


# ---------------------------------------------------------------------------
# Threads (read)
# ---------------------------------------------------------------------------


async def _build_thread_view(
    *, current: Offer, db: AsyncSession
) -> OfferThreadView:
    listing = await _load_listing(db, current.listing_id)
    seeker = await db.get(User, current.seeker_id)
    landlord = await db.get(User, listing.owner_id)

    # Walk the parent chain back to the root.
    rounds: list[OfferRoundView] = []
    cursor: Offer | None = current
    while cursor is not None:
        rounds.append(
            OfferRoundView(
                id=str(cursor.id),
                round_number=cursor.round_number,
                price=float(cursor.price),
                conditions=cursor.conditions,
                # Round 1 = seeker. After that the submitter alternates with
                # whoever was responding. The submitter of the new row is
                # "the side that was responding on the previous round".
                submitted_by="seeker" if cursor.round_number % 2 == 1 else "landlord",
                created_at=cursor.created_at,
            )
        )
        cursor = (
            await db.get(Offer, cursor.parent_offer_id)
            if cursor.parent_offer_id is not None
            else None
        )
    rounds.sort(key=lambda r: r.round_number)

    visit_stmt = select(Visit).where(Visit.offer_id == current.id)
    visit = (await db.execute(visit_stmt)).scalar_one_or_none()

    return OfferThreadView(
        listing_id=str(listing.id),
        listing_title=listing.title or "Untitled",
        listing_category=listing.category,
        seeker_id=str(seeker.id) if seeker else "",
        seeker_name=_full_name(seeker) if seeker else "",
        landlord_id=str(landlord.id) if landlord else "",
        landlord_name=_full_name(landlord) if landlord else "",
        current_offer_id=str(current.id),
        status=current.status,
        awaiting_landlord_response=current.awaiting_landlord_response,
        expires_at=current.expires_at,
        move_in_date=current.move_in_date,
        requires_visit_before_acceptance=current.requires_visit_before_acceptance,
        visit_id=str(visit.id) if visit else None,
        rounds=rounds,
    )


async def list_seeker_offers(
    *, seeker: User, db: AsyncSession
) -> list[OfferThreadView]:
    """Latest open round per (listing, seeker)."""
    if seeker.role != UserRole.SEEKER:
        raise ForbiddenError("Only seekers see their offers list.", code="not_seeker")
    stmt = (
        select(Offer)
        .where(Offer.seeker_id == seeker.id)
        .order_by(Offer.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    # Filter to terminal-or-current per (listing). For each listing keep the
    # row with the highest round_number.
    by_listing: dict[uuid.UUID, Offer] = {}
    for r in rows:
        prev = by_listing.get(r.listing_id)
        if prev is None or r.round_number > prev.round_number:
            by_listing[r.listing_id] = r
    return [await _build_thread_view(current=o, db=db) for o in by_listing.values()]


async def list_landlord_offers(
    *, landlord: User, db: AsyncSession
) -> list[OfferThreadView]:
    if landlord.role not in (UserRole.LANDLORD, UserRole.AGENT):
        raise ForbiddenError(
            "Only landlords/agents see incoming offers.", code="not_landlord"
        )
    stmt = (
        select(Offer)
        .join(Listing, Listing.id == Offer.listing_id)
        .where(Listing.owner_id == landlord.id)
        .order_by(Offer.created_at.desc())
        .options(selectinload(Offer.parent))
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    seen: dict[tuple[uuid.UUID, uuid.UUID], Offer] = {}
    for r in rows:
        key = (r.listing_id, r.seeker_id)
        prev = seen.get(key)
        if prev is None or r.round_number > prev.round_number:
            seen[key] = r
    return [await _build_thread_view(current=o, db=db) for o in seen.values()]
