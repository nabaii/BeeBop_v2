"""Valuation report persistence, regeneration, and Redis caching."""

from __future__ import annotations

import uuid

from datetime import datetime, timezone

from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inspector.area_scoring import CELL_PRECISION, snap_to_cell
from app.integrations.anthropic_client import (
    StubValuationClient,
    get_valuation_client,
)
from app.models._enums import BadgeStatus, BadgeType, InspectionReportStatus, ListingStatus
from app.models.badge import Badge
from app.models.inspection import AreaScore, InspectionReport
from app.models.listing import Listing

VALUATION_REPORT_KEY = "_valuation_report"
VALUATION_REPORT_TEXT_KEY = "_valuation_report_text"
VALUATION_CACHE_PREFIX = "valuation_report:"
CELL_SIZE = 1 / (10**CELL_PRECISION)


class ValuationReportPayload(BaseModel):
    area_scores: dict[str, int | None]
    area_scores_last_updated: str | None = None
    inspector_note: str | None = Field(default=None, max_length=2_000)
    report_date: str


class CachedValuationReport(BaseModel):
    report: ValuationReportPayload
    formatted_text: str


class PublicAreaScorePayload(BaseModel):
    scores: dict[str, int | None]
    last_assessed_at: str | None = None


def _cache_key(listing_id: uuid.UUID) -> str:
    return f"{VALUATION_CACHE_PREFIX}{listing_id}"


def _scores_dict(area_score: AreaScore | None) -> dict[str, int | None]:
    if area_score is None:
        return {
            "road_condition": None,
            "electricity_supply_hours": None,
            "security": None,
            "proximity": None,
        }
    return {
        "road_condition": area_score.road_condition,
        "electricity_supply_hours": area_score.electricity_supply_hours,
        "security": area_score.security,
        "proximity": area_score.proximity,
    }


def public_area_score_payload(area_score: AreaScore | None) -> PublicAreaScorePayload | None:
    if area_score is None:
        return None
    return PublicAreaScorePayload(
        scores=_scores_dict(area_score),
        last_assessed_at=(
            area_score.last_assessed_at.isoformat() if area_score.last_assessed_at else None
        ),
    )


def read_stored_report(listing: Listing) -> CachedValuationReport | None:
    raw_report = (listing.type_data or {}).get(VALUATION_REPORT_KEY)
    raw_text = (listing.type_data or {}).get(VALUATION_REPORT_TEXT_KEY)
    if not isinstance(raw_report, dict) or not isinstance(raw_text, str):
        return None
    report = ValuationReportPayload.model_validate(raw_report)
    return CachedValuationReport(report=report, formatted_text=raw_text)


def clear_stored_report(listing: Listing) -> None:
    payload = dict(listing.type_data or {})
    payload.pop(VALUATION_REPORT_KEY, None)
    payload.pop(VALUATION_REPORT_TEXT_KEY, None)
    listing.type_data = payload


def _store_report(
    listing: Listing, *, report: ValuationReportPayload, formatted_text: str
) -> None:
    payload = dict(listing.type_data or {})
    payload[VALUATION_REPORT_KEY] = report.model_dump()
    payload[VALUATION_REPORT_TEXT_KEY] = formatted_text
    listing.type_data = payload


async def get_area_score_for_listing(
    *, listing: Listing, db: AsyncSession
) -> AreaScore | None:
    if listing.gps_lat is None or listing.gps_lng is None:
        return None
    cell_lat, cell_lng = snap_to_cell(listing.gps_lat, listing.gps_lng)
    stmt = select(AreaScore).where(
        AreaScore.cell_lat == cell_lat,
        AreaScore.cell_lng == cell_lng,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _cache_report(
    *, listing_id: uuid.UUID, cached: CachedValuationReport, redis: Redis
) -> None:
    await redis.set(_cache_key(listing_id), cached.model_dump_json())


async def _read_cached_report(
    *, listing_id: uuid.UUID, redis: Redis
) -> CachedValuationReport | None:
    raw = await redis.get(_cache_key(listing_id))
    if not raw:
        return None
    return CachedValuationReport.model_validate_json(raw)


async def invalidate_listing_report_cache(
    *, listing: Listing, redis: Redis, db: AsyncSession
) -> None:
    clear_stored_report(listing)
    await redis.delete(_cache_key(listing.id))
    await db.flush()


async def generate_and_store_valuation_report(
    *,
    listing: Listing,
    inspector_note: str | None,
    db: AsyncSession,
    redis: Redis,
    area_score: AreaScore | None = None,
) -> ValuationReportPayload:
    resolved_area_score = area_score or await get_area_score_for_listing(listing=listing, db=db)
    report_date = datetime.now(timezone.utc).date().isoformat()
    area_scores_last_updated = (
        resolved_area_score.last_assessed_at.isoformat()
        if resolved_area_score and resolved_area_score.last_assessed_at
        else None
    )
    score_payload = _scores_dict(resolved_area_score)

    client = get_valuation_client()
    try:
        generated = await client.generate(
            area_scores=score_payload,
            inspector_note=inspector_note,
            report_date=report_date,
            area_scores_last_updated=area_scores_last_updated,
        )
    except Exception:
        generated = await StubValuationClient().generate(
            area_scores=score_payload,
            inspector_note=inspector_note,
            report_date=report_date,
            area_scores_last_updated=area_scores_last_updated,
        )

    report = ValuationReportPayload(
        area_scores=score_payload,
        area_scores_last_updated=area_scores_last_updated,
        inspector_note=generated.inspector_note,
        report_date=report_date,
    )
    cached = CachedValuationReport(report=report, formatted_text=generated.formatted_text)
    _store_report(listing, report=report, formatted_text=generated.formatted_text)
    await db.flush()
    await _cache_report(listing_id=listing.id, cached=cached, redis=redis)
    return report


async def _latest_approved_inspection_note(
    *, listing_id: uuid.UUID, db: AsyncSession
) -> str | None:
    stmt = (
        select(InspectionReport)
        .where(
            InspectionReport.listing_id == listing_id,
            InspectionReport.status == InspectionReportStatus.APPROVED,
        )
        .order_by(InspectionReport.reviewed_at.desc(), InspectionReport.submitted_at.desc())
    )
    report = (await db.execute(stmt)).scalars().first()
    return report.inspector_note if report is not None else None


def _listing_can_regenerate_report(listing: Listing) -> bool:
    return listing.status in (
        ListingStatus.FULLY_VERIFIED,
        ListingStatus.LET_AGREED,
        ListingStatus.SALE_AGREED,
    )


async def get_or_generate_valuation_report(
    *,
    listing: Listing,
    db: AsyncSession,
    redis: Redis,
) -> ValuationReportPayload | None:
    cached = await _read_cached_report(listing_id=listing.id, redis=redis)
    if cached is not None:
        return cached.report

    if _listing_can_regenerate_report(listing):
        note = await _latest_approved_inspection_note(listing_id=listing.id, db=db)
        return await generate_and_store_valuation_report(
            listing=listing,
            inspector_note=note,
            db=db,
            redis=redis,
        )

    stored = read_stored_report(listing)
    if stored is not None:
        await _cache_report(listing_id=listing.id, cached=stored, redis=redis)
        return stored.report
    return None


async def regenerate_reports_for_area_score(
    *,
    area_score: AreaScore,
    db: AsyncSession,
    redis: Redis,
) -> list[uuid.UUID]:
    stmt = (
        select(Listing)
        .join(Badge, Badge.listing_id == Listing.id)
        .where(
            Badge.type == BadgeType.PHYSICAL,
            Badge.status == BadgeStatus.ACTIVE,
            Listing.gps_lat.is_not(None),
            Listing.gps_lng.is_not(None),
            Listing.gps_lat >= area_score.cell_lat,
            Listing.gps_lat < area_score.cell_lat + CELL_SIZE,
            Listing.gps_lng >= area_score.cell_lng,
            Listing.gps_lng < area_score.cell_lng + CELL_SIZE,
        )
    )
    rows = (await db.execute(stmt)).scalars().unique().all()
    updated: list[uuid.UUID] = []
    for listing in rows:
        note = await _latest_approved_inspection_note(listing_id=listing.id, db=db)
        await generate_and_store_valuation_report(
            listing=listing,
            inspector_note=note,
            db=db,
            redis=redis,
            area_score=area_score,
        )
        updated.append(listing.id)
    return updated
