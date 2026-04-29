"""Inspector portal service layer.

Conventions:
  • Inspector-only operations require `user.role == INSPECTOR`.
  • Admin-only operations are guarded at the route level via require_role.
  • Reports lock when status moves out of ASSIGNED/IN_PROGRESS — only the
    admin review path can edit them after submission.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.otp_service import OtpService
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.inspector.area_scoring import AreaScorePayload, upsert_area_score
from app.inspector.schemas import (
    AssignmentRow,
    BriefingPack,
    EvidenceRegisterPayload,
    EvidenceUploadSignaturePayload,
    EvidenceUploadSignatureResponse,
    InfrastructureScorePayload,
    InspectorInvitePayload,
    InspectorInviteResponse,
    ReportDraftPayload,
    ReportView,
)
from app.integrations.s3_storage import get_storage
from app.models._enums import InspectionReportStatus, ListingStatus, UserRole
from app.models.inspection import InspectionReport
from app.models.listing import Listing
from app.models.user import User
from app.notifications.dispatch import dispatch_notification
from app.verification.reports import regenerate_reports_for_area_score


# ---------------------------------------------------------------------------
# Inspector account creation (admin)
# ---------------------------------------------------------------------------


async def invite_inspector(
    *, admin: User, payload: InspectorInvitePayload, db: AsyncSession, redis
) -> InspectorInviteResponse:
    existing = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("A user with that email already exists.", code="user_exists")

    inspector = User(
        email=payload.email,
        phone=payload.phone,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        role=UserRole.INSPECTOR,
        is_active=True,
        is_suspended=False,
    )
    db.add(inspector)
    await db.flush()

    # Send a WhatsApp OTP if a phone number is on record (preferred per dev
    # plan §8.1) — otherwise fall back to email.
    otp = OtpService(redis)
    invitation_sent = False
    try:
        if payload.phone:
            await otp.request(channel="whatsapp", identifier=payload.phone)
        else:
            await otp.request(channel="email", identifier=payload.email)
        invitation_sent = True
    except Exception:
        # Invitation delivery failure is non-fatal — admin can resend.
        invitation_sent = False

    return InspectorInviteResponse(
        user_id=str(inspector.id),
        email=inspector.email,
        invitation_sent=invitation_sent,
    )


async def acknowledge_conduct(*, user: User, db: AsyncSession) -> None:
    if user.role not in (UserRole.INSPECTOR, UserRole.TRUSTED_AGENT):
        raise ForbiddenError(
            "Conduct ack only applies to inspectors and trusted agents.",
            code="conduct_ack_not_applicable",
        )
    if user.conduct_acknowledged_at is None:
        user.conduct_acknowledged_at = datetime.now(timezone.utc)
        await db.flush()


def is_activation_complete(user: User) -> bool:
    """Inspector activation gate per dev plan §8.1."""
    return (
        user.first_name is not None
        and user.last_name is not None
        and user.profile_photo_url is not None
        and user.nin_verified is True
        and user.conduct_acknowledged_at is not None
    )


# ---------------------------------------------------------------------------
# Assignment (admin -> inspector)
# ---------------------------------------------------------------------------


async def assign_inspection(
    *, admin: User, listing_id: uuid.UUID, inspector_id: uuid.UUID, db: AsyncSession
) -> InspectionReport:
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if listing.status not in (
        ListingStatus.LIVE_UNVERIFIED,
        ListingStatus.DOC_VERIFIED,
        ListingStatus.FULLY_VERIFIED,
    ):
        raise ConflictError(
            "Inspection only assignable on live listings.",
            code="listing_not_assignable",
        )

    inspector = await db.get(User, inspector_id)
    if inspector is None or inspector.role != UserRole.INSPECTOR:
        raise NotFoundError("Inspector not found.", code="inspector_not_found")
    if not is_activation_complete(inspector):
        raise ConflictError(
            "Inspector has not completed activation.", code="inspector_not_activated"
        )

    # One active (non-terminal) report per (listing, inspector). Re-assigning
    # while another is open should be explicit on the admin side.
    open_stmt = select(InspectionReport).where(
        InspectionReport.listing_id == listing_id,
        InspectionReport.inspector_id == inspector_id,
        InspectionReport.status.in_(
            (
                InspectionReportStatus.ASSIGNED,
                InspectionReportStatus.IN_PROGRESS,
                InspectionReportStatus.PENDING,
                InspectionReportStatus.QUERIED,
            )
        ),
    )
    if (await db.execute(open_stmt)).scalar_one_or_none() is not None:
        raise ConflictError(
            "An open report already exists for this listing + inspector.",
            code="duplicate_assignment",
        )

    report = InspectionReport(
        listing_id=listing_id,
        inspector_id=inspector_id,
        status=InspectionReportStatus.ASSIGNED,
        assessment={},
        evidence=[],
        assigned_by_id=admin.id,
        assigned_at=datetime.now(timezone.utc),
    )
    db.add(report)
    await db.flush()
    return report


async def list_assignments(*, inspector: User, db: AsyncSession) -> list[AssignmentRow]:
    if inspector.role != UserRole.INSPECTOR:
        raise ForbiddenError("Only inspectors see assignments.", code="not_inspector")
    stmt = (
        select(InspectionReport, Listing)
        .join(Listing, Listing.id == InspectionReport.listing_id)
        .where(
            InspectionReport.inspector_id == inspector.id,
            InspectionReport.status.in_(
                (
                    InspectionReportStatus.ASSIGNED,
                    InspectionReportStatus.IN_PROGRESS,
                    InspectionReportStatus.QUERIED,
                    InspectionReportStatus.PENDING,
                )
            ),
        )
        .order_by(InspectionReport.assigned_at.asc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        AssignmentRow(
            report_id=str(r.id),
            listing_id=str(l.id),
            listing_title=l.title or "Untitled",
            listing_category=l.category,
            address_district=l.district,
            listing_gps_lat=l.gps_lat,
            listing_gps_lng=l.gps_lng,
            status=r.status,
            assigned_at=r.assigned_at,
            submitted_at=r.submitted_at,
        )
        for r, l in rows
    ]


async def briefing_pack(
    *, inspector: User, report_id: uuid.UUID, db: AsyncSession
) -> BriefingPack:
    report, listing = await _load_report_for_inspector(inspector=inspector, report_id=report_id, db=db)
    cover = next((p for p in listing.photos if p.is_cover), None) or next(iter(listing.photos), None)
    return BriefingPack(
        report_id=str(report.id),
        listing_id=str(listing.id),
        listing_title=listing.title or "Untitled",
        listing_subtitle=listing.subtitle,
        listing_category=listing.category,
        description=listing.description,
        district=listing.district,
        address_line=listing.address_line,
        listing_gps_lat=listing.gps_lat,
        listing_gps_lng=listing.gps_lng,
        cover_photo_url=cover.url if cover else None,
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
    )


# ---------------------------------------------------------------------------
# Report draft + submit
# ---------------------------------------------------------------------------


async def get_report(
    *, inspector: User, report_id: uuid.UUID, db: AsyncSession
) -> ReportView:
    report, _ = await _load_report_for_inspector(inspector=inspector, report_id=report_id, db=db)
    return _to_view(report)


async def save_draft(
    *,
    inspector: User,
    report_id: uuid.UUID,
    payload: ReportDraftPayload,
    db: AsyncSession,
) -> ReportView:
    report, _ = await _load_report_for_inspector(inspector=inspector, report_id=report_id, db=db)
    if report.status not in (
        InspectionReportStatus.ASSIGNED,
        InspectionReportStatus.IN_PROGRESS,
        InspectionReportStatus.QUERIED,
    ):
        raise ConflictError(
            "Report is locked — admin review controls further edits.",
            code="report_locked",
        )

    # Merge the assessment dict so a partial sync doesn't wipe earlier values.
    if payload.assessment is not None:
        merged = dict(report.assessment or {})
        merged.update(payload.assessment)
        report.assessment = merged
    if payload.inspector_note is not None:
        report.inspector_note = payload.inspector_note
    if payload.visit_gps_lat is not None:
        report.visit_gps_lat = payload.visit_gps_lat
    if payload.visit_gps_lng is not None:
        report.visit_gps_lng = payload.visit_gps_lng

    if report.status == InspectionReportStatus.ASSIGNED:
        report.status = InspectionReportStatus.IN_PROGRESS

    await db.flush()
    return _to_view(report)


async def submit_report(
    *, inspector: User, report_id: uuid.UUID, db: AsyncSession
) -> ReportView:
    report, _ = await _load_report_for_inspector(inspector=inspector, report_id=report_id, db=db)
    if report.status not in (
        InspectionReportStatus.ASSIGNED,
        InspectionReportStatus.IN_PROGRESS,
        InspectionReportStatus.QUERIED,
    ):
        raise ConflictError("Report is already submitted.", code="already_submitted")
    if not report.assessment:
        raise ValidationError(
            "Add at least one assessment field before submitting.",
            code="empty_assessment",
        )
    if not report.evidence:
        raise ValidationError(
            "Submit at least one piece of evidence (photo or video).",
            code="evidence_required",
        )
    if report.visit_gps_lat is None or report.visit_gps_lng is None:
        raise ValidationError(
            "Drop the property pin before submitting.",
            code="visit_gps_required",
        )

    report.status = InspectionReportStatus.PENDING
    report.submitted_at = datetime.now(timezone.utc)
    await db.flush()

    # Notify admin staff (audience handled by the template; in-app + email
    # only — no WhatsApp template is approved for this internal ping).
    listing = await db.get(Listing, report.listing_id)
    title = listing.title if listing else "(unknown listing)"
    if listing is not None:
        await dispatch_notification(
            user_id=report.assigned_by_id or inspector.id,
            event_type="inspection.submitted",
            payload={"report_id": str(report.id), "listing_title": title},
            db=db,
        )

    return _to_view(report)


# ---------------------------------------------------------------------------
# Evidence upload
# ---------------------------------------------------------------------------


async def evidence_upload_signature(
    *,
    inspector: User,
    report_id: uuid.UUID,
    payload: EvidenceUploadSignaturePayload,
    db: AsyncSession,
) -> EvidenceUploadSignatureResponse:
    report, _ = await _load_report_for_inspector(inspector=inspector, report_id=report_id, db=db)
    if report.status not in (
        InspectionReportStatus.ASSIGNED,
        InspectionReportStatus.IN_PROGRESS,
        InspectionReportStatus.QUERIED,
    ):
        raise ConflictError("Report is locked.", code="report_locked")

    safe = payload.filename.replace("/", "_").replace("\\", "_")
    key = f"inspections/{report.id}/evidence/{int(time.time())}-{safe}"
    presigned = get_storage().presigned_put(key=key, content_type=payload.content_type)
    return EvidenceUploadSignatureResponse(
        url=presigned.url, s3_key=presigned.key, headers=presigned.headers
    )


async def register_evidence(
    *,
    inspector: User,
    report_id: uuid.UUID,
    payload: EvidenceRegisterPayload,
    db: AsyncSession,
) -> ReportView:
    report, _ = await _load_report_for_inspector(inspector=inspector, report_id=report_id, db=db)
    if report.status not in (
        InspectionReportStatus.ASSIGNED,
        InspectionReportStatus.IN_PROGRESS,
        InspectionReportStatus.QUERIED,
    ):
        raise ConflictError("Report is locked.", code="report_locked")

    items = list(report.evidence or [])
    items.append(
        {
            "s3_key": payload.s3_key,
            "filename": payload.filename,
            "content_type": payload.content_type,
            "captured_at": payload.captured_at.isoformat(),
            "gps_lat": payload.gps_lat,
            "gps_lng": payload.gps_lng,
            "note": payload.note,
        }
    )
    report.evidence = items
    if report.status == InspectionReportStatus.ASSIGNED:
        report.status = InspectionReportStatus.IN_PROGRESS
    await db.flush()
    return _to_view(report)


# ---------------------------------------------------------------------------
# Infrastructure scores (area-cell)
# ---------------------------------------------------------------------------


async def submit_infrastructure_score(
    *,
    inspector: User,
    report_id: uuid.UUID,
    payload: InfrastructureScorePayload,
    db: AsyncSession,
    redis: Redis,
) -> dict:
    report, _ = await _load_report_for_inspector(inspector=inspector, report_id=report_id, db=db)
    if report.status not in (
        InspectionReportStatus.ASSIGNED,
        InspectionReportStatus.IN_PROGRESS,
        InspectionReportStatus.QUERIED,
    ):
        raise ConflictError("Report is locked.", code="report_locked")
    record = await upsert_area_score(
        lat=payload.lat,
        lng=payload.lng,
        payload=AreaScorePayload(
            road_condition=payload.road_condition,
            electricity_supply_hours=payload.electricity_supply_hours,
            security=payload.security,
            proximity=payload.proximity,
            landmarks=payload.landmarks,
        ),
        source="inspection",
        db=db,
    )
    await regenerate_reports_for_area_score(area_score=record, db=db, redis=redis)
    return {
        "cell_lat": record.cell_lat,
        "cell_lng": record.cell_lng,
        "last_assessed_at": record.last_assessed_at.isoformat() if record.last_assessed_at else None,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_report_for_inspector(
    *, inspector: User, report_id: uuid.UUID, db: AsyncSession
) -> tuple[InspectionReport, Listing]:
    report = await db.get(InspectionReport, report_id)
    if report is None:
        raise NotFoundError("Report not found.", code="report_not_found")
    if str(report.inspector_id) != str(inspector.id):
        raise ForbiddenError("Not your report.", code="report_not_yours")
    stmt = (
        select(Listing)
        .where(Listing.id == report.listing_id)
        .options(selectinload(Listing.photos))
    )
    listing = (await db.execute(stmt)).scalar_one()
    return report, listing


def _to_view(report: InspectionReport) -> ReportView:
    return ReportView(
        id=str(report.id),
        listing_id=str(report.listing_id),
        inspector_id=str(report.inspector_id),
        status=report.status,
        assessment=report.assessment or {},
        evidence=list(report.evidence or []),
        visit_gps_lat=report.visit_gps_lat,
        visit_gps_lng=report.visit_gps_lng,
        inspector_note=report.inspector_note,
        submitted_at=report.submitted_at,
        review_note=report.review_note,
    )
