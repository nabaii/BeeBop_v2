"""Email canonicalisation and disposable-domain rejection.

The signup/OTP abuse seen in the Resend logs relies on two tricks that a naive
"lowercase the string" check does not catch:

* **Gmail dot/plus variants.** Gmail ignores dots in the local part and treats
  everything after a ``+`` as a tag, so ``j.o.h.n+a@gmail.com`` and
  ``john@gmail.com`` reach the same inbox. Collapsing them to one canonical
  form means per-identifier rate limits and the one-account-per-address rule
  actually bind.
* **Disposable / throwaway domains.** Bulk signups from short-lived domains
  that bounce immediately. We reject a maintained blocklist outright.

``canonicalize_email`` is intentionally conservative: for non-Gmail providers it
only lowercases and trims, because dot/plus semantics are provider-specific and
stripping them elsewhere would merge distinct real accounts.
"""

from __future__ import annotations

# Providers known to ignore dots in the local part and to use "+tag" aliasing,
# all funnelling to a single canonical mailbox.
_GMAIL_DOMAINS = frozenset({"gmail.com", "googlemail.com"})

# Providers that support "+tag" aliasing but DO honour dots. For these we only
# strip the plus-tag, never the dots.
_PLUS_ALIAS_DOMAINS = frozenset(
    {
        "outlook.com",
        "hotmail.com",
        "live.com",
        "icloud.com",
        "me.com",
        "fastmail.com",
        "proton.me",
        "protonmail.com",
        "yahoo.com",
    }
)

# Common disposable / throwaway email domains. This is a deliberately small,
# high-signal seed list; the abuse signal in the logs is dominated by a handful
# of these. Treat as a starting point and grow it (or swap in a maintained
# package such as ``disposable-email-domains``) as new patterns appear.
_DISPOSABLE_DOMAINS = frozenset(
    {
        "mailinator.com",
        "guerrillamail.com",
        "guerrillamail.info",
        "grr.la",
        "sharklasers.com",
        "10minutemail.com",
        "10minutemail.net",
        "temp-mail.org",
        "tempmail.com",
        "tempmailo.com",
        "throwawaymail.com",
        "yopmail.com",
        "getnada.com",
        "trashmail.com",
        "maildrop.cc",
        "dispostable.com",
        "fakeinbox.com",
        "mohmal.com",
        "moakt.com",
        "emailondeck.com",
        "mailnesia.com",
        "spam4.me",
        "tmpmail.org",
        "tmpmail.net",
        "mailcatch.com",
        "inboxbear.com",
        "tempr.email",
        "discard.email",
    }
)


def canonicalize_email(email: str) -> str:
    """Return the canonical form of an email address.

    Always lowercases and trims. For Gmail-family domains, strips dots and any
    ``+tag`` from the local part and normalises ``googlemail.com`` to
    ``gmail.com``. For other plus-alias providers, strips only the ``+tag``.
    Returns the lowercased input unchanged when it is not a well-formed address.
    """
    email = email.strip().lower()
    local, sep, domain = email.partition("@")
    if not sep or not local or not domain:
        return email

    # Strip the "+tag" suffix for any provider that supports it.
    if domain in _GMAIL_DOMAINS or domain in _PLUS_ALIAS_DOMAINS:
        local = local.split("+", 1)[0]

    if domain in _GMAIL_DOMAINS:
        local = local.replace(".", "")
        domain = "gmail.com"

    return f"{local}@{domain}"


def is_disposable_email(email: str) -> bool:
    """True when the address is on the disposable-domain blocklist."""
    _, sep, domain = email.strip().lower().partition("@")
    return bool(sep) and domain in _DISPOSABLE_DOMAINS
