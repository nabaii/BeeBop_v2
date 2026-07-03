"""Paystack webhook receiver + payer-facing verify endpoint.

The webhook is the source of truth for state changes. It verifies the signature,
then reconciles two families of events:

  • charges (agreement/booking facilitation fees) — via the agreement/booking
    services, keyed by the id in the metadata;
  • transfers (referral payouts) — via the payouts service, keyed by our
    transfer reference. This closes the loop on asynchronous payouts, which on a
    live account settle out of band as transfer.success/failed/reversed.

The verify endpoint is the human's closure after the hosted checkout redirects
them back: it asks Paystack for the true status and, on success, reconciles the
charge itself so the return page is correct even if the webhook is slow to fire.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import uuid

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agreements import service as agreement_service
from app.bookings import service as booking_service
from app.config import get_settings
from app.core.exceptions import ExternalServiceError
from app.database import AsyncSessionLocal
from app.integrations.paystack import get_paystack
from app.models.agreement import Agreement
from app.models.booking import Booking
from app.referrals import payouts as payout_service
from app.reservations import service as reservation_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])
settings = get_settings()

CHARGE_EVENTS = {
    "charge.success",
    "invoice.payment_succeeded",
    "paymentrequest.success",
}
# Paystack Transfer lifecycle events for referral payouts.
TRANSFER_OUTCOMES = {
    "transfer.success": "success",
    "transfer.failed": "failed",
    "transfer.reversed": "reversed",
}


def _allowed_webhook_ips() -> set[str]:
    raw = settings.paystack_webhook_ips or ""
    return {ip.strip() for ip in raw.split(",") if ip.strip()}


def _client_ip(request: Request) -> str | None:
    # Behind a proxy the origin is the first hop in X-Forwarded-For; fall back to
    # the direct peer otherwise.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _ip_allowed(request: Request) -> bool:
    allow = _allowed_webhook_ips()
    if not allow:
        return True  # unconfigured — the HMAC signature is the control
    return _client_ip(request) in allow


def _verify_signature(body: bytes, signature: str | None) -> bool:
    if not signature or not settings.paystack_secret_key:
        # Dev: allow stub webhooks without signature — easier local testing.
        return settings.environment == "development"
    expected = hmac.new(
        settings.paystack_secret_key.encode("utf-8"),
        body,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/paystack/webhook", status_code=status.HTTP_200_OK)
async def paystack_webhook(
    request: Request,
    x_paystack_signature: str | None = Header(default=None),
) -> dict[str, str]:
    if not _ip_allowed(request):
        logger.warning("Rejected Paystack webhook from %s", _client_ip(request))
        raise HTTPException(status_code=403, detail="Forbidden")

    body = await request.body()
    if not _verify_signature(body, x_paystack_signature):
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload = await request.json()
    event = payload.get("event")
    data = payload.get("data", {}) or {}
    reference = data.get("reference")

    # --- Transfer (payout) events -----------------------------------------
    if event in TRANSFER_OUTCOMES:
        if not reference:
            return {"status": "ignored"}
        outcome = TRANSFER_OUTCOMES[event]
        async with AsyncSessionLocal() as db:
            await payout_service.reconcile_transfer(
                reference=reference,
                outcome=outcome,  # type: ignore[arg-type]
                db=db,
            )
            await db.commit()
        return {"status": "processed"}

    # --- Charge (facilitation fee) events ---------------------------------
    if event not in CHARGE_EVENTS:
        return {"status": "ignored"}
    if not reference:
        return {"status": "ignored"}

    metadata = data.get("metadata") or {}
    agreement_id = metadata.get("agreement_id")
    booking_id = metadata.get("booking_id")
    reservation_id = metadata.get("reservation_id")

    async with AsyncSessionLocal() as db:
        if agreement_id:
            await agreement_service.confirm_payment(
                agreement_id=uuid.UUID(agreement_id),
                reference=reference,
                db=db,
            )
        if booking_id:
            await booking_service.confirm_payment(
                booking_id=uuid.UUID(booking_id),
                reference=reference,
                db=db,
            )
        if reservation_id:
            await reservation_service.confirm_payment(
                reservation_id=uuid.UUID(reservation_id),
                reference=reference,
                db=db,
            )
        await db.commit()
    return {"status": "processed"}


async def _reconcile_charge_by_reference(
    reference: str, db: AsyncSession
) -> tuple[str | None, str | None]:
    """Best-effort apply a verified charge to its booking/agreement.

    Used by the verify endpoint as a webhook-independent safety net; both
    confirm_payment paths are idempotent. Returns (kind, continue_path) so the
    return page can deep-link the payer onward, or (None, None) if the reference
    matches nothing we own.
    """
    booking = (
        await db.execute(select(Booking).where(Booking.paystack_reference == reference))
    ).scalars().first()
    if booking is not None:
        await booking_service.confirm_payment(
            booking_id=booking.id, reference=reference, db=db
        )
        return "booking", "/dashboard/seeker"

    agreement = (
        await db.execute(
            select(Agreement).where(
                or_(
                    Agreement.landlord_payment_reference == reference,
                    Agreement.seeker_payment_reference == reference,
                    Agreement.sales_invoice_reference == reference,
                )
            )
        )
    ).scalars().first()
    if agreement is not None:
        await agreement_service.confirm_payment(
            agreement_id=agreement.id, reference=reference, db=db
        )
        return "agreement", f"/agreements/{agreement.id}"

    return None, None


@router.get("/paystack/verify/{reference}")
async def verify_payment(reference: str) -> dict[str, str | None]:
    """Report the true status of a charge to the returning payer.

    Public by design — the opaque reference is the capability, and the payer may
    land here before their session rehydrates from the external redirect. Maps
    Paystack's status to three states the return page renders: success / pending
    / failed. On success it also reconciles the charge so state is correct even
    if the webhook hasn't arrived yet.
    """
    paystack = get_paystack()
    try:
        data = await paystack.verify(reference)
    except ExternalServiceError:
        # Transient — tell the page to keep waiting rather than fail hard.
        return {"reference": reference, "status": "pending", "kind": None, "continue_path": None}

    raw = (data or {}).get("status")
    if raw == "success":
        async with AsyncSessionLocal() as db:
            kind, continue_path = await _reconcile_charge_by_reference(reference, db)
            await db.commit()
        return {
            "reference": reference,
            "status": "success",
            "kind": kind,
            "continue_path": continue_path,
        }
    if raw in ("failed", "reversed"):
        return {"reference": reference, "status": "failed", "kind": None, "continue_path": None}
    # abandoned / ongoing / anything else — still in flight from the payer's view.
    return {"reference": reference, "status": "pending", "kind": None, "continue_path": None}
