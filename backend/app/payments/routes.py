"""Paystack webhook receiver. Verifies the signature, looks up the agreement
referenced by the metadata, and reconciles via the agreement service."""

from __future__ import annotations

import hashlib
import hmac
import logging
import uuid

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agreements import service as agreement_service
from app.bookings import service as booking_service
from app.config import get_settings
from app.database import AsyncSessionLocal
from app.reservations import service as reservation_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])
settings = get_settings()


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
    body = await request.body()
    if not _verify_signature(body, x_paystack_signature):
        raise HTTPException(status_code=400, detail="Invalid signature")

    payload = await request.json()
    event = payload.get("event")
    data = payload.get("data", {}) or {}
    metadata = data.get("metadata") or {}
    reference = data.get("reference")

    if event not in ("charge.success", "invoice.payment_succeeded", "paymentrequest.success"):
        return {"status": "ignored"}
    if not reference:
        return {"status": "ignored"}

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
