"""Earning creation maths + clearing-window computation (§4, §5). Pure — no DB."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.referrals.rewards import resolve_referrer_share
from app.referrals.service import compute_clears_at

# Launch config defaults.
STD_SHARE = 0.40
T1, T2, T3 = 0.50, 0.55, 0.60


def test_standard_code_uses_flat_share() -> None:
    share = resolve_referrer_share(
        is_partner=False,
        cleared_referrals_this_semester=99,  # ignored for standard
        standard_share=STD_SHARE,
        tier1_share=T1,
        tier2_share=T2,
        tier3_share=T3,
    )
    assert share == STD_SHARE


@pytest.mark.parametrize(
    ("count", "expected"),
    [(0, T1), (3, T1), (4, T2), (7, T2), (8, T3), (40, T3)],
)
def test_partner_code_escalates_with_cleared_referrals(count: int, expected: float) -> None:
    share = resolve_referrer_share(
        is_partner=True,
        cleared_referrals_this_semester=count,
        standard_share=STD_SHARE,
        tier1_share=T1,
        tier2_share=T2,
        tier3_share=T3,
        tier1_max=3,
        tier2_max=7,
    )
    assert share == expected


def test_clears_at_keys_off_move_in_date() -> None:
    move_in = date(2026, 9, 1)
    now = datetime(2026, 6, 24, 12, 0, tzinfo=UTC)  # payment well before move-in
    clears = compute_clears_at(move_in=move_in, window_days=14, now=now)
    # 14 days after move-in, at UTC midnight — not keyed off the payment time.
    assert clears == datetime(2026, 9, 15, 0, 0, tzinfo=UTC)


def test_clears_at_falls_back_to_now_when_no_move_in() -> None:
    now = datetime(2026, 6, 24, 12, 0, tzinfo=UTC)
    clears = compute_clears_at(move_in=None, window_days=7, now=now)
    assert clears == datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
