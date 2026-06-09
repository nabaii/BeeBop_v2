"""Paystack client — facilitation charges, sales invoices, host payouts.

Paystack works in kobo (1 NGN = 100 kobo). All money values internal to Beebop
are Naira (Decimal/float); we convert at the boundary.

The dev stub returns deterministic, locally-unique references so the rest of
the platform — payment record, notification dispatch, listing-status flip —
can run end-to-end without a live Paystack account.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx

from app.config import get_settings
from app.core.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)
settings = get_settings()

PAYSTACK_API = "https://api.paystack.co"


@dataclass
class ChargeResult:
    reference: str
    authorization_url: str | None
    status: Literal["pending", "success"]


@dataclass
class InvoiceResult:
    reference: str
    invoice_url: str | None
    due_date: str


class PaystackClient(Protocol):
    async def initialise_payment(
        self,
        *,
        amount_naira: float,
        email: str,
        reference: str,
        callback_url: str | None = None,
        metadata: dict | None = None,
    ) -> ChargeResult: ...

    async def create_invoice(
        self,
        *,
        amount_naira: float,
        email: str,
        reference: str,
        due_in_hours: int,
        description: str,
        metadata: dict | None = None,
    ) -> InvoiceResult: ...

    async def verify(self, reference: str) -> dict: ...


class LivePaystackClient:
    def __init__(self, secret_key: str) -> None:
        self._secret = secret_key
        self._headers = {"Authorization": f"Bearer {secret_key}"}

    async def initialise_payment(
        self,
        *,
        amount_naira: float,
        email: str,
        reference: str,
        callback_url: str | None = None,
        metadata: dict | None = None,
    ) -> ChargeResult:
        payload = {
            "email": email,
            "amount": int(round(amount_naira * 100)),  # kobo
            "reference": reference,
            "callback_url": callback_url,
            "metadata": metadata or {},
        }
        async with httpx.AsyncClient(timeout=15.0) as c:
            resp = await c.post(
                f"{PAYSTACK_API}/transaction/initialize",
                json=payload,
                headers=self._headers,
            )
        if resp.status_code >= 400:
            logger.warning("Paystack initialize failed %s: %s", resp.status_code, resp.text)
            raise ExternalServiceError(
                "Paystack rejected the charge.", code="paystack_init_failed"
            )
        data = resp.json().get("data", {})
        return ChargeResult(
            reference=data.get("reference", reference),
            authorization_url=data.get("authorization_url"),
            status="pending",
        )

    async def create_invoice(
        self,
        *,
        amount_naira: float,
        email: str,
        reference: str,
        due_in_hours: int,
        description: str,
        metadata: dict | None = None,
    ) -> InvoiceResult:
        from datetime import datetime, timedelta, timezone

        due_at = datetime.now(timezone.utc) + timedelta(hours=due_in_hours)
        payload = {
            "customer": email,
            "amount": int(round(amount_naira * 100)),
            "due_date": due_at.isoformat(),
            "description": description,
            "currency": "NGN",
            "metadata": metadata or {},
        }
        async with httpx.AsyncClient(timeout=15.0) as c:
            resp = await c.post(
                f"{PAYSTACK_API}/paymentrequest",
                json=payload,
                headers=self._headers,
            )
        if resp.status_code >= 400:
            logger.warning("Paystack invoice failed %s: %s", resp.status_code, resp.text)
            raise ExternalServiceError(
                "Paystack rejected the invoice.", code="paystack_invoice_failed"
            )
        data = resp.json().get("data", {})
        return InvoiceResult(
            reference=data.get("request_code", reference),
            invoice_url=data.get("offline_reference"),
            due_date=due_at.isoformat(),
        )

    async def verify(self, reference: str) -> dict:
        async with httpx.AsyncClient(timeout=15.0) as c:
            resp = await c.get(
                f"{PAYSTACK_API}/transaction/verify/{reference}",
                headers=self._headers,
            )
        if resp.status_code >= 400:
            raise ExternalServiceError(
                f"Paystack verify failed ({resp.status_code}).",
                code="paystack_verify_failed",
            )
        return resp.json().get("data", {})


class StubPaystackClient:
    """Local stand-in. Auto-marks payments as `success` on the next verify."""

    async def initialise_payment(
        self,
        *,
        amount_naira: float,
        email: str,
        reference: str,
        callback_url: str | None = None,
        metadata: dict | None = None,
    ) -> ChargeResult:
        logger.info(
            "[paystack:stub] initialise reference=%s amount=%.2f to=%s",
            reference,
            amount_naira,
            email,
        )
        return ChargeResult(
            reference=reference,
            authorization_url=f"https://stub.local/paystack/{reference}",
            status="pending",
        )

    async def create_invoice(
        self,
        *,
        amount_naira: float,
        email: str,
        reference: str,
        due_in_hours: int,
        description: str,
        metadata: dict | None = None,
    ) -> InvoiceResult:
        from datetime import datetime, timedelta, timezone

        due = datetime.now(timezone.utc) + timedelta(hours=due_in_hours)
        logger.info(
            "[paystack:stub] invoice reference=%s amount=%.2f to=%s due_at=%s",
            reference,
            amount_naira,
            email,
            due.isoformat(),
        )
        return InvoiceResult(
            reference=reference,
            invoice_url=f"https://stub.local/paystack/invoice/{reference}",
            due_date=due.isoformat(),
        )

    async def verify(self, reference: str) -> dict:
        # Stub treats every verify as a successful payment so the downstream
        # flow (listing-status flip, agreement release) can be exercised.
        return {"status": "success", "reference": reference}


def get_paystack() -> PaystackClient:
    if settings.paystack_secret_key:
        return LivePaystackClient(settings.paystack_secret_key)
    if settings.environment != "development":
        raise ExternalServiceError(
            "PAYSTACK_SECRET_KEY must be set outside development.",
            code="paystack_unconfigured",
        )
    return StubPaystackClient()


def make_reference(prefix: str) -> str:
    """Helper for service code that wants to assign references up front."""
    return f"{prefix}_{secrets.token_hex(8)}"
