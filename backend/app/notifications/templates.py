"""Notification templates per event type.

Each event maps to:
  • channels: which transports to dispatch on
  • render_email(payload) -> (subject, html, text) when EMAIL is in channels
  • render_whatsapp(payload) -> (template_name, parameters) when WHATSAPP is

The structure is deliberately small — adding a new event type means adding
one entry here, not changing the dispatcher.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from app.config import get_settings
from app.models._enums import NotificationChannel

settings = get_settings()


@dataclass(frozen=True)
class EmailContent:
    subject: str
    html: str
    text: str


@dataclass(frozen=True)
class WhatsAppContent:
    template: str
    parameters: list[str]


@dataclass(frozen=True)
class Template:
    channels: tuple[NotificationChannel, ...]
    render_email: Callable[[dict], EmailContent] | None = None
    render_whatsapp: Callable[[dict], WhatsAppContent] | None = None


def _badge_issued_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "your listing")
    badge = p.get("badge_type", "document")
    return EmailContent(
        subject=f"Beebop: {badge} verification issued for {title}",
        html=(
            f"<p>Good news — the {badge} badge has been issued for "
            f"<strong>{title}</strong>.</p><p>Seekers can now see this badge "
            f"on your listing page.</p>"
        ),
        text=(
            f"Good news — the {badge} badge has been issued for {title}. "
            f"Seekers can now see this badge on your listing."
        ),
    )


def _badge_issued_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="badge_issued",
        parameters=[p.get("listing_title", "your listing")],
    )


def _listing_queried_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "your listing")
    note = p.get("note", "")
    return EmailContent(
        subject=f"Beebop: action required on {title}",
        html=(
            f"<p>The Beebop team needs a small change to <strong>{title}</strong> "
            f"before approving the document badge.</p><p><em>{note}</em></p>"
            f"<p>Open the listing in your dashboard to make the change and "
            f"resubmit.</p>"
        ),
        text=(
            f"Action needed on {title}: {note}\n"
            f"Open the listing in your dashboard to update and resubmit."
        ),
    )


def _listing_rejected_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "your listing")
    note = p.get("note", "")
    return EmailContent(
        subject=f"Beebop: {title} could not be verified",
        html=(
            f"<p>We weren't able to verify <strong>{title}</strong>.</p>"
            f"<p><em>{note}</em></p><p>If you believe this was in error, please "
            f"reply to this email.</p>"
        ),
        text=f"We weren't able to verify {title}: {note}",
    )


def _new_offer_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="new_offer",
        parameters=[p.get("listing_title", "your listing"), str(p.get("offer_amount", "—"))],
    )


def _otp_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template=settings.whatsapp_otp_template_name,
        parameters=[str(p.get("code", ""))],
    )


# --- Sprint 8: offer + visit events ---------------------------------------


def _offer_accepted_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the listing")
    amount = p.get("offer_amount")
    visit = p.get("visit_required")
    visit_line = (
        "<p>A Beebop trusted agent will contact the seeker shortly to schedule a property visit.</p>"
        if visit
        else "<p>You can proceed straight to agreement signing.</p>"
    )
    return EmailContent(
        subject=f"Beebop: offer accepted on {title}",
        html=(
            f"<p>The offer on <strong>{title}</strong> has been accepted at "
            f"<strong>₦{int(amount):,}</strong>.</p>{visit_line}"
            if amount is not None
            else f"<p>The offer on <strong>{title}</strong> has been accepted.</p>{visit_line}"
        ),
        text=(
            f"Offer on {title} accepted at ₦{int(amount):,}." if amount is not None
            else f"Offer on {title} accepted."
        ),
    )


def _offer_accepted_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="offer_accepted",
        parameters=[p.get("listing_title", "your listing")],
    )


def _offer_countered_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="offer_countered",
        parameters=[
            p.get("listing_title", "the listing"),
            str(p.get("offer_amount", "—")),
        ],
    )


def _offer_expiring_whatsapp(p: dict) -> WhatsAppContent:
    hours_remaining = int(p.get("hours_remaining", 0))
    return WhatsAppContent(
        template="offer_expiring",
        parameters=[
            p.get("listing_title", "the listing"),
            str(hours_remaining),
        ],
    )


def _offer_expiring_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the listing")
    hours_remaining = int(p.get("hours_remaining", 0))
    return EmailContent(
        subject=f"Beebop: {hours_remaining} hours left on the offer for {title}",
        html=(
            f"<p>The offer on <strong>{title}</strong> expires in "
            f"<strong>{hours_remaining} hours</strong>. Respond from your dashboard.</p>"
        ),
        text=(
            f"Offer on {title} expires in {hours_remaining} hours. "
            f"Respond from your Beebop dashboard."
        ),
    )


def _offer_expired_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the listing")
    return EmailContent(
        subject=f"Beebop: the offer on {title} has expired",
        html=(
            f"<p>The 48-hour response window on the offer for <strong>{title}</strong> "
            f"has elapsed and the offer has expired. The listing is open to other seekers again.</p>"
        ),
        text=(
            f"The offer on {title} has expired (no response within 48 hours). "
            f"The listing is open to other seekers again."
        ),
    )


def _offer_expired_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="offer_expired",
        parameters=[p.get("listing_title", "the listing")],
    )


def _visit_assigned_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="visit_assigned",
        parameters=[p.get("listing_title", "a property")],
    )


# --- Sprint 9: visit lifecycle ---------------------------------------------


def _visit_confirmed_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the property")
    when = p.get("scheduled_at", "")
    agent = p.get("agent_first_name", "your Beebop agent")
    return EmailContent(
        subject=f"Beebop: visit confirmed for {title}",
        html=(
            f"<p>{agent} will meet you at <strong>{title}</strong> on "
            f"<strong>{when}</strong>.</p><p>Please arrive on time.</p>"
        ),
        text=f"{agent} will meet you at {title} on {when}.",
    )


def _visit_confirmed_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="visit_confirmed",
        parameters=[
            p.get("listing_title", "the property"),
            str(p.get("scheduled_at", "")),
        ],
    )


def _visit_cancelled_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the property")
    reason = p.get("reason", "")
    cancelled_by = p.get("cancelled_by", "the other party")
    return EmailContent(
        subject=f"Beebop: visit cancelled for {title}",
        html=(
            f"<p>The visit for <strong>{title}</strong> has been cancelled by "
            f"{cancelled_by}.</p><p><em>{reason}</em></p>"
        ),
        text=f"Visit cancelled for {title} by {cancelled_by}: {reason}",
    )


def _visit_cancelled_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="visit_cancelled",
        parameters=[p.get("listing_title", "the property")],
    )


def _visit_report_approved_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the property")
    return EmailContent(
        subject=f"Beebop: visit report approved — {title}",
        html=(
            f"<p>The post-visit report for <strong>{title}</strong> has been approved. "
            f"You can now finalise your offer from your dashboard.</p>"
        ),
        text=(
            f"Post-visit report approved for {title}. Finalise your offer in your dashboard."
        ),
    )


# --- Sprint 10: agreements + payments -------------------------------------


def _agreement_ready_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the property")
    kind = "tenancy agreement" if p.get("agreement_type") == "tenancy" else "sale memorandum"
    return EmailContent(
        subject=f"Beebop: your {kind} is ready to sign",
        html=(
            f"<p>The {kind} for <strong>{title}</strong> has been generated. "
            f"Open your dashboard to review and sign with an OTP.</p>"
        ),
        text=f"The {kind} for {title} is ready to sign in your dashboard.",
    )


def _agreement_ready_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="agreement_ready",
        parameters=[p.get("listing_title", "the property")],
    )


def _agreement_signed_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the property")
    return EmailContent(
        subject=f"Beebop: agreement signed for {title}",
        html=(
            f"<p>The agreement for <strong>{title}</strong> has been fully signed and "
            f"facilitation fees confirmed. The signed PDF is available in your dashboard.</p>"
        ),
        text=(
            f"Agreement for {title} fully signed. Download the PDF from your dashboard."
        ),
    )


def _sales_invoice_email(p: dict) -> EmailContent:
    amount = p.get("amount")
    due = p.get("due_at", "")
    invoice_url = p.get("invoice_url", "")
    return EmailContent(
        subject="Beebop: your sales facilitation invoice",
        html=(
            f"<p>Your sales facilitation invoice of "
            f"<strong>₦{int(float(amount or 0)):,}</strong> is due by <strong>{due}</strong>.</p>"
            f"<p>The signed agreement will be released once payment is confirmed.</p>"
            + (f'<p><a href="{invoice_url}">Pay invoice</a></p>' if invoice_url else "")
        ),
        text=(
            f"Sales facilitation invoice ₦{int(float(amount or 0)):,} due by {due}. "
            f"Signed agreement releases on payment."
        ),
    )


# --- Sprint 11: short-let bookings ----------------------------------------


def _booking_requested_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "your short-let")
    nights = p.get("nights", 1)
    amount = p.get("amount") or 0
    deadline = p.get("decision_deadline", "")
    return EmailContent(
        subject=f"Beebop: new booking request — {title}",
        html=(
            f"<p>You have a new booking request on <strong>{title}</strong> for "
            f"<strong>{nights} night(s)</strong>, total ₦{int(float(amount)):,}.</p>"
            f"<p>Respond by <strong>{deadline}</strong> from your dashboard.</p>"
        ),
        text=(
            f"New booking request on {title} ({nights} nights, ₦{int(float(amount)):,}). "
            f"Respond by {deadline}."
        ),
    )


def _booking_requested_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="booking_requested",
        parameters=[p.get("listing_title", "your short-let"), str(p.get("nights", "?"))],
    )


def _booking_confirmed_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the property")
    cin = p.get("check_in", "")
    cout = p.get("check_out", "")
    return EmailContent(
        subject=f"Beebop: booking confirmed — {title}",
        html=(
            f"<p>Your stay at <strong>{title}</strong> is confirmed: "
            f"<strong>{cin} → {cout}</strong>.</p>"
            f"<p>Access details will be sent on your check-in day.</p>"
        ),
        text=f"Booking confirmed for {title}: {cin} → {cout}.",
    )


def _booking_confirmed_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="booking_confirmed",
        parameters=[
            p.get("listing_title", "the property"),
            p.get("check_in", ""),
            p.get("check_out", ""),
        ],
    )


def _booking_declined_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the property")
    reason = p.get("reason", "")
    return EmailContent(
        subject=f"Beebop: booking request declined — {title}",
        html=(
            f"<p>The host declined your booking request for <strong>{title}</strong>.</p>"
            f"<p><em>{reason}</em></p>"
        ),
        text=f"Booking request for {title} declined: {reason}",
    )


def _booking_cancelled_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "the property")
    reason = p.get("reason", "")
    return EmailContent(
        subject=f"Beebop: booking cancelled — {title}",
        html=(
            f"<p>The booking for <strong>{title}</strong> has been cancelled.</p>"
            f"<p><em>{reason}</em></p>"
        ),
        text=f"Booking cancelled for {title}: {reason}",
    )


def _access_details_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "your stay")
    details = p.get("access_details", "")
    return EmailContent(
        subject=f"Beebop: access details for {title}",
        html=(
            f"<p>Welcome — here are the access details for <strong>{title}</strong>.</p>"
            f'<pre style="background:#f8fafc;padding:12px;border-radius:8px;'
            f'white-space:pre-wrap;font-family:inherit">{details}</pre>'
        ),
        text=f"Access details for {title}:\n\n{details}",
    )


def _access_details_whatsapp(p: dict) -> WhatsAppContent:
    return WhatsAppContent(
        template="access_details",
        parameters=[p.get("listing_title", "your stay")],
    )


def _host_payout_email(p: dict) -> EmailContent:
    amount = p.get("amount") or 0
    title = p.get("listing_title", "your short-let")
    return EmailContent(
        subject=f"Beebop: payout for {title}",
        html=(
            f"<p>Payout of <strong>₦{int(float(amount)):,}</strong> for "
            f"<strong>{title}</strong> has been initiated to your registered bank account.</p>"
        ),
        text=f"Payout ₦{int(float(amount)):,} for {title} initiated.",
    )


def _renewal_prompt_email(p: dict) -> EmailContent:
    title = p.get("listing_title", "your tenancy")
    days = p.get("days_remaining", 30)
    return EmailContent(
        subject=f"Beebop: {title} renewal — {days} days remaining",
        html=(
            f"<p>The tenancy on <strong>{title}</strong> ends in <strong>{days} days</strong>. "
            f"Renew from your dashboard — the simplified flow charges a 10,000 Naira renewal fee.</p>"
        ),
        text=(
            f"Tenancy on {title} ends in {days} days. Renew from your dashboard."
        ),
    )


def _referral_codeless_email(p: dict) -> EmailContent:
    code = p.get("code", "")
    return EmailContent(
        subject="Beebop: here's your referral code — start earning",
        html=(
            "<p>You didn't use a referral code on this booking — but here's yours.</p>"
            f"<p>Share <strong>{code}</strong> with friends and earn when they book "
            f"their accommodation on Beebop.</p>"
            "<p>Open the Referrals section of your account to copy your link and "
            "share it on WhatsApp.</p>"
        ),
        text=(
            f"You didn't use a code this time — here's yours: {code}. Share it and "
            f"earn when friends book on Beebop. Find your link in the Referrals "
            f"section of your account."
        ),
    )


def _landlord_nin_verified_email(p: dict) -> EmailContent:
    name = p.get("first_name") or "there"
    return EmailContent(
        subject="Beebop: your identity has been verified",
        html=(
            f"<p>Hi {name},</p><p>Your NIN has been verified. You can now "
            f"submit listings for review from your landlord dashboard.</p>"
        ),
        text=(
            f"Hi {name}, your NIN has been verified. You can now submit "
            f"listings for review from your landlord dashboard."
        ),
    )


def _landlord_nin_rejected_email(p: dict) -> EmailContent:
    name = p.get("first_name") or "there"
    note = p.get("note") or "Please re-upload a clearer photo of your ID."
    return EmailContent(
        subject="Beebop: identity verification needs another look",
        html=(
            f"<p>Hi {name},</p><p>We could not verify the ID image you "
            f"uploaded.</p><p><em>{note}</em></p><p>Re-upload a clearer image "
            f"from your landlord dashboard to try again.</p>"
        ),
        text=(
            f"Hi {name}, we could not verify the ID you uploaded: {note} "
            f"Re-upload a clearer image from your landlord dashboard."
        ),
    )


REGISTRY: dict[str, Template] = {
    # Referral programme — Path C codeless auto-enrolment prompt (§3.3).
    "referral.codeless_prompt": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_referral_codeless_email,
    ),
    "landlord.nin_verified": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_landlord_nin_verified_email,
    ),
    "landlord.nin_rejected": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_landlord_nin_rejected_email,
    ),
    "badge.issued": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.WHATSAPP, NotificationChannel.IN_APP),
        render_email=_badge_issued_email,
        render_whatsapp=_badge_issued_whatsapp,
    ),
    "listing.queried": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_listing_queried_email,
    ),
    "listing.rejected": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_listing_rejected_email,
    ),
    "offer.received": Template(
        channels=(NotificationChannel.WHATSAPP, NotificationChannel.IN_APP),
        render_whatsapp=_new_offer_whatsapp,
    ),
    # Sprint 8 — offer + visit lifecycle (per dev plan §12.2).
    "offer.accepted": Template(
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_offer_accepted_email,
        render_whatsapp=_offer_accepted_whatsapp,
    ),
    "offer.rejected": Template(
        # Lower urgency per dev plan §12.2 — in-app only.
        channels=(NotificationChannel.IN_APP,),
    ),
    "offer.countered": Template(
        channels=(NotificationChannel.WHATSAPP, NotificationChannel.IN_APP),
        render_whatsapp=_offer_countered_whatsapp,
    ),
    "offer.expiring": Template(
        # Hour 24 = in-app only (per §12.3); the sweeper switches templates
        # at hour 36 to the email+WhatsApp pair below.
        channels=(NotificationChannel.IN_APP,),
        render_email=_offer_expiring_email,
        render_whatsapp=_offer_expiring_whatsapp,
    ),
    "offer.expiring_urgent": Template(
        # Hour 36 — email + WhatsApp + in-app.
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_offer_expiring_email,
        render_whatsapp=_offer_expiring_whatsapp,
    ),
    "offer.expired": Template(
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_offer_expired_email,
        render_whatsapp=_offer_expired_whatsapp,
    ),
    "visit.assigned": Template(
        channels=(NotificationChannel.WHATSAPP, NotificationChannel.IN_APP),
        render_whatsapp=_visit_assigned_whatsapp,
    ),
    # Sprint 9 — visit lifecycle (per dev plan §12.2).
    "visit.confirmed": Template(
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_visit_confirmed_email,
        render_whatsapp=_visit_confirmed_whatsapp,
    ),
    "visit.cancelled": Template(
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_visit_cancelled_email,
        render_whatsapp=_visit_cancelled_whatsapp,
    ),
    "visit_report.approved": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_visit_report_approved_email,
    ),
    "visit_report.queried": Template(
        # Returns to the agent — in-app only is enough for an internal nudge.
        channels=(NotificationChannel.IN_APP,),
    ),
    # Sprint 10 — agreement + payment lifecycle.
    "agreement.ready_to_sign": Template(
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_agreement_ready_email,
        render_whatsapp=_agreement_ready_whatsapp,
    ),
    "agreement.signed": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_agreement_signed_email,
    ),
    "sales.invoice_issued": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_sales_invoice_email,
    ),
    "agreement.renewal_prompt": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_renewal_prompt_email,
    ),
    # Sprint 11 — short-let bookings.
    "booking.requested": Template(
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_booking_requested_email,
        render_whatsapp=_booking_requested_whatsapp,
    ),
    "booking.confirmed": Template(
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_booking_confirmed_email,
        render_whatsapp=_booking_confirmed_whatsapp,
    ),
    "booking.declined": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_booking_declined_email,
    ),
    "booking.cancelled": Template(
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_booking_cancelled_email,
    ),
    "access_details.released": Template(
        channels=(
            NotificationChannel.EMAIL,
            NotificationChannel.WHATSAPP,
            NotificationChannel.IN_APP,
        ),
        render_email=_access_details_email,
        render_whatsapp=_access_details_whatsapp,
    ),
    "host.payout": Template(
        channels=(NotificationChannel.EMAIL, NotificationChannel.IN_APP),
        render_email=_host_payout_email,
    ),
    # Sprint 1 OTP path uses this if it ever needs to dispatch via the queue
    # rather than synchronously inline.
    "otp.requested": Template(
        channels=(NotificationChannel.WHATSAPP,),
        render_whatsapp=_otp_whatsapp,
    ),
}
