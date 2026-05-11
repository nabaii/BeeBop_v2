"""Landlord onboarding checks for the initial test-phase flow."""

from __future__ import annotations

from types import SimpleNamespace

from app.auth.service import _is_onboarded
from app.models._enums import AccountType, UserRole


def _landlord(**overrides: object) -> SimpleNamespace:
    base = {
        "role": UserRole.LANDLORD,
        "first_name": "Ada",
        "last_name": "Okafor",
        "account_type": AccountType.INDIVIDUAL,
        "nin_verified": False,
        "cac_verified": False,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_landlord_onboarding_skips_identity_validation() -> None:
    assert _is_onboarded(_landlord())


def test_landlord_onboarding_still_requires_name() -> None:
    assert not _is_onboarded(_landlord(first_name=None))
    assert not _is_onboarded(_landlord(last_name=None))


def test_landlord_onboarding_still_requires_account_type() -> None:
    assert not _is_onboarded(_landlord(account_type=None))
