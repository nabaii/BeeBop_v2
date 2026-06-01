"""Landlord onboarding checks for the initial test-phase flow."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.auth.service import _is_onboarded, verify_otp_and_issue_tokens
from app.core.exceptions import ForbiddenError, ValidationError
from app.models._enums import AccountType, UserRole
from app.users import service as user_service


class _Db:
    flushed = False

    async def flush(self) -> None:
        self.flushed = True


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


def _user(**overrides: object) -> SimpleNamespace:
    base = {
        "id": uuid.uuid4(),
        "email": "ada@example.com",
        "password_hash": None,
        "role": UserRole.SEEKER,
        "first_name": "Ada",
        "last_name": "Okafor",
        "phone": None,
        "account_type": None,
        "nin_verified": False,
        "nin_document_url": None,
        "nin_document_uploaded_at": None,
        "nin_review_note": None,
        "cac_verified": False,
        "business_name": None,
        "cac_number": None,
        "profile_photo_url": None,
        "bio": None,
        "operating_area": None,
        "category_preferences": ["rent"],
        "institution": None,
        "academic_level": None,
        "gender": None,
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


@pytest.mark.asyncio
async def test_seeker_can_become_landlord_but_still_needs_account_type() -> None:
    db = _Db()
    user = _user()

    view = await user_service.become_landlord(user=user, db=db)  # type: ignore[arg-type]

    assert user.role == UserRole.LANDLORD
    assert view.role == UserRole.LANDLORD
    assert not view.onboarding_complete
    assert db.flushed


@pytest.mark.asyncio
async def test_internal_user_cannot_become_landlord() -> None:
    with pytest.raises(ForbiddenError) as exc:
        await user_service.become_landlord(
            user=_user(role=UserRole.ADMIN),  # type: ignore[arg-type]
            db=_Db(),  # type: ignore[arg-type]
        )

    assert exc.value.code == "cannot_become_landlord"


@pytest.mark.asyncio
async def test_public_otp_signup_rejects_admin_role() -> None:
    with pytest.raises(ValidationError) as exc:
        await verify_otp_and_issue_tokens(
            channel="email",
            identifier="admin@example.com",
            code="000000",
            role_if_new=UserRole.ADMIN,
            db=None,  # type: ignore[arg-type]
            redis=None,  # type: ignore[arg-type]
        )

    assert exc.value.code == "role_not_public_signup"
