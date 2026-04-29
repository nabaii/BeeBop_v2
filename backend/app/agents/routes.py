"""Trusted-agent + admin visit-report routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import service
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
from app.core.dependencies import get_current_user, require_role
from app.core.redis_client import get_redis
from app.database import get_db
from app.inspector.service import is_activation_complete
from app.models._enums import UserRole
from app.models.user import User

# ---------------------------------------------------------------------------
# Agent portal — gated to TRUSTED_AGENT
# ---------------------------------------------------------------------------

agent_router = APIRouter(
    prefix="/agent",
    tags=["agent"],
    dependencies=[Depends(require_role(UserRole.TRUSTED_AGENT))],
)


@agent_router.get("/activation/status")
async def activation_status(
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    """Reuses the inspector activation gate — same NIN/photo/conduct
    requirements per dev plan §13."""
    return {
        "complete": is_activation_complete(user),
        "has_profile_photo": user.profile_photo_url is not None,
        "nin_verified": user.nin_verified,
        "conduct_acknowledged": user.conduct_acknowledged_at is not None,
    }


@agent_router.get("/visits", response_model=list[AgentVisitRow])
async def my_visits(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AgentVisitRow]:
    return await service.list_my_visits(agent=user, db=db)


@agent_router.get(
    "/visits/{visit_id}/briefing", response_model=AgentBriefingPack
)
async def briefing(
    visit_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgentBriefingPack:
    return await service.briefing_pack(agent=user, visit_id=visit_id, db=db)


@agent_router.post("/visits/{visit_id}/confirm")
async def confirm(
    visit_id: uuid.UUID,
    payload: ConfirmAssignmentPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    visit = await service.confirm_assignment(
        agent=user, visit_id=visit_id, payload=payload, db=db
    )
    await db.commit()
    return {"visit_id": str(visit.id), "status": visit.status.value}


@agent_router.post("/visits/{visit_id}/report")
async def submit_report(
    visit_id: uuid.UUID,
    payload: PostVisitReportPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    visit = await service.submit_post_visit_report(
        agent=user, visit_id=visit_id, payload=payload, db=db
    )
    await db.commit()
    return {"visit_id": str(visit.id), "status": visit.status.value}


@agent_router.post("/visits/{visit_id}/cancel")
async def cancel(
    visit_id: uuid.UUID,
    payload: CancelVisitPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    visit = await service.cancel_visit(
        actor=user, visit_id=visit_id, payload=payload, db=db
    )
    await db.commit()
    return {"visit_id": str(visit.id), "status": visit.status.value}


# ---------------------------------------------------------------------------
# Cross-role visit cancellation (seeker / landlord) lives on `/visits/...`
# ---------------------------------------------------------------------------

cancel_router = APIRouter(prefix="/visits", tags=["visits"])


@cancel_router.post("/{visit_id}/cancel")
async def cancel_visit(
    visit_id: uuid.UUID,
    payload: CancelVisitPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    visit = await service.cancel_visit(
        actor=user, visit_id=visit_id, payload=payload, db=db
    )
    await db.commit()
    return {"visit_id": str(visit.id), "status": visit.status.value}


# ---------------------------------------------------------------------------
# Admin: agent invite + visit-report review
# ---------------------------------------------------------------------------

admin_router = APIRouter(
    prefix="/internal/admin",
    tags=["admin-agents"],
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)


@admin_router.post("/agents", response_model=AgentInviteResponse)
async def invite_agent(
    payload: AgentInvitePayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> AgentInviteResponse:
    response = await service.invite_agent(
        admin=admin, payload=payload, db=db, redis=redis
    )
    await db.commit()
    return response


@admin_router.get("/agents")
async def list_agents(
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    rows = (
        await db.execute(
            select(User).where(User.role == UserRole.TRUSTED_AGENT).order_by(User.created_at.asc())
        )
    ).scalars().all()
    return [
        {
            "id": str(r.id),
            "email": r.email,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "phone": r.phone,
            "operating_area": r.operating_area,
            "activation_complete": is_activation_complete(r),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@admin_router.get(
    "/visit-reports", response_model=list[VisitReportReviewQueueRow]
)
async def visit_report_queue(
    db: AsyncSession = Depends(get_db),
) -> list[VisitReportReviewQueueRow]:
    return await service.admin_visit_report_queue(db=db)


@admin_router.get(
    "/visit-reports/{visit_id}", response_model=VisitReportReviewDetail
)
async def visit_report_detail(
    visit_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> VisitReportReviewDetail:
    return await service.admin_visit_report_detail(visit_id=visit_id, db=db)


@admin_router.post("/visit-reports/{visit_id}/approve")
async def approve_visit_report(
    visit_id: uuid.UUID,
    payload: dict | None = None,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    note = (payload or {}).get("note") if payload else None
    visit = await service.admin_approve_visit_report(
        admin=admin, visit_id=visit_id, note=note, db=db
    )
    await db.commit()
    return {"status": visit.status.value}


@admin_router.post("/visit-reports/{visit_id}/query")
async def query_visit_report(
    visit_id: uuid.UUID,
    payload: dict,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    visit = await service.admin_query_visit_report(
        admin=admin, visit_id=visit_id, note=payload.get("note"), db=db
    )
    await db.commit()
    return {"status": visit.status.value}


@admin_router.post("/visit-reports/{visit_id}/flag")
async def flag_visit_report(
    visit_id: uuid.UUID,
    payload: dict,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    visit = await service.admin_flag_visit_report(
        admin=admin, visit_id=visit_id, note=payload.get("note"), db=db
    )
    await db.commit()
    return {"status": visit.status.value}
