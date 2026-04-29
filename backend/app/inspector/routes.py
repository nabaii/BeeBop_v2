"""Inspector portal routes.

Inspector-facing routes are gated by `require_role(INSPECTOR)`. Admin
assignment routes live in `app/admin/inspector_routes.py` and are mounted
under `/internal/admin/inspections`.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.core.redis_client import get_redis
from app.database import get_db
from app.inspector import service
from app.inspector.schemas import (
    AssignmentRow,
    BriefingPack,
    EvidenceRegisterPayload,
    EvidenceUploadSignaturePayload,
    EvidenceUploadSignatureResponse,
    InfrastructureScorePayload,
    ReportDraftPayload,
    ReportView,
)
from app.models._enums import UserRole
from app.models.user import User

router = APIRouter(prefix="/inspector", tags=["inspector"])


# ---------------------------------------------------------------------------
# Activation
# ---------------------------------------------------------------------------


@router.post("/activation/conduct", status_code=status.HTTP_204_NO_CONTENT)
async def acknowledge_conduct(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.acknowledge_conduct(user=user, db=db)
    await db.commit()


@router.get("/activation/status")
async def activation_status(
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    return {
        "complete": service.is_activation_complete(user),
        "has_profile_photo": user.profile_photo_url is not None,
        "nin_verified": user.nin_verified,
        "conduct_acknowledged": user.conduct_acknowledged_at is not None,
    }


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------


@router.get(
    "/assignments",
    response_model=list[AssignmentRow],
    dependencies=[Depends(require_role(UserRole.INSPECTOR))],
)
async def my_assignments(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AssignmentRow]:
    return await service.list_assignments(inspector=user, db=db)


@router.get(
    "/reports/{report_id}/briefing",
    response_model=BriefingPack,
    dependencies=[Depends(require_role(UserRole.INSPECTOR))],
)
async def briefing(
    report_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BriefingPack:
    return await service.briefing_pack(inspector=user, report_id=report_id, db=db)


# ---------------------------------------------------------------------------
# Report draft + submit
# ---------------------------------------------------------------------------


@router.get(
    "/reports/{report_id}",
    response_model=ReportView,
    dependencies=[Depends(require_role(UserRole.INSPECTOR))],
)
async def get_report(
    report_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportView:
    return await service.get_report(inspector=user, report_id=report_id, db=db)


@router.patch(
    "/reports/{report_id}",
    response_model=ReportView,
    dependencies=[Depends(require_role(UserRole.INSPECTOR))],
)
async def save_draft(
    report_id: uuid.UUID,
    payload: ReportDraftPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportView:
    view = await service.save_draft(
        inspector=user, report_id=report_id, payload=payload, db=db
    )
    await db.commit()
    return view


@router.post(
    "/reports/{report_id}/submit",
    response_model=ReportView,
    dependencies=[Depends(require_role(UserRole.INSPECTOR))],
)
async def submit_report(
    report_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportView:
    view = await service.submit_report(inspector=user, report_id=report_id, db=db)
    await db.commit()
    return view


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------


@router.post(
    "/reports/{report_id}/evidence/signature",
    response_model=EvidenceUploadSignatureResponse,
    dependencies=[Depends(require_role(UserRole.INSPECTOR))],
)
async def evidence_signature(
    report_id: uuid.UUID,
    payload: EvidenceUploadSignaturePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EvidenceUploadSignatureResponse:
    return await service.evidence_upload_signature(
        inspector=user, report_id=report_id, payload=payload, db=db
    )


@router.post(
    "/reports/{report_id}/evidence",
    response_model=ReportView,
    dependencies=[Depends(require_role(UserRole.INSPECTOR))],
)
async def register_evidence(
    report_id: uuid.UUID,
    payload: EvidenceRegisterPayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportView:
    view = await service.register_evidence(
        inspector=user, report_id=report_id, payload=payload, db=db
    )
    await db.commit()
    return view


# ---------------------------------------------------------------------------
# Infrastructure score
# ---------------------------------------------------------------------------


@router.post(
    "/reports/{report_id}/infrastructure-score",
    dependencies=[Depends(require_role(UserRole.INSPECTOR))],
)
async def infrastructure_score(
    report_id: uuid.UUID,
    payload: InfrastructureScorePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> dict:
    result = await service.submit_infrastructure_score(
        inspector=user, report_id=report_id, payload=payload, db=db, redis=redis
    )
    await db.commit()
    return result
