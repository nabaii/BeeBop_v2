"""Notification template registry — render outputs for every event type."""

from __future__ import annotations

from app.models._enums import NotificationChannel
from app.notifications.templates import REGISTRY


def test_registry_includes_admin_doc_events() -> None:
    for event in ("badge.issued", "listing.queried", "listing.rejected"):
        assert event in REGISTRY, f"Missing template for {event}"


def test_badge_issued_renders_email_and_whatsapp() -> None:
    template = REGISTRY["badge.issued"]
    assert NotificationChannel.EMAIL in template.channels
    assert NotificationChannel.WHATSAPP in template.channels
    assert NotificationChannel.IN_APP in template.channels

    assert template.render_email is not None
    email = template.render_email({"listing_title": "Wuse 2 Flat", "badge_type": "document"})
    assert "Wuse 2 Flat" in email.subject
    assert "Wuse 2 Flat" in email.html
    assert "Wuse 2 Flat" in email.text

    assert template.render_whatsapp is not None
    wa = template.render_whatsapp({"listing_title": "Wuse 2 Flat"})
    assert wa.template == "badge_issued"
    assert wa.parameters == ["Wuse 2 Flat"]


def test_listing_queried_email_includes_note() -> None:
    template = REGISTRY["listing.queried"]
    assert template.render_email is not None
    email = template.render_email({"listing_title": "x", "note": "Please reupload C of O"})
    assert "Please reupload C of O" in email.html
    assert "Please reupload C of O" in email.text


def test_offer_received_skips_email() -> None:
    template = REGISTRY["offer.received"]
    assert NotificationChannel.EMAIL not in template.channels
    assert NotificationChannel.WHATSAPP in template.channels
    assert NotificationChannel.IN_APP in template.channels


def test_otp_template_uses_configured_template_name() -> None:
    template = REGISTRY["otp.requested"]
    assert template.render_whatsapp is not None
    wa = template.render_whatsapp({"code": "123456"})
    # Default whatsapp_otp_template_name is "beebop_otp" per Settings.
    assert wa.template == "beebop_otp"
    assert wa.parameters == ["123456"]
