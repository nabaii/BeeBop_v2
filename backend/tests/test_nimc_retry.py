"""NIMC verification retry behaviour."""

from __future__ import annotations

import pytest

from app.integrations.nimc import (
    NinVerificationResult,
    StubNimcClient,
    verify_nin_with_retry,
)


class ScriptedNimc:
    def __init__(self, results: list[NinVerificationResult]) -> None:
        self._results = list(results)
        self.calls = 0

    async def verify_nin(self, nin: str) -> NinVerificationResult:
        self.calls += 1
        return self._results.pop(0)


@pytest.mark.asyncio
async def test_stub_verifies_real_looking_nin() -> None:
    stub = StubNimcClient()
    res = await stub.verify_nin("12345678901")
    assert res.verified


@pytest.mark.asyncio
async def test_stub_timeout_nin_flags_admin_review() -> None:
    stub = StubNimcClient()
    res = await stub.verify_nin("1" * 11)
    assert not res.verified
    assert res.is_timeout


@pytest.mark.asyncio
async def test_retry_on_timeout_until_success() -> None:
    client = ScriptedNimc(
        [
            NinVerificationResult(verified=False, reason="nimc_timeout", is_timeout=True),
            NinVerificationResult(verified=True, full_name="Test"),
        ]
    )
    res = await verify_nin_with_retry("12345678901", client=client, max_attempts=2)
    assert res.verified
    assert client.calls == 2


@pytest.mark.asyncio
async def test_retry_exhausted_returns_admin_review_flag() -> None:
    client = ScriptedNimc(
        [
            NinVerificationResult(verified=False, reason="nimc_timeout", is_timeout=True),
            NinVerificationResult(verified=False, reason="nimc_timeout", is_timeout=True),
        ]
    )
    res = await verify_nin_with_retry("12345678901", client=client, max_attempts=2)
    assert not res.verified
    assert res.is_timeout


@pytest.mark.asyncio
async def test_no_retry_on_permanent_failure() -> None:
    client = ScriptedNimc(
        [NinVerificationResult(verified=False, reason="nin_not_found")]
    )
    res = await verify_nin_with_retry("12345678901", client=client, max_attempts=3)
    assert not res.verified
    assert client.calls == 1    # did not retry a definite failure
