"""Trusted-agent service — covers the agent portal AND the admin-side review
of agent post-visit reports."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.schemas import (
    AgentBriefingPack,
    AgentInvitePayload,
    AgentInviteResponse,
    AgentVisitRow,
    CancelVisitPayload,
    ConfirmAssignmentPayload,
    PostVisitReportPayload,
    VisitReportReviewDetail,
    VisitReportReviewQueueRow,
)
from app.auth.otp_service import OtpService
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.inspector.service import is_activation_complete
from app.models._enums import (
    InspectionReportStatus,
    ListingStatus,
    UserRole,
    VisitCancelledBy,
    VisitStatus,
)
from app.models.inspection import InspectionReport
from app.models.listing import Listing
from app.models.user import User
from app.models.visit import Visit
from app.notifications.dispatch import dispatch_notification


CONDUCT_REMINDERS = [
    "Arrive 5–10 minutes before the seeker.",
    "If the landlord insists on attending, you manage the conversation.",
    "Walk through every room shown in the listing photos.",
    "Note discrepancies silently — do NOT raise them with the seeker on-site.",
    "Never share landlord, agent, or seeker contact details with any party.",
    "Politely refuse any informal contact-exchange attempts.",
]


def _full_name(user: User) -> str:
    parts = [p for p in (user.first_name, user.last_name) if p]
    if parts:
        return " ".join(parts)
    return user.business_name or user.email


# ---------------------------------------------------------------------------
# Admin: invite a trusted agent
# ---------------------------------------------------------------------------


async def invite_agent(
    *,
    admin: User,
    payload: AgentInvitePayload,
    db: AsyncSession,
    redis,
) -> AgentInviteResponse:
    existing = (
        await db.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("A user with that email already exists.", code="user_exists")

    agent = User(
        email=payload.email.lower(),
        phone=payload.phone,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        role=UserRole.TRUSTED_AGENT,
        is_active=True,
        is_suspended=False,
    )
    db.add(agent)
    await db.flush()

    otp = OtpService(redis)
    delivered = False
    try:
        if agent.phone:
            await otp.request(channel="whatsapp", identifier=agent.phone)
        else:
            await otp.request(channel="email", identifier=agent.email)
        delivered = True
    except Exception:
        delivered = False

    return AgentInviteResponse(
        user_id=str(agent.id),
        email=agent.email,
        invitation_sent=delivered,
    )


# ---------------------------------------------------------------------------
# Agent portal — visits
# ---------------------------------------------------------------------------


async def list_my_visits(
    *, agent: User, db: AsyncSession
) -> list[AgentVisitRow]:
    if agent.role != UserRole.TRUSTED_AGENT:
        raise ForbiddenError("Only trusted agents see assignments.", code="not_agent")
    stmt = (
        select(Visit, Listing)
        .join(Listing, Listing.id == Visit.listing_id)
        .where(
            Visit.assigned_agent_id == agent.id,
            Visit.status.in_(
                (
                    VisitStatus.AGENT_ASSIGNED,
                    VisitStatus.SCHEDULED,
                    VisitStatus.REPORT_QUERIED,
                    VisitStatus.REPORT_PENDING,
                )
            ),
        )
        .order_by(Visit.scheduled_at.asc().nulls_first(), Visit.assigned_at.asc())
    )
    rows = (await db.execute(stmt)).all()
    out: list[AgentVisitRow] = []
    for v, l in rows:
        seeker = await db.get(User, v.seeker_id)
        out.append(
            AgentVisitRow(
                visit_id=str(v.id),
                listing_id=str(l.id),
                listing_title=l.title or "Untitled",
                listing_category=l.category,
                address_district=l.district,
                listing_gps_lat=l.gps_lat,
                listing_gps_lng=l.gps_lng,
                seeker_first_name=seeker.first_name if seeker else None,
                status=v.status,
                assigned_at=v.assigned_at,
                agent_confirmation_deadline=v.agent_confirmation_deadline,
                scheduled_at=v.scheduled_at,
                visit_report_submitted_at=v.visit_report_submitted_at,
            )
        )
    return out


async def _load_for_agent(
    *, agent: User, visit_id: uuid.UUID, db: AsyncSession
) -> tuple[Visit, Listing]:
    visit = await db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Visit not found.", code="visit_not_found")
    if str(visit.assigned_agent_id) != str(agent.id):
        raise ForbiddenError("Not your visit assignment.", code="not_your_visit")
    stmt = (
        select(Listing)
        .where(Listing.id == visit.listing_id)
        .options(selectinload(Listing.photos))
    )
    listing = (await db.execute(stmt)).scalar_one()
    return visit, listing


async def briefing_pack(
    *, agent: User, visit_id: uuid.UUID, db: AsyncSession
) -> AgentBriefingPack:
    visit, listing = await _load_for_agent(agent=agent, visit_id=visit_id, db=db)
    seeker = await db.get(User, visit.seeker_id)
    return AgentBriefingPack(
        visit_id=str(visit.id),
        listing_id=str(listing.id),
        listing_title=listing.title or "Untitled",
        listing_category=listing.category,
        address_line=listing.address_line,
        district=listing.district,
        listing_gps_lat=listing.gps_lat,
        listing_gps_lng=listing.gps_lng,
        listing_photos=[
            {
                "id": str(p.id),
                "url": p.url,
                "room_label": p.room_label,
            }
            for p in listing.photos
            if not p.is_inspector_walkthrough
        ],
        listed_amenities=listing.amenities or {},
        seeker_first_name=seeker.first_name if seeker else None,
        verification_status=listing.status.value,
        conduct_reminders=list(CONDUCT_REMINDERS),
    )


async def confirm_assignment(
    *,
    agent: User,
    visit_id: uuid.UUID,
    payload: ConfirmAssignmentPayload,
    db: AsyncSession,
) -> Visit:
    visit, listing = await _load_for_agent(agent=agent, visit_id=visit_id, db=db)
    if visit.status != VisitStatus.AGENT_ASSIGNED:
        raise ConflictError(
            "Visit is not awaiting agent confirmation.",
            code="visit_not_awaiting_confirmation",
        )

    if not payload.confirmed:
        if not payload.conflict_reason:
            raise ValidationError(
                "A reason is required when flagging a conflict.",
                code="conflict_reason_required",
            )
        # Flag back to the admin queue.
        visit.status = VisitStatus.PENDING_ASSIGNMENT
        visit.assigned_agent_id = None
        visit.assigned_at = None
        visit.assigned_by_id = None
        visit.agent_confirmation_deadline = None
        visit.cancellation_reason = payload.conflict_reason
        await db.flush()
        await dispatch_notification(
            user_id=visit.seeker_id,
            event_type="visit.cancelled",
            payload={
                "listing_id": str(listing.id),
                "listing_title": listing.title or "the property",
                "reason": "agent_conflict",
            },
            db=db,
        )
        return visit

    if payload.scheduled_at is None:
        raise ValidationError(
            "Provide a scheduled_at timestamp when confirming.",
            code="scheduled_at_required",
        )
    if payload.scheduled_at < datetime.now(timezone.utc):
        raise ValidationError(
            "Scheduled date must be in the future.", code="scheduled_at_in_past"
        )
    visit.agent_confirmed_at = datetime.now(timezone.utc)
    visit.scheduled_at = payload.scheduled_at
    visit.status = VisitStatus.SCHEDULED
    await db.flush()

    await dispatch_notification(
        user_id=visit.seeker_id,
        event_type="visit.confirmed",
        payload={
            "listing_id": str(listing.id),
            "listing_title": listing.title or "the property",
            "scheduled_at": payload.scheduled_at.isoformat(),
            "agent_first_name": agent.first_name or "your Beebop agent",
        },
        db=db,
    )
    return visit


async def submit_post_visit_report(
    *,
    agent: User,
    visit_id: uuid.UUID,
    payload: PostVisitReportPayload,
    db: AsyncSession,
) -> Visit:
    visit, listing = await _load_for_agent(agent=agent, visit_id=visit_id, db=db)
    if visit.status not in (VisitStatus.SCHEDULED, VisitStatus.REPORT_QUERIED):
        raise ConflictError(
            "Visit is not awaiting a post-visit report.",
            code="visit_not_awaiting_report",
        )
    visit.visit_report = payload.model_dump()
    visit.visit_report_submitted_at = datetime.now(timezone.utc)
    visit.status = VisitStatus.REPORT_PENDING
    await db.flush()
    return visit


async def cancel_visit(
    *,
    actor: User,
    visit_id: uuid.UUID,
    payload: CancelVisitPayload,
    db: AsyncSession,
) -> Visit:
    visit = await db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Visit not found.", code="visit_not_found")
    listing = await db.get(Listing, visit.listing_id)

    # Identify who's cancelling.
    if str(actor.id) == str(visit.seeker_id):
        cancelled_by = VisitCancelledBy.SEEKER
    elif listing is not None and str(actor.id) == str(listing.owner_id):
        cancelled_by = VisitCancelledBy.LANDLORD
    elif visit.assigned_agent_id and str(actor.id) == str(visit.assigned_agent_id):
        cancelled_by = VisitCancelledBy.AGENT
    elif actor.role == UserRole.ADMIN:
        cancelled_by = VisitCancelledBy.ADMIN
    else:
        raise ForbiddenError(
            "Only seeker, landlord, agent, or admin can cancel.",
            code="cancel_not_permitted",
        )

    if visit.status in (VisitStatus.COMPLETED, VisitStatus.CANCELLED):
        raise ConflictError(
            "Visit can no longer be cancelled.", code="visit_terminal"
        )

    visit.status = VisitStatus.CANCELLED
    visit.cancelled_at = datetime.now(timezone.utc)
    visit.cancellation_reason = payload.reason
    visit.cancelled_by = cancelled_by
    visit.cancelled_by_user_id = actor.id
    await db.flush()

    notify_targets: set[uuid.UUID] = {visit.seeker_id}
    if listing is not None:
        notify_targets.add(listing.owner_id)
    if visit.assigned_agent_id is not None:
        notify_targets.add(visit.assigned_agent_id)
    notify_targets.discard(actor.id)
    for uid in notify_targets:
        await dispatch_notification(
            user_id=uid,
            event_type="visit.cancelled",
            payload={
                "listing_id": str(visit.listing_id),
                "listing_title": listing.title if listing else "the property",
                "reason": payload.reason,
                "cancelled_by": cancelled_by.value,
            },
            db=db,
        )

    return visit


# ---------------------------------------------------------------------------
# Admin: visit-report review
# ---------------------------------------------------------------------------


async def admin_visit_report_queue(
    *, db: AsyncSession
) -> list[VisitReportReviewQueueRow]:
    stmt = (
        select(Visit, Listing)
        .join(Listing, Listing.id == Visit.listing_id)
        .where(Visit.status == VisitStatus.REPORT_PENDING)
        .order_by(Visit.visit_report_submitted_at.asc())
    )
    rows = (await db.execute(stmt)).all()
    out: list[VisitReportReviewQueueRow] = []
    for v, l in rows:
        seeker = await db.get(User, v.seeker_id)
        agent = (
            await db.get(User, v.assigned_agent_id)
            if v.assigned_agent_id is not None
            else None
        )
        out.append(
            VisitReportReviewQueueRow(
                visit_id=str(v.id),
                listing_id=str(l.id),
                listing_title=l.title or "Untitled",
                listing_category=l.category,
                seeker_first_name=seeker.first_name if seeker else None,
                agent_id=str(v.assigned_agent_id) if v.assigned_agent_id else "",
                agent_name=_full_name(agent) if agent else "(unassigned)",
                submitted_at=v.visit_report_submitted_at,
                status=v.status,
            )
        )
    return out


async def admin_visit_report_detail(
    *, visit_id: uuid.UUID, db: AsyncSession
) -> VisitReportReviewDetail:
    visit = await db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Visit not found.", code="visit_not_found")
    listing = await db.get(Listing, visit.listing_id)
    seeker = await db.get(User, visit.seeker_id)
    agent = (
        await db.get(User, visit.assigned_agent_id)
        if visit.assigned_agent_id is not None
        else None
    )
    return VisitReportReviewDetail(
        visit_id=str(visit.id),
        listing_id=str(visit.listing_id),
        listing_title=listing.title if listing else "(deleted)",
        listing_category=listing.category if listing else "rent",   # type: ignore[arg-type]
        status=visit.status,
        seeker_first_name=seeker.first_name if seeker else None,
        agent_name=_full_name(agent) if agent else "(unassigned)",
        submitted_at=visit.visit_report_submitted_at,
        visit_report=visit.visit_report,
        cancelled_by=visit.cancelled_by,
        cancellation_reason=visit.cancellation_reason,
        review_note=visit.visit_report_review_note,
    )


async def admin_approve_visit_report(
    *, admin: User, visit_id: uuid.UUID, note: str | None, db: AsyncSession
) -> Visit:
    visit = await db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Visit not found.", code="visit_not_found")
    if visit.status != VisitStatus.REPORT_PENDING:
        raise ConflictError(
            "Visit report is not awaiting review.", code="report_not_pending"
        )
    visit.status = VisitStatus.COMPLETED
    visit.visit_report_reviewed_at = datetime.now(timezone.utc)
    visit.visit_report_reviewed_by_id = admin.id
    visit.visit_report_review_note = note
    await db.flush()

    listing = await db.get(Listing, visit.listing_id)
    await dispatch_notification(
        user_id=visit.seeker_id,
        event_type="visit_report.approved",
        payload={
            "listing_id": str(visit.listing_id),
            "listing_title": listing.title if listing else "the property",
        },
        db=db,
    )

    # Sprint 10: visit-report approval is the gate that unlocks agreement
    # generation for the originating accepted offer.
    if visit.offer_id is not None:
        from app.agreements.service import generate_agreement_for_offer
        from app.models.offer import Offer

        offer = await db.get(Offer, visit.offer_id)
        if offer is not None:
            await generate_agreement_for_offer(offer=offer, db=db)
    return visit


async def admin_query_visit_report(
    *, admin: User, visit_id: uuid.UUID, note: str | None, db: AsyncSession
) -> Visit:
    if not note:
        raise ValidationError(
            "A note is required when querying the report.",
            code="report_query_note_required",
        )
    visit = await db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Visit not found.", code="visit_not_found")
    if visit.status != VisitStatus.REPORT_PENDING:
        raise ConflictError(
            "Visit report is not awaiting review.", code="report_not_pending"
        )
    visit.status = VisitStatus.REPORT_QUERIED
    visit.visit_report_reviewed_at = datetime.now(timezone.utc)
    visit.visit_report_reviewed_by_id = admin.id
    visit.visit_report_review_note = note
    await db.flush()

    if visit.assigned_agent_id is not None:
        await dispatch_notification(
            user_id=visit.assigned_agent_id,
            event_type="visit_report.queried",
            payload={
                "visit_id": str(visit.id),
                "note": note,
            },
            db=db,
        )
    return visit


async def admin_flag_visit_report(
    *, admin: User, visit_id: uuid.UUID, note: str | None, db: AsyncSession
) -> Visit:
    """Flag creates a listing review action — sets the listing back to admin
    review (LIVE_UNVERIFIED) so the doc/badge state can be reassessed."""
    if not note:
        raise ValidationError(
            "A note is required when flagging the report.",
            code="report_flag_note_required",
        )
    visit = await db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Visit not found.", code="visit_not_found")
    if visit.status != VisitStatus.REPORT_PENDING:
        raise ConflictError(
            "Visit report is not awaiting review.", code="report_not_pending"
        )
    visit.status = VisitStatus.COMPLETED
    visit.visit_report_reviewed_at = datetime.now(timezone.utc)
    visit.visit_report_reviewed_by_id = admin.id
    visit.visit_report_review_note = note
    listing = await db.get(Listing, visit.listing_id)
    if listing is not None and listing.status not in (
        ListingStatus.SUSPENDED,
        ListingStatus.DELISTED,
    ):
        listing.status = ListingStatus.LIVE_UNVERIFIED
    await db.flush()
    return visit
