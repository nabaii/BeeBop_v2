"""Referral payouts — the withdrawal flow (spec §7).

A withdrawal sweeps the user's entire Cleared/Available balance into a single
Paystack Transfer:

  1. Gate on the configured minimum threshold (§7.1, §7.2).
  2. Create a Payout record (status REQUESTED) so every attempt is auditable.
  3. Register a transfer recipient and initiate the transfer.
  4. On success, move the settled earnings to PAID and stamp the payout SUCCESS.
  5. On a hard failure, mark the payout FAILED and leave the earnings Available
     so the user can retry (§7.1.11).

Only CLEARED earnings are ever withdrawable — never PENDING (§7.2). Earnings are
linked to the payout that settled them via `payout_id`, which also prevents a
second concurrent withdrawal from spending the same earning twice.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ExternalServiceError, ValidationError
from app.integrations.paystack import (
    BankOption,
    ResolvedAccount,
    get_paystack,
    make_reference,
)
from app.models._enums import PayoutStatus, ReferralEarningState
from app.models.referral import Payout, ReferralEarning
from app.models.user import User
from app.referrals.service import get_config

logger = logging.getLogger(__name__)


def _full_name(user: User) -> str:
    name = " ".join(p for p in (user.first_name, user.last_name) if p).strip()
    return name or (user.email or "Beebop user")


async def _withdrawable_earnings(
    *, user_id: uuid.UUID, db: AsyncSession
) -> list[ReferralEarning]:
    """Every cleared, not-yet-settled earning for the user."""
    rows = (
        await db.execute(
            select(ReferralEarning).where(
                ReferralEarning.beneficiary_user_id == user_id,
                ReferralEarning.state == ReferralEarningState.CLEARED,
                ReferralEarning.payout_id.is_(None),
            )
        )
    ).scalars().all()
    return list(rows)


async def request_withdrawal(
    *,
    user: User,
    bank_account_number: str,
    bank_code: str,
    db: AsyncSession,
    account_name: str | None = None,
) -> Payout:
    """Disburse the user's available balance via Paystack Transfer.

    Returns the Payout record. A returned payout with status FAILED is a normal
    (non-exceptional) outcome — the caller shows a retry path and the balance is
    untouched. Raises ValidationError when the request is not allowed at all
    (nothing withdrawable, below threshold).
    """
    config = await get_config(db)
    earnings = await _withdrawable_earnings(user_id=user.id, db=db)
    amount = round(sum(float(e.amount) for e in earnings), 2)

    if amount <= 0:
        raise ValidationError(
            "You have no cleared earnings to withdraw yet.",
            code="referral_nothing_to_withdraw",
        )
    minimum = int(config.min_withdrawal_naira)
    if amount < minimum:
        raise ValidationError(
            f"You need at least ₦{minimum:,} cleared to withdraw.",
            code="referral_below_minimum",
        )

    # Prefer the bank-resolved holder name (what the user confirmed on-screen);
    # fall back to the account's own name when resolution wasn't available.
    recipient_name = (account_name or "").strip() or _full_name(user)

    payout = Payout(
        user_id=user.id,
        amount=amount,
        status=PayoutStatus.REQUESTED,
        bank_account_number=bank_account_number,
        bank_code=bank_code,
        bank_account_name=recipient_name,
    )
    db.add(payout)
    await db.flush()  # assign payout.id before linking earnings

    paystack = get_paystack()
    reference = make_reference("payout")
    try:
        recipient_code = await paystack.create_transfer_recipient(
            name=recipient_name,
            account_number=bank_account_number,
            bank_code=bank_code,
        )
        transfer = await paystack.initiate_transfer(
            amount_naira=amount,
            recipient_code=recipient_code,
            reference=reference,
            reason="Beebop referral earnings",
        )
    except ExternalServiceError as exc:
        # Keep the balance Available and record the failed attempt (§7.1.11).
        payout.status = PayoutStatus.FAILED
        payout.failure_reason = str(exc)
        await db.flush()
        logger.info("Payout %s failed: %s", payout.id, getattr(exc, "code", "unknown"))
        return payout

    # Reserve the settled earnings against this payout. We do this for both
    # "success" and "pending" transfers so the funds can't be withdrawn twice;
    # a pending transfer is reconciled to SUCCESS out of band (webhook, R-later).
    now = datetime.now(UTC)
    for earning in earnings:
        earning.state = ReferralEarningState.PAID
        earning.paid_at = now
        earning.payout_id = payout.id

    payout.paystack_transfer_ref = transfer.reference
    if transfer.status == "success":
        payout.status = PayoutStatus.SUCCESS
        payout.settled_at = now
    await db.flush()
    return payout


async def _restore_earnings(*, payout_id: uuid.UUID, db: AsyncSession) -> None:
    """Undo the PAID reservation made against a payout that ultimately failed.

    Returns the earnings to CLEARED (available) and detaches them from the
    payout so the user can withdraw them again (§7.1.11). Symmetric with the
    reservation loop in `request_withdrawal`.
    """
    rows = (
        await db.execute(
            select(ReferralEarning).where(ReferralEarning.payout_id == payout_id)
        )
    ).scalars().all()
    for earning in rows:
        earning.state = ReferralEarningState.CLEARED
        earning.paid_at = None
        earning.payout_id = None


async def reconcile_transfer(
    *,
    reference: str,
    outcome: Literal["success", "failed", "reversed"],
    reason: str | None = None,
    db: AsyncSession,
) -> Payout | None:
    """Apply a Paystack transfer webhook to the payout it settled.

    On a live account transfers are asynchronous: `request_withdrawal` leaves the
    payout REQUESTED (with its earnings reserved as PAID) and Paystack later fires
    `transfer.success`, `transfer.failed`, or `transfer.reversed`. This is where
    those land.

    - success  → payout SUCCESS; the earnings stay PAID (already reserved).
    - failed   → payout FAILED; the reserved earnings return to CLEARED so the
                 balance is restored and the user can retry.
    - reversed → same as failed — the money bounced back to Beebop's balance,
                 even if the payout had briefly been marked SUCCESS.

    Idempotent: Paystack retries webhooks, so a second delivery of an already
    terminal outcome is a no-op. Returns None when no payout matches the
    reference (e.g. an unrelated transfer), which the caller treats as ignored.
    """
    payout = (
        await db.execute(
            select(Payout).where(Payout.paystack_transfer_ref == reference)
        )
    ).scalars().first()
    if payout is None:
        return None

    if outcome == "success":
        if payout.status == PayoutStatus.SUCCESS:
            return payout  # already reconciled — idempotent no-op
        payout.status = PayoutStatus.SUCCESS
        payout.settled_at = datetime.now(UTC)
        payout.failure_reason = None
        await db.flush()
        logger.info("Payout %s reconciled to SUCCESS", payout.id)
        return payout

    # failed / reversed
    if payout.status == PayoutStatus.FAILED:
        return payout  # already reconciled — idempotent no-op
    payout.status = PayoutStatus.FAILED
    payout.failure_reason = reason or (
        "The bank transfer was reversed." if outcome == "reversed"
        else "The bank transfer failed."
    )
    payout.settled_at = None
    await _restore_earnings(payout_id=payout.id, db=db)
    await db.flush()
    logger.info("Payout %s reconciled to FAILED (%s); earnings restored", payout.id, outcome)
    return payout


async def list_banks() -> list[BankOption]:
    """Payout-eligible banks for the withdrawal picker (§7.1)."""
    return await get_paystack().list_banks()


async def resolve_account(*, account_number: str, bank_code: str) -> ResolvedAccount:
    """Verify a NUBAN + bank and return the account holder's name (§7.1).

    Raises ExternalServiceError when the account can't be resolved — the route
    maps that to a user-facing validation so a wrong number is caught before any
    money moves."""
    return await get_paystack().resolve_account(
        account_number=account_number, bank_code=bank_code
    )


async def list_payouts(*, user_id: uuid.UUID, db: AsyncSession) -> list[Payout]:
    rows = (
        await db.execute(
            select(Payout)
            .where(Payout.user_id == user_id)
            .order_by(Payout.created_at.desc())
        )
    ).scalars().all()
    return list(rows)
