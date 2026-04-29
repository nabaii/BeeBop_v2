"""Visit service.

Sprint 8 surface:
  • admin_visit_queue        — all visits awaiting (or with) an agent
  • assign_agent             — admin selects a trusted agent + 2h confirmation deadline
  • list_available_agents    — agents not currently the inspector for the listing
                                (role-separation enforcement per dev plan §13.5)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models._enums import (
    InspectionReportStatus,
    UserRole,
    VisitStatus,
)
from app.models.inspection import InspectionReport
from app.models.listing import Listing
from app.models.user import User
from app.models.visit import Visit
from app.notifications.dispatch import dispatch_notification
from app.visits.schemas import AvailableAgent, VisitQueueRow

AGENT_CONFIRMATION_WINDOW = timedelta(hours=2)


def _full_name(user: User) -> str:
    parts = [p for p in (user.first_name, user.last_name) if p]
    if parts:
        return " ".join(parts)
    return user.business_name or user.email


async def admin_visit_queue(*, db: AsyncSession) -> list[VisitQueueRow]:
    stmt = (
        select(Visit)
        .where(
            Visit.status.in_(
                (
                    VisitStatus.PENDING_ASSIGNMENT,
                    VisitStatus.AGENT_ASSIGNED,
                    VisitStatus.SCHEDULED,
                )
            )
        )
        .order_by(Visit.created_at.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    out: list[VisitQueueRow] = []
    for v in rows:
        listing = await db.get(Listing, v.listing_id)
        seeker = await db.get(User, v.seeker_id)
        agent = (
            await db.get(User, v.assigned_agent_id)
            if v.assigned_agent_id is not None
            else None
        )
        out.append(
            VisitQueueRow(
                visit_id=str(v.id),
                listing_id=str(v.listing_id),
                listing_title=listing.title if listing else "(deleted listing)",
                listing_category=listing.category if listing else "rent",   # type: ignore[arg-type]
                district=listing.district if listing else None,
                seeker_id=str(v.seeker_id),
                seeker_first_name=seeker.first_name if seeker else None,
                offer_id=str(v.offer_id) if v.offer_id else None,
                status=v.status,
                created_at=v.created_at,
                assigned_at=v.assigned_at,
                agent_confirmation_deadline=v.agent_confirmation_deadline,
                assigned_agent_id=str(v.assigned_agent_id) if v.assigned_agent_id else None,
                assigned_agent_name=_full_name(agent) if agent else None,
            )
        )
    return out


async def list_available_agents(
    *, listing_id: uuid.UUID, db: AsyncSession
) -> list[AvailableAgent]:
    """Trusted agents who can be assigned to this visit.

    Per dev plan §13.5: a person can be both inspector and trusted-agent on
    the platform overall, but the same person cannot be both inspector and
    visit-agent for the same listing. We exclude any agent who has filed an
    inspection report on this specific listing.
    """
    inspector_subq = (
        select(InspectionReport.inspector_id)
        .where(
            InspectionReport.listing_id == listing_id,
            InspectionReport.status.in_(
                (
                    InspectionReportStatus.IN_PROGRESS,
                    InspectionReportStatus.PENDING,
                    InspectionReportStatus.APPROVED,
                    InspectionReportStatus.QUERIED,
                )
            ),
        )
    ).subquery()

    stmt = (
        select(User)
        .where(
            User.role == UserRole.TRUSTED_AGENT,
            User.is_active.is_(True),
            User.is_suspended.is_(False),
            User.id.not_in(select(inspector_subq.c.inspector_id)),
        )
        .order_by(User.first_name.asc(), User.last_name.asc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        AvailableAgent(
            id=str(a.id),
            name=_full_name(a),
            operating_area=a.operating_area,
        )
        for a in rows
    ]


async def assign_agent(
    *,
    admin: User,
    visit_id: uuid.UUID,
    agent_id: uuid.UUID,
    db: AsyncSession,
) -> Visit:
    visit = await db.get(Visit, visit_id)
    if visit is None:
        raise NotFoundError("Visit not found.", code="visit_not_found")
    if visit.status not in (
        VisitStatus.PENDING_ASSIGNMENT,
        VisitStatus.AGENT_ASSIGNED,
    ):
        raise ConflictError(
            "Visit is not assignable in its current state.",
            code="visit_not_assignable",
        )

    agent = await db.get(User, agent_id)
    if agent is None or agent.role != UserRole.TRUSTED_AGENT:
        raise NotFoundError("Trusted agent not found.", code="agent_not_found")

    # Role separation: same person cannot be both inspector + visit-agent.
    inspection_stmt = (
        select(InspectionReport.id)
        .where(
            InspectionReport.listing_id == visit.listing_id,
            InspectionReport.inspector_id == agent_id,
        )
        .limit(1)
    )
    if (await db.execute(inspection_stmt)).scalar_one_or_none() is not None:
        raise ValidationError(
            "Agent has previously inspected this listing — role-separation rule.",
            code="role_separation_violation",
        )

    visit.assigned_agent_id = agent_id
    visit.assigned_by_id = admin.id
    visit.assigned_at = datetime.now(timezone.utc)
    visit.agent_confirmation_deadline = datetime.now(timezone.utc) + AGENT_CONFIRMATION_WINDOW
    visit.status = VisitStatus.AGENT_ASSIGNED
    await db.flush()

    listing = await db.get(Listing, visit.listing_id)
    await dispatch_notification(
        user_id=agent_id,
        event_type="visit.assigned",
        payload={
            "visit_id": str(visit.id),
            "listing_id": str(visit.listing_id),
            "listing_title": listing.title if listing else "a property",
        },
        db=db,
    )
    return visit


async def landlord_visits_for_listing(
    *, landlord: User, listing_id: uuid.UUID, db: AsyncSession
) -> list[VisitQueueRow]:
    """Read-only landlord view per dev plan §7.5."""
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if str(listing.owner_id) != str(landlord.id):
        raise ForbiddenError("Not your listing.", code="listing_not_yours")

    stmt = (
        select(Visit)
        .where(Visit.listing_id == listing_id)
        .order_by(Visit.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    out: list[VisitQueueRow] = []
    for v in rows:
        seeker = await db.get(User, v.seeker_id)
        agent = (
            await db.get(User, v.assigned_agent_id)
            if v.assigned_agent_id is not None
            else None
        )
        out.append(
            VisitQueueRow(
                visit_id=str(v.id),
                listing_id=str(v.listing_id),
                listing_title=listing.title or "Untitled",
                listing_category=listing.category,
                district=listing.district,
                seeker_id=str(v.seeker_id),
                seeker_first_name=seeker.first_name if seeker else None,
                offer_id=str(v.offer_id) if v.offer_id else None,
                status=v.status,
                created_at=v.created_at,
                assigned_at=v.assigned_at,
                agent_confirmation_deadline=v.agent_confirmation_deadline,
                assigned_agent_id=str(v.assigned_agent_id) if v.assigned_agent_id else None,
                assigned_agent_name=_full_name(agent) if agent else None,
            )
        )
    return out
