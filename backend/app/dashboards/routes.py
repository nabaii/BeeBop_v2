"""Dashboard endpoints — read-only aggregations for the four roles."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.dashboards import service
from app.dashboards.schemas import (
    LandlordOverview,
    ListingAnalytics,
    SeekerOverview,
    ShortLetDashboard,
    StudentPMS,
)
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/seeker/overview", response_model=SeekerOverview)
async def seeker_overview(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> SeekerOverview:
    return await service.seeker_overview(user=user, db=db)


@router.get("/landlord/overview", response_model=LandlordOverview)
async def landlord_overview(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> LandlordOverview:
    return await service.landlord_overview(user=user, db=db)


@router.get("/landlord/analytics", response_model=list[ListingAnalytics])
async def landlord_analytics(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[ListingAnalytics]:
    return await service.landlord_analytics(user=user, db=db)


@router.get("/student/{listing_id}", response_model=StudentPMS)
async def student_pms(
    listing_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StudentPMS:
    return await service.student_pms(user=user, listing_id=listing_id, db=db)


@router.get("/short-let/{listing_id}", response_model=ShortLetDashboard)
async def short_let_dashboard(
    listing_id: uuid.UUID,
    days: int = Query(default=14, ge=7, le=90),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ShortLetDashboard:
    return await service.short_let_dashboard(
        user=user, listing_id=listing_id, days=days, db=db
    )
