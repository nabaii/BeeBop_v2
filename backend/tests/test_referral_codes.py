"""Referral code format + normalisation (§2.1). Pure — no DB."""

from __future__ import annotations

import re

from app.models.user import User
from app.referrals.codes import (
    _SUFFIX_ALPHABET,
    generate_code,
    normalize_code,
)

_AMBIGUOUS = set("01OIL")


def _user(**kwargs: object) -> User:
    # Build a bare ORM instance without touching the DB.
    u = User()
    u.email = "amina.bello@example.com"
    u.first_name = None
    u.last_name = None
    for k, v in kwargs.items():
        setattr(u, k, v)
    return u


def test_code_uses_name_prefix() -> None:
    code = generate_code(_user(first_name="Amina"))
    assert code.startswith("AMINA")


def test_prefix_capped_at_five_chars() -> None:
    code = generate_code(_user(first_name="Abdulrahman"))
    assert code.startswith("ABDUL")


def test_falls_back_to_email_local_part() -> None:
    code = generate_code(_user(first_name=None, last_name=None))
    assert code.startswith("AMINA")  # from amina.bello@...


def test_short_name_padded() -> None:
    code = generate_code(_user(first_name="Jo", last_name=None, email=""))
    # Padded with the BEE fallback so the prefix is at least 3 chars.
    assert re.match(r"^[A-Z]{3,5}", code)


def test_suffix_avoids_ambiguous_characters() -> None:
    for _ in range(200):
        code = generate_code(_user(first_name="Amina"))
        suffix = code[len("AMINA"):]
        assert len(suffix) == 4
        assert set(suffix).issubset(set(_SUFFIX_ALPHABET))
        assert not (set(suffix) & _AMBIGUOUS)


def test_codes_are_uppercase_alphanumeric() -> None:
    code = generate_code(_user(first_name="Amina"))
    assert code.isalnum()
    assert code == code.upper()


def test_normalize_uppercases_and_strips_whitespace() -> None:
    assert normalize_code("  amina7k2 ") == "AMINA7K2"
    assert normalize_code("Am In a7K2") == "AMINA7K2"


def test_normalize_handles_empty() -> None:
    assert normalize_code("") == ""
