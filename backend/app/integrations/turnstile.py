"""Cloudflare Turnstile server-side verification.

The frontend renders the Turnstile widget and submits the resulting token with
the form. Here we verify that token against Cloudflare's siteverify endpoint
before any account is created or any email is queued, so unsophisticated bots
are stopped before they can consume the Resend quota.

Enforcement policy mirrors the email/S3 integrations:

* When ``TURNSTILE_SECRET_KEY`` is set, the token is required and verified.
* When it is unset in **development**, verification is skipped so local work is
  not blocked (the frontend also skips rendering the widget without a site key).
* When it is unset **outside development**, we fail *open* but log an error —
  failing closed would lock every user out of signup if the platform is
  deployed before the key is provisioned. Provision the key to actually enforce.
"""

from __future__ import annotations

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(token: str | None, *, remote_ip: str | None = None) -> bool:
    """Return True when the request may proceed.

    See the module docstring for the unset-key policy.
    """
    if not settings.turnstile_secret_key:
        if settings.environment != "development":
            logger.error(
                "TURNSTILE_SECRET_KEY is not set outside development — CAPTCHA "
                "verification is being skipped. Provision the key to enforce it."
            )
        return True

    if not token:
        return False

    payload = {"secret": settings.turnstile_secret_key, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(SITEVERIFY_URL, data=payload)
    except httpx.HTTPError:
        # Cloudflare unreachable. Fail open but loudly so this is visible in
        # logs/alerting rather than silently dropping legitimate signups.
        logger.exception("Turnstile siteverify request failed; allowing request.")
        return True

    if resp.status_code >= 400:
        logger.warning("Turnstile siteverify returned %s.", resp.status_code)
        return False

    data = resp.json()
    success = bool(data.get("success"))
    if not success:
        logger.info("Turnstile rejected token: %s", data.get("error-codes"))
    return success
