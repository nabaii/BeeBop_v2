"""Admin-side inspector management — invite + assign.

Mounted under `/internal/admin/inspections` so the inspector portal routes
(`/inspector/...`) stay strictly inspector-facing.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import review_service
from app.core.dependencies import require_role
from app.core.redis_client import get_redis
from app.database import get_db
from app.inspector import service as inspector_service
from app.admin.schemas import (
    DocReviewActionPayload,
    InspectionReviewDetail,
    InspectionReviewQueue,
)
from app.inspector.schemas import (
    AssignmentCreatePayload,
    InspectorInvitePayload,
    InspectorInviteResponse,
)
from app.models._enums import UserRole
from app.models.user import User

router = APIRouter(
    prefix="/internal/admin/inspections",
    tags=["admin-inspections"],
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)


@router.post("/inspectors", response_model=InspectorInviteResponse)
async def invite_inspector(
    payload: InspectorInvitePayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> InspectorInviteResponse:
    response = await inspector_service.invite_inspector(
        admin=admin, payload=payload, db=db, redis=redis
    )
    await db.commit()
    return response


@router.get("/inspectors")
async def list_inspectors(
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    rows = (
        await db.execute(
            select(User).where(User.role == UserRole.INSPECTOR).order_by(User.created_at.asc())
        )
    ).scalars().all()
    return [
        {
            "id": str(r.id),
            "email": r.email,
            "first_name": r.first_name,
            "last_name": r.last_name,
            "phone": r.phone,
            "activation_complete": inspector_service.is_activation_complete(r),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/assignments")
async def assign_inspection(
    payload: AssignmentCreatePayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict:
    report = await inspector_service.assign_inspection(
        admin=admin,
        listing_id=uuid.UUID(payload.listing_id),
        inspector_id=uuid.UUID(payload.inspector_id),
        db=db,
    )
    await db.commit()
    return {
        "report_id": str(report.id),
        "listing_id": str(report.listing_id),
        "inspector_id": str(report.inspector_id),
        "status": report.status.value,
    }


@router.get("/reports", response_model=InspectionReviewQueue)
async def inspection_review_queue(
    db: AsyncSession = Depends(get_db),
) -> InspectionReviewQueue:
    return await review_service.inspection_review_queue(db=db)


@router.get("/reports/{report_id}", response_model=InspectionReviewDetail)
async def inspection_review_detail(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> InspectionReviewDetail:
    return await review_service.inspection_review_detail(report_id=report_id, db=db)


@router.post("/reports/{report_id}/approve")
async def approve_inspection_report(
    report_id: uuid.UUID,
    payload: DocReviewActionPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    report = await review_service.approve_inspection_report(
        admin=admin,
        report_id=report_id,
        note=payload.note,
        db=db,
        redis=redis,
    )
    await db.commit()
    return {"status": report.status.value}


@router.post("/reports/{report_id}/query")
async def query_inspection_report(
    report_id: uuid.UUID,
    payload: DocReviewActionPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    report = await review_service.query_inspection_report(
        admin=admin,
        report_id=report_id,
        note=payload.note,
        db=db,
    )
    await db.commit()
    return {"status": report.status.value}


@router.post("/reports/{report_id}/reject")
async def reject_inspection_report(
    report_id: uuid.UUID,
    payload: DocReviewActionPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    report = await review_service.reject_inspection_report(
        admin=admin,
        report_id=report_id,
        note=payload.note,
        db=db,
    )
    await db.commit()
    return {"status": report.status.value}
