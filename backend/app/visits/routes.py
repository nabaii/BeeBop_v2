"""Visit-queue endpoints — admin-only assignment + landlord read-only view."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models._enums import UserRole
from app.models.user import User
from app.visits import service
from app.visits.schemas import (
    AssignAgentPayload,
    AvailableAgent,
    VisitQueueRow,
)

# Admin queue + assignment.
admin_router = APIRouter(
    prefix="/internal/admin/visits",
    tags=["admin-visits"],
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)


@admin_router.get("", response_model=list[VisitQueueRow])
async def queue(db: AsyncSession = Depends(get_db)) -> list[VisitQueueRow]:
    return await service.admin_visit_queue(db=db)


@admin_router.get(
    "/{visit_id}/available-agents", response_model=list[AvailableAgent]
)
async def available_agents(
    visit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[AvailableAgent]:
    from app.models.visit import Visit

    visit = await db.get(Visit, visit_id)
    if visit is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Visit not found.", code="visit_not_found")
    return await service.list_available_agents(listing_id=visit.listing_id, db=db)


@admin_router.post("/{visit_id}/assign", response_model=VisitQueueRow)
async def assign(
    visit_id: uuid.UUID,
    payload: AssignAgentPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> VisitQueueRow:
    visit = await service.assign_agent(
        admin=admin,
        visit_id=visit_id,
        agent_id=uuid.UUID(payload.agent_id),
        db=db,
    )
    await db.commit()
    queue = await service.admin_visit_queue(db=db)
    match = next((r for r in queue if r.visit_id == str(visit.id)), None)
    if match is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Visit row vanished after assignment.", code="visit_not_found")
    return match


# Landlord-side read-only view per dev plan §7.5.
landlord_router = APIRouter(prefix="/visits", tags=["visits"])


@landlord_router.get(
    "/listing/{listing_id}", response_model=list[VisitQueueRow]
)
async def landlord_listing_visits(
    listing_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VisitQueueRow]:
    return await service.landlord_visits_for_listing(
        landlord=user, listing_id=listing_id, db=db
    )
