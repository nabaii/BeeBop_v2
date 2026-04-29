"""Badge lifetime constants — guards against accidental change in §3.3 deltas."""

from __future__ import annotations

from app.verification.badges import DOC_BADGE_LIFETIME, PHYSICAL_BADGE_LIFETIME


def test_doc_badge_is_24_months() -> None:
    assert DOC_BADGE_LIFETIME.days == 365 * 2


def test_physical_badge_is_12_months() -> None:
    assert PHYSICAL_BADGE_LIFETIME.days == 365


def test_doc_badge_outlives_physical_badge() -> None:
    assert DOC_BADGE_LIFETIME > PHYSICAL_BADGE_LIFETIME
