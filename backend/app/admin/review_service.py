"""Admin-side inspection report review and area-score publishing."""

from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, ValidationError as PydanticValidationError
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.admin import audit
from app.admin.schemas import (
    AreaScoreUpdatePayload,
    AreaScoreView,
    InspectionEvidenceView,
    InspectionReviewDetail,
    InspectionReviewQueue,
    InspectionReviewQueueRow,
)
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.inspector.area_scoring import AreaScorePayload, snap_to_cell, upsert_area_score
from app.integrations.s3_storage import DEFAULT_GET_EXPIRY, get_storage
from app.models._enums import BadgeType, InspectionReportStatus, ListingCategory, ListingStatus
from app.models.inspection import InspectionReport
from app.models.listing import Listing
from app.models.user import User
from app.notifications.dispatch import dispatch_notification
from app.verification.badges import issue_physical_badge, listing_has_active_badge
from app.verification.reports import (
    generate_and_store_valuation_report,
    get_area_score_for_listing,
    regenerate_reports_for_area_score,
)


class ChecklistAssessment(BaseModel):
    existence: Literal["yes", "no", "could_not_verify"]
    existenceNote: str = ""
    accuracy: Literal["accurate", "minor_discrepancies", "major_discrepancies"]
    accuracyNote: str = ""
    amenities: dict[
        str,
        dict[str, Literal["present", "not_confirmed", "absent"]],
    ] = Field(default_factory=dict)
    structuralCondition: int = Field(..., ge=1, le=5)
    structuralNote: str = ""


class InspectionAssessment(BaseModel):
    checklist: ChecklistAssessment


def _full_name(user: User) -> str:
    parts = [p for p in (user.first_name, user.last_name) if p]
    if parts:
        return " ".join(parts)
    return user.business_name or user.email


def _area_score_view(listing: Listing, score: object | None) -> AreaScoreView:
    if score is None:
        if listing.gps_lat is None or listing.gps_lng is None:
            return AreaScoreView()
        cell_lat, cell_lng = snap_to_cell(listing.gps_lat, listing.gps_lng)
        return AreaScoreView(cell_lat=cell_lat, cell_lng=cell_lng)
    return AreaScoreView(
        cell_lat=getattr(score, "cell_lat"),
        cell_lng=getattr(score, "cell_lng"),
        road_condition=getattr(score, "road_condition"),
        electricity_supply_hours=getattr(score, "electricity_supply_hours"),
        security=getattr(score, "security"),
        proximity=getattr(score, "proximity"),
        last_assessed_at=getattr(score, "last_assessed_at"),
    )


def _validated_assessment(report: InspectionReport) -> InspectionAssessment:
    try:
        return InspectionAssessment.model_validate(report.assessment or {})
    except PydanticValidationError as exc:
        raise ValidationError(
            "Inspection assessment is incomplete or malformed.",
            code="inspection_assessment_invalid",
        ) from exc


def _apply_confirmed_amenities(
    *, listing: Listing, assessment: InspectionAssessment
) -> None:
    updated = deepcopy(listing.amenities or {})
    assessed = assessment.checklist.amenities
    for group, items in list(updated.items()):
        if not isinstance(items, dict):
            continue
        group_assessment = assessed.get(group, {})
        next_items: dict[str, dict] = {}
        for key, meta in items.items():
            current = dict(meta or {})
            if group_assessment.get(key) == "present":
                current["present"] = True
                current["confirmed"] = True
            else:
                current.pop("confirmed", None)
            next_items[key] = current
        updated[group] = next_items
    listing.amenities = updated


async def _load_review_bundle(
    *, report_id: uuid.UUID, db: AsyncSession
) -> tuple[InspectionReport, Listing, User, User]:
    inspector_alias = aliased(User)
    owner_alias = aliased(User)
    stmt = (
        select(InspectionReport, Listing, inspector_alias, owner_alias)
        .join(Listing, Listing.id == InspectionReport.listing_id)
        .join(inspector_alias, inspector_alias.id == InspectionReport.inspector_id)
        .join(owner_alias, owner_alias.id == Listing.owner_id)
        .where(InspectionReport.id == report_id)
    )
    row = (await db.execute(stmt)).one_or_none()
    if row is None:
        raise NotFoundError("Inspection report not found.", code="inspection_not_found")
    report, listing, inspector, owner = row
    return report, listing, inspector, owner


async def inspection_review_queue(*, db: AsyncSession) -> InspectionReviewQueue:
    inspector_alias = aliased(User)
    owner_alias = aliased(User)
    stmt = (
        select(InspectionReport, Listing, inspector_alias, owner_alias)
        .join(Listing, Listing.id == InspectionReport.listing_id)
        .join(inspector_alias, inspector_alias.id == InspectionReport.inspector_id)
        .join(owner_alias, owner_alias.id == Listing.owner_id)
        .where(InspectionReport.status == InspectionReportStatus.PENDING)
        .order_by(InspectionReport.submitted_at.asc())
    )
    rows = (await db.execute(stmt)).all()
    items = [
        InspectionReviewQueueRow(
            report_id=str(report.id),
            listing_id=str(listing.id),
            listing_title=listing.title or "Untitled",
            category=listing.category,
            inspector_name=_full_name(inspector),
            landlord_name=_full_name(owner),
            submitted_at=report.submitted_at,
            status=report.status,
        )
        for report, listing, inspector, owner in rows
    ]
    return InspectionReviewQueue(items=items, total=len(items))


async def inspection_review_detail(
    *, report_id: uuid.UUID, db: AsyncSession
) -> InspectionReviewDetail:
    report, listing, inspector, owner = await _load_review_bundle(report_id=report_id, db=db)
    area_score = await get_area_score_for_listing(listing=listing, db=db)
    storage = get_storage()

    evidence = [
        InspectionEvidenceView(
            filename=str(item.get("filename", "evidence")),
            content_type=str(item.get("content_type", "")),
            captured_at=str(item.get("captured_at", "")),
            gps_lat=(
                float(item["gps_lat"]) if item.get("gps_lat") is not None else None
            ),
            gps_lng=(
                float(item["gps_lng"]) if item.get("gps_lng") is not None else None
            ),
            note=str(item["note"]) if item.get("note") else None,
            url=(
                storage.presigned_get(
                    key=str(item["s3_key"]),
                    expiry_seconds=DEFAULT_GET_EXPIRY,
                )
                if item.get("s3_key")
                else None
            ),
        )
        for item in (report.evidence or [])
    ]

    return InspectionReviewDetail(
        report_id=str(report.id),
        listing_id=str(listing.id),
        listing_title=listing.title or "Untitled",
        category=listing.category,
        status=report.status,
        inspector_name=_full_name(inspector),
        landlord_name=_full_name(owner),
        submitted_at=report.submitted_at,
        inspector_note=report.inspector_note,
        review_note=report.review_note,
        address_line=listing.address_line,
        district=listing.district,
        visit_gps_lat=report.visit_gps_lat,
        visit_gps_lng=report.visit_gps_lng,
        assessment=report.assessment or {},
        evidence=evidence,
        area_score=_area_score_view(listing, area_score),
    )


async def _complete_physical_badge_award(
    *,
    admin: User,
    report: InspectionReport,
    listing: Listing,
    inspector: User,
    note: str | None,
    audit_action: str,
    db: AsyncSession,
    redis: Redis,
) -> InspectionReport:
    if await listing_has_active_badge(
        listing_id=listing.id, badge_type=BadgeType.PHYSICAL, db=db
    ):
        raise ConflictError(
            "Listing already has an active physical badge.",
            code="physical_badge_exists",
        )

    has_doc_badge = await listing_has_active_badge(
        listing_id=listing.id, badge_type=BadgeType.DOCUMENT, db=db
    )
    if listing.category != ListingCategory.OFF_CAMPUS and not has_doc_badge:
        raise ConflictError(
            "A document badge is required before approving the physical badge.",
            code="doc_badge_required",
        )

    assessment = _validated_assessment(report)
    _apply_confirmed_amenities(listing=listing, assessment=assessment)

    if report.status == InspectionReportStatus.PENDING:
        report.status = InspectionReportStatus.APPROVED
        report.reviewed_by_id = admin.id
        report.reviewed_at = datetime.now(timezone.utc)
        report.review_note = note
    elif report.status != InspectionReportStatus.APPROVED:
        raise ConflictError(
            "Listing needs a pending or approved inspection report before a physical badge can be issued.",
            code="inspection_report_not_ready",
        )

    badge = await issue_physical_badge(
        listing_id=listing.id,
        admin_id=admin.id,
        inspector_id=inspector.id,
        db=db,
    )
    listing.status = ListingStatus.FULLY_VERIFIED
    await generate_and_store_valuation_report(
        listing=listing,
        inspector_note=report.inspector_note,
        db=db,
        redis=redis,
    )
    await audit.record(
        admin_id=admin.id,
        entity_type="inspection_report",
        entity_id=report.id,
        action=audit_action,
        payload={"badge_id": str(badge.id), "listing_id": str(listing.id)},
        db=db,
    )
    await dispatch_notification(
        user_id=listing.owner_id,
        event_type="badge.issued",
        payload={
            "listing_id": str(listing.id),
            "listing_title": listing.title or "Your listing",
            "badge_type": "physical",
        },
        db=db,
    )
    return report


async def approve_inspection_report(
    *,
    admin: User,
    report_id: uuid.UUID,
    note: str | None,
    db: AsyncSession,
    redis: Redis,
) -> InspectionReport:
    report, listing, inspector, _ = await _load_review_bundle(report_id=report_id, db=db)
    if report.status != InspectionReportStatus.PENDING:
        raise ConflictError(
            "Inspection report is not awaiting review.",
            code="inspection_not_pending",
        )
    return await _complete_physical_badge_award(
        admin=admin,
        report=report,
        listing=listing,
        inspector=inspector,
        note=note,
        audit_action="inspection.approve",
        db=db,
        redis=redis,
    )


async def award_physical_badge_for_listing(
    *,
    admin: User,
    listing_id: uuid.UUID,
    db: AsyncSession,
    redis: Redis,
) -> Listing:
    inspector_alias = aliased(User)
    owner_alias = aliased(User)
    row = (
        await db.execute(
            select(InspectionReport, Listing, inspector_alias, owner_alias)
            .join(Listing, Listing.id == InspectionReport.listing_id)
            .join(inspector_alias, inspector_alias.id == InspectionReport.inspector_id)
            .join(owner_alias, owner_alias.id == Listing.owner_id)
            .where(
                Listing.id == listing_id,
                InspectionReport.status.in_(
                    (
                        InspectionReportStatus.PENDING,
                        InspectionReportStatus.APPROVED,
                    )
                ),
            )
            .order_by(
                InspectionReport.submitted_at.desc().nullslast(),
                InspectionReport.created_at.desc(),
            )
            .limit(1)
        )
    ).one_or_none()
    if row is None:
        raise ConflictError(
            "A pending or approved inspection report is required before a physical badge can be issued.",
            code="inspection_report_required",
        )

    report, listing, inspector, _ = row
    await _complete_physical_badge_award(
        admin=admin,
        report=report,
        listing=listing,
        inspector=inspector,
        note=None,
        audit_action="listing.physical_badge_award",
        db=db,
        redis=redis,
    )
    return listing


async def query_inspection_report(
    *,
    admin: User,
    report_id: uuid.UUID,
    note: str | None,
    db: AsyncSession,
) -> InspectionReport:
    if not note:
        raise ValidationError(
            "A note is required when querying an inspection report.",
            code="inspection_query_note_required",
        )
    report, _, _, _ = await _load_review_bundle(report_id=report_id, db=db)
    if report.status != InspectionReportStatus.PENDING:
        raise ConflictError(
            "Inspection report is not awaiting review.",
            code="inspection_not_pending",
        )
    report.status = InspectionReportStatus.QUERIED
    report.reviewed_by_id = admin.id
    report.reviewed_at = datetime.now(timezone.utc)
    report.review_note = note
    await audit.record(
        admin_id=admin.id,
        entity_type="inspection_report",
        entity_id=report.id,
        action="inspection.query",
        payload={"note": note},
        db=db,
    )
    return report


async def reject_inspection_report(
    *,
    admin: User,
    report_id: uuid.UUID,
    note: str | None,
    db: AsyncSession,
) -> InspectionReport:
    if not note:
        raise ValidationError(
            "A note is required when rejecting an inspection report.",
            code="inspection_reject_note_required",
        )
    report, _, _, _ = await _load_review_bundle(report_id=report_id, db=db)
    if report.status != InspectionReportStatus.PENDING:
        raise ConflictError(
            "Inspection report is not awaiting review.",
            code="inspection_not_pending",
        )
    report.status = InspectionReportStatus.REJECTED
    report.reviewed_by_id = admin.id
    report.reviewed_at = datetime.now(timezone.utc)
    report.review_note = note
    await audit.record(
        admin_id=admin.id,
        entity_type="inspection_report",
        entity_id=report.id,
        action="inspection.reject",
        payload={"note": note},
        db=db,
    )
    return report


async def get_listing_area_score(
    *, listing_id: uuid.UUID, db: AsyncSession
) -> AreaScoreView:
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    area_score = await get_area_score_for_listing(listing=listing, db=db)
    return _area_score_view(listing, area_score)


async def update_listing_area_score(
    *,
    admin: User,
    listing_id: uuid.UUID,
    payload: AreaScoreUpdatePayload,
    db: AsyncSession,
    redis: Redis,
) -> AreaScoreView:
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if listing.gps_lat is None or listing.gps_lng is None:
        raise ValidationError(
            "Listing does not have GPS coordinates yet.",
            code="listing_gps_missing",
        )
    record = await upsert_area_score(
        lat=listing.gps_lat,
        lng=listing.gps_lng,
        payload=AreaScorePayload(
            road_condition=payload.road_condition,
            electricity_supply_hours=payload.electricity_supply_hours,
            security=payload.security,
            proximity=payload.proximity,
        ),
        source="admin_edit",
        db=db,
    )
    await regenerate_reports_for_area_score(area_score=record, db=db, redis=redis)
    await audit.record(
        admin_id=admin.id,
        entity_type="area_score",
        entity_id=record.id,
        action="area_score.update",
        payload={"listing_id": str(listing.id)},
        db=db,
    )
    return _area_score_view(listing, record)
