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


@pytest.mark.asyncio
async def test_stub_list_banks_returns_curated_list() -> None:
    client = StubPaystackClient()
    banks = await client.list_banks()
    assert len(banks) > 0
    assert all(b.name and b.code for b in banks)
    # Codes are unique so the picker can key on them.
    codes = [b.code for b in banks]
    assert len(codes) == len(set(codes))


@pytest.mark.asyncio
async def test_stub_resolve_account_soft_passes_with_name() -> None:
    client = StubPaystackClient()
    resolved = await client.resolve_account(account_number="0123456789", bank_code="058")
    assert resolved.account_number == "0123456789"
    assert resolved.account_name  # a name is shown so the confirm step works


@pytest.mark.asyncio
async def test_stub_transfer_recipient_returns_code() -> None:
    client = StubPaystackClient()
    code = await client.create_transfer_recipient(
        name="Amina Bello",
        account_number="0123456789",
        bank_code="058",
    )
    assert code.startswith("RCP_stub_")


@pytest.mark.asyncio
async def test_stub_transfer_disburses_instantly() -> None:
    # The stub must report success so the payout flow (earnings -> Paid) can run
    # end-to-end without a live Paystack balance (spec §7).
    client = StubPaystackClient()
    result = await client.initiate_transfer(
        amount_naira=15_000.0,
        recipient_code="RCP_stub_abc",
        reference="payout_ref1",
        reason="Beebop referral earnings",
    )
    assert result.reference == "payout_ref1"
    assert result.status == "success"
    assert result.transfer_code is not None
