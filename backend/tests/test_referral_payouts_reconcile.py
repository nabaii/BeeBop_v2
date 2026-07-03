"""Transfer-webhook reconciliation for referral payouts (P0 — the fix that
closes the loop on asynchronous Paystack transfers).

On a live account a transfer settles out of band, so `reconcile_transfer` is
where `transfer.success` / `transfer.failed` / `transfer.reversed` land. The
invariants under test:

  • success   → payout SUCCESS, earnings stay PAID (already reserved);
  • failed    → payout FAILED, reserved earnings restored to CLEARED (balance
                comes back so the user can retry) — this is the vanishing-money
                bug the P0 sprint fixed;
  • reversed  → same restoration even from a SUCCESS payout (money bounced);
  • idempotent — Paystack retries webhooks, so a repeated terminal event is a
                no-op;
  • unknown reference → no-op (None), so unrelated transfers are ignored.

Exercised against a faithful fake session (no DB) — the referral models use
Postgres-native UUID/enum types that don't map onto SQLite, so unit scope stays
in-process while the integration suite covers the wired path against Postgres.
"""

from __future__ import annotations

import uuid

import pytest

from app.models._enums import PayoutStatus, ReferralEarningState
from app.models.referral import Payout, ReferralEarning
from app.referrals.payouts import reconcile_transfer

pytestmark = pytest.mark.asyncio


class _FakeResult:
    def __init__(self, rows: list[object]) -> None:
        self._rows = list(rows)

    def scalars(self) -> "_FakeResult":
        return self

    def first(self) -> object | None:
        return self._rows[0] if self._rows else None

    def all(self) -> list[object]:
        return list(self._rows)


class _FakeSession:
    """Returns the seeded Payout / ReferralEarning rows the reconcile path asks
    for, keyed on the entity of the SELECT. flush() is a counted no-op."""

    def __init__(self, *, payouts: list[Payout], earnings: list[ReferralEarning]) -> None:
        self._payouts = payouts
        self._earnings = earnings
        self.flush_count = 0

    async def execute(self, stmt):  # type: ignore[no-untyped-def]
        entity = stmt.column_descriptions[0]["entity"]
        if entity is Payout:
            return _FakeResult(self._payouts)
        if entity is ReferralEarning:
            return _FakeResult(self._earnings)
        return _FakeResult([])

    async def flush(self) -> None:
        self.flush_count += 1


def _payout(ref: str, status: PayoutStatus = PayoutStatus.REQUESTED) -> Payout:
    p = Payout()
    p.id = uuid.uuid4()
    p.paystack_transfer_ref = ref
    p.status = status
    p.amount = 15000
    return p


def _earning(payout_id: uuid.UUID) -> ReferralEarning:
    e = ReferralEarning()
    e.id = uuid.uuid4()
    e.state = ReferralEarningState.PAID
    e.payout_id = payout_id
    e.paid_at = None  # stamped at request time in prod; irrelevant to restore
    e.amount = 15000
    return e


async def test_success_marks_paid_and_keeps_earnings_reserved() -> None:
    payout = _payout("payout_abc")
    earning = _earning(payout.id)
    db = _FakeSession(payouts=[payout], earnings=[earning])

    result = await reconcile_transfer(reference="payout_abc", outcome="success", db=db)

    assert result is payout
    assert payout.status == PayoutStatus.SUCCESS
    assert payout.settled_at is not None
    # Earnings stay reserved against the (now settled) payout.
    assert earning.state == ReferralEarningState.PAID
    assert earning.payout_id == payout.id


async def test_failed_restores_earnings_to_available() -> None:
    payout = _payout("payout_def")
    earning = _earning(payout.id)
    db = _FakeSession(payouts=[payout], earnings=[earning])

    result = await reconcile_transfer(reference="payout_def", outcome="failed", db=db)

    assert result is payout
    assert payout.status == PayoutStatus.FAILED
    assert payout.failure_reason
    assert payout.settled_at is None
    # The vanishing-money guard: reserved earnings come back as withdrawable.
    assert earning.state == ReferralEarningState.CLEARED
    assert earning.payout_id is None
    assert earning.paid_at is None


async def test_reversed_restores_even_from_success() -> None:
    # A transfer can be reversed after briefly succeeding — the money bounced.
    payout = _payout("payout_rev", status=PayoutStatus.SUCCESS)
    earning = _earning(payout.id)
    db = _FakeSession(payouts=[payout], earnings=[earning])

    await reconcile_transfer(reference="payout_rev", outcome="reversed", db=db)

    assert payout.status == PayoutStatus.FAILED
    assert earning.state == ReferralEarningState.CLEARED
    assert earning.payout_id is None


async def test_success_is_idempotent_on_redelivery() -> None:
    payout = _payout("payout_idem", status=PayoutStatus.SUCCESS)
    db = _FakeSession(payouts=[payout], earnings=[])

    result = await reconcile_transfer(reference="payout_idem", outcome="success", db=db)

    assert result is payout
    assert payout.status == PayoutStatus.SUCCESS
    # No state change written on the second delivery.
    assert db.flush_count == 0


async def test_failed_is_idempotent_on_redelivery() -> None:
    payout = _payout("payout_idem2", status=PayoutStatus.FAILED)
    earning = _earning(payout.id)  # already restored previously
    earning.state = ReferralEarningState.CLEARED
    earning.payout_id = None
    db = _FakeSession(payouts=[payout], earnings=[earning])

    result = await reconcile_transfer(reference="payout_idem2", outcome="failed", db=db)

    assert result is payout
    assert payout.status == PayoutStatus.FAILED
    assert db.flush_count == 0


async def test_unknown_reference_is_ignored() -> None:
    db = _FakeSession(payouts=[], earnings=[])
    result = await reconcile_transfer(reference="nope", outcome="success", db=db)
    assert result is None
