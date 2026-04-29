"""Smoke tests for the Paystack stub client.

The live client gets coverage from the integration container in CI; the
stub is what every dev run uses, so it deserves explicit guards.
"""

from __future__ import annotations

import pytest

from app.integrations.paystack import StubPaystackClient


@pytest.mark.asyncio
async def test_stub_initialise_returns_pending_with_reference() -> None:
    client = StubPaystackClient()
    result = await client.initialise_payment(
        amount_naira=20000.0,
        email="seeker@example.com",
        reference="abc123",
    )
    assert result.reference == "abc123"
    assert result.status == "pending"
    assert result.authorization_url is not None
    assert result.authorization_url.startswith("https://stub.local/")


@pytest.mark.asyncio
async def test_stub_create_invoice_returns_due_in_future() -> None:
    from datetime import datetime, timezone

    client = StubPaystackClient()
    invoice = await client.create_invoice(
        amount_naira=1_500_000.0,
        email="seller@example.com",
        reference="inv1",
        due_in_hours=48,
        description="Test invoice",
    )
    due = datetime.fromisoformat(invoice.due_date)
    assert due > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_stub_verify_marks_success() -> None:
    client = StubPaystackClient()
    result = await client.verify("ref-123")
    assert result["status"] == "success"
    assert result["reference"] == "ref-123"
