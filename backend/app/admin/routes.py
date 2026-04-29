"""Admin portal HTTP routes — gated to UserRole.ADMIN."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import review_service, service
from app.admin.schemas import (
    AreaScoreUpdatePayload,
    AreaScoreView,
    AdminListingEditPayload,
    AdminListingFilters,
    AdminListingsResponse,
    DocReviewActionPayload,
    DocReviewQueue,
    DocumentPresignedView,
    SuspendPayload,
)
from app.core.dependencies import require_role
from app.core.redis_client import get_redis
from app.database import get_db
from app.models._enums import UserRole
from app.models.user import User
from app.verification.reports import invalidate_listing_report_cache

router = APIRouter(
    prefix="/internal/admin",
    tags=["admin"],
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)


# ---------------------------------------------------------------------------
# Doc review queue
# ---------------------------------------------------------------------------


@router.get("/doc-review", response_model=DocReviewQueue)
async def doc_review_queue(db: AsyncSession = Depends(get_db)) -> DocReviewQueue:
    return await service.doc_review_queue(db=db)


@router.post("/doc-review/{listing_id}/approve")
async def approve_doc(
    listing_id: uuid.UUID,
    payload: DocReviewActionPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    listing = await service.approve_doc(
        admin=admin, listing_id=listing_id, note=payload.note, db=db
    )
    await db.commit()
    return {"status": listing.status.value}


@router.post("/doc-review/{listing_id}/query")
async def query_doc(
    listing_id: uuid.UUID,
    payload: DocReviewActionPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    listing = await service.query_doc(
        admin=admin, listing_id=listing_id, note=payload.note, db=db
    )
    await db.commit()
    return {"status": listing.status.value}


@router.post("/doc-review/{listing_id}/reject")
async def reject_doc(
    listing_id: uuid.UUID,
    payload: DocReviewActionPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    listing = await service.reject_doc(
        admin=admin, listing_id=listing_id, note=payload.note, db=db
    )
    await db.commit()
    return {"status": listing.status.value}


# ---------------------------------------------------------------------------
# Document viewer (presigned GET, 15-min expiry)
# ---------------------------------------------------------------------------


@router.get(
    "/listings/{listing_id}/documents/{document_id}/url",
    response_model=DocumentPresignedView,
)
async def document_url(
    listing_id: uuid.UUID,
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> DocumentPresignedView:
    url, doc = await service.document_view_url(
        listing_id=listing_id, document_id=document_id, db=db
    )
    return DocumentPresignedView(
        url=url,
        filename=doc.filename,
        doc_type=doc.doc_type,
        content_type=doc.content_type,
    )


# ---------------------------------------------------------------------------
# Listing management
# ---------------------------------------------------------------------------


@router.get("/listings", response_model=AdminListingsResponse)
async def list_listings(
    filters: AdminListingFilters = Depends(),
    db: AsyncSession = Depends(get_db),
) -> AdminListingsResponse:
    return await service.list_listings(filters=filters, db=db)


@router.patch("/listings/{listing_id}")
async def edit_listing(
    listing_id: uuid.UUID,
    payload: AdminListingEditPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> dict[str, str]:
    listing = await service.edit_listing(
        admin=admin, listing_id=listing_id, payload=payload, db=db
    )
    if payload.price is not None:
        await invalidate_listing_report_cache(listing=listing, redis=redis, db=db)
    await db.commit()
    return {"id": str(listing.id), "status": listing.status.value}


@router.get("/listings/{listing_id}/area-score", response_model=AreaScoreView)
async def get_area_score(
    listing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> AreaScoreView:
    return await review_service.get_listing_area_score(listing_id=listing_id, db=db)


@router.post("/listings/{listing_id}/area-score", response_model=AreaScoreView)
async def update_area_score(
    listing_id: uuid.UUID,
    payload: AreaScoreUpdatePayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> AreaScoreView:
    score = await review_service.update_listing_area_score(
        admin=admin,
        listing_id=listing_id,
        payload=payload,
        db=db,
        redis=redis,
    )
    await db.commit()
    return score


@router.post("/listings/{listing_id}/suspend")
async def suspend_listing(
    listing_id: uuid.UUID,
    payload: SuspendPayload,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    listing = await service.suspend_listing(
        admin=admin, listing_id=listing_id, reason=payload.reason, db=db
    )
    await db.commit()
    return {"id": str(listing.id), "status": listing.status.value}


@router.post("/listings/{listing_id}/restore")
async def restore_listing(
    listing_id: uuid.UUID,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    listing = await service.restore_listing(admin=admin, listing_id=listing_id, db=db)
    await db.commit()
    return {"id": str(listing.id), "status": listing.status.value}


@router.delete(
    "/listings/{listing_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def soft_delete_listing(
    listing_id: uuid.UUID,
    admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await service.soft_delete_listing(admin=admin, listing_id=listing_id, db=db)
    await db.commit()
