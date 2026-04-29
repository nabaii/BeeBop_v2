"""Agreement lifecycle.

State machine:
  DRAFT  →  PARTIAL_SIGNED  →  PENDING_PAYMENT  →  SIGNED  →  ACTIVE
                                                           ↘  EXPIRED / TERMINATED

Generation is triggered by `accept_offer`. Both parties sign with an OTP.
Once both signatures are recorded, the agreement enters PENDING_PAYMENT and
the Paystack flow runs — facilitation-fee charges (rent/student) or a sales
invoice (sales). On payment confirmation the agreement becomes SIGNED, the
listing flips to LET_AGREED / SALE_AGREED, and the renewal sweeper begins
counting toward the 30-days-before-expiry prompt.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agreements.pdf import render_agreement_pdf
from app.agreements.schemas import (
    AgreementView,
    SignatureRecord,
)
from app.auth.otp_service import OtpService
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorisedError,
    ValidationError,
)
from app.integrations.paystack import get_paystack, make_reference
from app.integrations.s3_storage import DEFAULT_GET_EXPIRY, get_storage
from app.models._enums import (
    AgreementStatus,
    AgreementType,
    ListingCategory,
    ListingStatus,
    UserRole,
)
from app.models.agreement import Agreement
from app.models.listing import Listing
from app.models.offer import Offer
from app.models.user import User
from app.notifications.dispatch import dispatch_notification
from app.payments.fees import rent_fee, sales_fee, student_accommodation_fee

SALES_INVOICE_WINDOW_HOURS = 48
RENT_TERM_DEFAULT_YEARS = 1

# Categories that flow through the agreement engine. Short-let runs through
# the Booking model instead.
_AGREEMENT_CATEGORIES = (
    ListingCategory.RENT,
    ListingCategory.OFF_CAMPUS,
    ListingCategory.SALES,
)


def _full_name(user: User) -> str:
    parts = [p for p in (user.first_name, user.last_name) if p]
    if parts:
        return " ".join(parts)
    return user.business_name or user.email


# ---------------------------------------------------------------------------
# Generation (called from offer.accept)
# ---------------------------------------------------------------------------


async def generate_agreement_for_offer(
    *, offer: Offer, db: AsyncSession
) -> Agreement | None:
    """Idempotent. Returns None if the listing category isn't agreement-managed
    (i.e. short-let)."""

    listing = await db.get(Listing, offer.listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if listing.category not in _AGREEMENT_CATEGORIES:
        return None

    existing = (
        await db.execute(select(Agreement).where(Agreement.offer_id == offer.id))
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    landlord = await db.get(User, listing.owner_id)
    seeker = await db.get(User, offer.seeker_id)
    if landlord is None or seeker is None:
        raise NotFoundError("Agreement parties missing.", code="parties_missing")

    agreement_type = (
        AgreementType.SALE
        if listing.category == ListingCategory.SALES
        else AgreementType.TENANCY
    )

    start = offer.move_in_date or date.today()
    end: date | None = None
    if agreement_type == AgreementType.TENANCY:
        end = date(start.year + RENT_TERM_DEFAULT_YEARS, start.month, start.day)

    rendered = {
        "reference": make_reference("agr"),
        "parties": {
            "landlord": {"name": _full_name(landlord), "email": landlord.email},
            "seeker": {"name": _full_name(seeker), "email": seeker.email},
        },
        "listing": {
            "title": listing.title,
            "address_line": listing.address_line,
            "district": listing.district,
        },
        "price": float(offer.price),
        "start_date": start.isoformat(),
        "end_date": end.isoformat() if end else None,
        "conditions": offer.conditions,
        "signatures": [],
    }

    agreement = Agreement(
        listing_id=listing.id,
        offer_id=offer.id,
        type=agreement_type,
        status=AgreementStatus.DRAFT,
        signatures=[],
        rendered_data=rendered,
        start_date=start,
        end_date=end,
    )
    db.add(agreement)
    await db.flush()

    # Render + persist a draft PDF immediately so both parties can preview.
    await _render_and_store_pdf(agreement=agreement, db=db)

    # Notify both parties that the agreement is ready to sign.
    for uid in (landlord.id, seeker.id):
        await dispatch_notification(
            user_id=uid,
            event_type="agreement.ready_to_sign",
            payload={
                "agreement_id": str(agreement.id),
                "listing_id": str(listing.id),
                "listing_title": listing.title or "the property",
                "agreement_type": agreement_type.value,
            },
            db=db,
        )

    return agreement


async def _render_and_store_pdf(*, agreement: Agreement, db: AsyncSession) -> None:
    pdf_bytes = render_agreement_pdf(
        agreement_type=agreement.type, data=agreement.rendered_data or {}
    )
    storage = get_storage()
    key = f"agreements/{agreement.id}/agreement.pdf"
    # Upload via the same presigned-PUT path used for inspector evidence —
    # but here we go through the live S3 client (or the stub which short-circuits).
    presigned = storage.presigned_put(key=key, content_type="application/pdf")
    if presigned.url.startswith("https://stub.local/"):
        # Dev stub — skip actual upload. Key is still recorded for downstream
        # presigned-GET wiring.
        agreement.pdf_s3_key = presigned.key
        await db.flush()
        return

    import httpx

    async with httpx.AsyncClient(timeout=30.0) as c:
        resp = await c.put(presigned.url, content=pdf_bytes, headers=presigned.headers)
    if resp.status_code >= 400:
        from app.core.exceptions import ExternalServiceError

        raise ExternalServiceError(
            f"Could not upload agreement PDF ({resp.status_code}).",
            code="agreement_pdf_upload_failed",
        )
    agreement.pdf_s3_key = presigned.key
    await db.flush()


# ---------------------------------------------------------------------------
# Signing
# ---------------------------------------------------------------------------


def _party_for(*, agreement: Agreement, listing: Listing, user: User) -> str:
    if str(user.id) == str(listing.owner_id):
        return "landlord"
    offer_seeker = agreement.rendered_data.get("parties", {}).get("seeker", {}).get("email")
    if offer_seeker and offer_seeker == user.email:
        return "seeker"
    raise ForbiddenError("You are not a party to this agreement.", code="not_a_party")


async def request_signature_otp(
    *, user: User, agreement_id: uuid.UUID, channel: str, db: AsyncSession, redis
) -> None:
    agreement = await db.get(Agreement, agreement_id)
    if agreement is None:
        raise NotFoundError("Agreement not found.", code="agreement_not_found")
    listing = await db.get(Listing, agreement.listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    _party_for(agreement=agreement, listing=listing, user=user)

    identifier = user.email if channel == "email" else user.phone
    if not identifier:
        raise ValidationError(
            f"No {channel} identifier on your account.",
            code="missing_identifier",
        )
    otp = OtpService(redis)
    await otp.request(channel=channel, identifier=identifier)


async def submit_signature(
    *,
    user: User,
    agreement_id: uuid.UUID,
    channel: str,
    code: str,
    db: AsyncSession,
    redis,
) -> Agreement:
    agreement = await db.get(Agreement, agreement_id)
    if agreement is None:
        raise NotFoundError("Agreement not found.", code="agreement_not_found")
    if agreement.status not in (AgreementStatus.DRAFT, AgreementStatus.PARTIAL_SIGNED):
        raise ConflictError(
            "Agreement is no longer accepting signatures.",
            code="agreement_locked",
        )
    listing = await db.get(Listing, agreement.listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    party = _party_for(agreement=agreement, listing=listing, user=user)

    identifier = user.email if channel == "email" else user.phone
    if not identifier:
        raise UnauthorisedError("No identifier for that channel.", code="no_identifier")

    otp = OtpService(redis)
    await otp.verify(channel=channel, identifier=identifier, code=code)

    if any(s.get("party") == party for s in agreement.signatures or []):
        raise ConflictError("You have already signed.", code="duplicate_signature")

    sig = {
        "party": party,
        "channel": channel,
        "signed_at": datetime.now(timezone.utc).isoformat(),
    }
    agreement.signatures = [*list(agreement.signatures or []), sig]

    rendered = dict(agreement.rendered_data or {})
    rendered["signatures"] = list(agreement.signatures)
    agreement.rendered_data = rendered

    if len(agreement.signatures) >= 2:
        agreement.status = AgreementStatus.PENDING_PAYMENT
        await _re_render_pdf(agreement=agreement, db=db)
        await _initiate_payments(agreement=agreement, db=db)
    else:
        agreement.status = AgreementStatus.PARTIAL_SIGNED
        await _re_render_pdf(agreement=agreement, db=db)

    await db.flush()
    return agreement


async def _re_render_pdf(*, agreement: Agreement, db: AsyncSession) -> None:
    await _render_and_store_pdf(agreement=agreement, db=db)


# ---------------------------------------------------------------------------
# Payments + finalisation
# ---------------------------------------------------------------------------


async def _initiate_payments(*, agreement: Agreement, db: AsyncSession) -> None:
    listing = await db.get(Listing, agreement.listing_id)
    if listing is None:
        return
    landlord = await db.get(User, listing.owner_id)
    seeker_email = (
        agreement.rendered_data.get("parties", {}).get("seeker", {}).get("email")
    )
    if landlord is None or not seeker_email:
        return

    paystack = get_paystack()
    price = Decimal(str(agreement.rendered_data.get("price", "0")))

    if listing.category == ListingCategory.RENT:
        fees = rent_fee(float(price))
        landlord_total = (
            Decimal(str(fees.landlord_flat)) + Decimal(str(fees.landlord_pct_component))
        )
        seeker_total = (
            Decimal(str(fees.seeker_flat)) + Decimal(str(fees.seeker_pct_component))
        )
        agreement.landlord_fee_total = float(landlord_total)
        agreement.seeker_fee_total = float(seeker_total)
        agreement.facilitation_fee_total = float(landlord_total + seeker_total)

        l_ref = make_reference("rent_landlord")
        s_ref = make_reference("rent_seeker")
        await paystack.initialise_payment(
            amount_naira=float(landlord_total),
            email=landlord.email,
            reference=l_ref,
            metadata={"agreement_id": str(agreement.id), "party": "landlord"},
        )
        await paystack.initialise_payment(
            amount_naira=float(seeker_total),
            email=seeker_email,
            reference=s_ref,
            metadata={"agreement_id": str(agreement.id), "party": "seeker"},
        )
        agreement.landlord_payment_reference = l_ref
        agreement.seeker_payment_reference = s_ref

    elif listing.category == ListingCategory.OFF_CAMPUS:
        fees = student_accommodation_fee(float(price))
        agreement.landlord_fee_total = float(fees.owner_fee)
        agreement.seeker_fee_total = float(fees.seeker_fee)
        agreement.facilitation_fee_total = float(fees.owner_fee + fees.seeker_fee)
        l_ref = make_reference("stud_owner")
        s_ref = make_reference("stud_seeker")
        await paystack.initialise_payment(
            amount_naira=fees.owner_fee,
            email=landlord.email,
            reference=l_ref,
            metadata={"agreement_id": str(agreement.id), "party": "owner"},
        )
        await paystack.initialise_payment(
            amount_naira=fees.seeker_fee,
            email=seeker_email,
            reference=s_ref,
            metadata={"agreement_id": str(agreement.id), "party": "seeker"},
        )
        agreement.landlord_payment_reference = l_ref
        agreement.seeker_payment_reference = s_ref

    elif listing.category == ListingCategory.SALES:
        fees = sales_fee(float(price))
        agreement.seller_fee_total = float(fees.seller_fee)
        agreement.facilitation_fee_total = float(fees.seller_fee)
        ref = make_reference("sale_invoice")
        invoice = await paystack.create_invoice(
            amount_naira=fees.seller_fee,
            email=landlord.email,
            reference=ref,
            due_in_hours=SALES_INVOICE_WINDOW_HOURS,
            description=f"BeeBop sales facilitation fee for agreement {agreement.id}",
            metadata={"agreement_id": str(agreement.id)},
        )
        agreement.sales_invoice_reference = invoice.reference
        agreement.sales_invoice_due_at = (
            datetime.fromisoformat(invoice.due_date)
            if isinstance(invoice.due_date, str)
            else None
        )
        await dispatch_notification(
            user_id=landlord.id,
            event_type="sales.invoice_issued",
            payload={
                "agreement_id": str(agreement.id),
                "amount": float(fees.seller_fee),
                "due_at": invoice.due_date,
                "invoice_url": invoice.invoice_url,
            },
            db=db,
        )


async def confirm_payment(
    *, agreement_id: uuid.UUID, reference: str, db: AsyncSession
) -> Agreement | None:
    """Called from the Paystack webhook + admin manual reconcile.

    Marks the corresponding fee leg paid. When all required legs are paid,
    flips the agreement to SIGNED and the listing to LET_AGREED / SALE_AGREED.
    """
    agreement = await db.get(Agreement, agreement_id)
    if agreement is None:
        return None
    if agreement.status not in (
        AgreementStatus.PENDING_PAYMENT,
        AgreementStatus.SIGNED,
        AgreementStatus.ACTIVE,
    ):
        return agreement

    # Mark the leg paid by reference. The model carries up to 3 reference
    # columns; sales has only `sales_invoice_reference`.
    matched = False
    if reference == agreement.landlord_payment_reference:
        agreement.paystack_reference = reference
        matched = True
    if reference == agreement.seeker_payment_reference:
        matched = True
    if reference == agreement.sales_invoice_reference:
        agreement.paystack_reference = reference
        matched = True
    if not matched:
        return agreement

    listing = await db.get(Listing, agreement.listing_id)

    # Determine "fully paid" per category.
    fully_paid = False
    if listing is not None:
        if listing.category == ListingCategory.SALES:
            fully_paid = reference == agreement.sales_invoice_reference
        else:
            # Rent / student — both legs required.
            paystack = get_paystack()
            results = await _verify_all_legs(agreement=agreement, paystack=paystack)
            fully_paid = all(r.get("status") == "success" for r in results)

    if fully_paid and listing is not None:
        agreement.status = AgreementStatus.SIGNED
        agreement.payment_confirmed_at = datetime.now(timezone.utc)
        listing.status = (
            ListingStatus.SALE_AGREED
            if listing.category == ListingCategory.SALES
            else ListingStatus.LET_AGREED
        )
        for uid in (
            listing.owner_id,
            uuid.UUID(agreement.rendered_data.get("parties", {}).get("seeker_id"))
            if agreement.rendered_data.get("parties", {}).get("seeker_id")
            else (await _seeker_id_from_offer(agreement=agreement, db=db)),
        ):
            if uid is None:
                continue
            await dispatch_notification(
                user_id=uid,
                event_type="agreement.signed",
                payload={
                    "agreement_id": str(agreement.id),
                    "listing_id": str(listing.id),
                    "listing_title": listing.title or "the property",
                },
                db=db,
            )

    await db.flush()
    return agreement


async def _seeker_id_from_offer(
    *, agreement: Agreement, db: AsyncSession
) -> uuid.UUID | None:
    offer = await db.get(Offer, agreement.offer_id)
    return offer.seeker_id if offer else None


async def _verify_all_legs(*, agreement: Agreement, paystack) -> list[dict]:  # type: ignore[no-untyped-def]
    refs = [
        r
        for r in (
            agreement.landlord_payment_reference,
            agreement.seeker_payment_reference,
        )
        if r
    ]
    return [await paystack.verify(r) for r in refs]


# ---------------------------------------------------------------------------
# Read views
# ---------------------------------------------------------------------------


def _to_view(
    *, agreement: Agreement, listing: Listing, landlord: User, seeker: User
) -> AgreementView:
    return AgreementView(
        id=str(agreement.id),
        listing_id=str(listing.id),
        listing_title=listing.title or "Untitled",
        listing_category=listing.category,
        type=agreement.type,
        status=agreement.status,
        landlord_id=str(landlord.id),
        landlord_name=_full_name(landlord),
        seeker_id=str(seeker.id),
        seeker_name=_full_name(seeker),
        price=float(agreement.rendered_data.get("price", 0)),
        start_date=agreement.start_date,
        end_date=agreement.end_date,
        conditions=agreement.rendered_data.get("conditions"),
        signatures=[
            SignatureRecord(**s) for s in (agreement.signatures or [])
        ],
        pdf_available=agreement.pdf_s3_key is not None,
        sales_invoice_due_at=agreement.sales_invoice_due_at,
        landlord_fee_total=(
            float(agreement.landlord_fee_total)
            if agreement.landlord_fee_total is not None
            else None
        ),
        seeker_fee_total=(
            float(agreement.seeker_fee_total)
            if agreement.seeker_fee_total is not None
            else None
        ),
        seller_fee_total=(
            float(agreement.seller_fee_total)
            if agreement.seller_fee_total is not None
            else None
        ),
        payment_confirmed_at=agreement.payment_confirmed_at,
    )


async def list_my_agreements(
    *, user: User, db: AsyncSession
) -> list[AgreementView]:
    if user.role == UserRole.SEEKER:
        stmt = (
            select(Agreement, Listing, Offer)
            .join(Listing, Listing.id == Agreement.listing_id)
            .join(Offer, Offer.id == Agreement.offer_id)
            .where(Offer.seeker_id == user.id)
            .order_by(Agreement.created_at.desc())
        )
    elif user.role in (UserRole.LANDLORD, UserRole.AGENT):
        stmt = (
            select(Agreement, Listing, Offer)
            .join(Listing, Listing.id == Agreement.listing_id)
            .join(Offer, Offer.id == Agreement.offer_id)
            .where(Listing.owner_id == user.id)
            .order_by(Agreement.created_at.desc())
        )
    else:
        raise ForbiddenError("This view is for seekers and landlords.", code="bad_role")

    rows = (await db.execute(stmt)).all()
    out: list[AgreementView] = []
    for agreement, listing, offer in rows:
        landlord = await db.get(User, listing.owner_id)
        seeker = await db.get(User, offer.seeker_id)
        if landlord and seeker:
            out.append(
                _to_view(
                    agreement=agreement, listing=listing, landlord=landlord, seeker=seeker
                )
            )
    return out


async def agreement_detail(
    *, user: User, agreement_id: uuid.UUID, db: AsyncSession
) -> AgreementView:
    agreement = await db.get(Agreement, agreement_id)
    if agreement is None:
        raise NotFoundError("Agreement not found.", code="agreement_not_found")
    listing = await db.get(Listing, agreement.listing_id)
    offer = await db.get(Offer, agreement.offer_id)
    if listing is None or offer is None:
        raise NotFoundError("Agreement context missing.", code="agreement_context_missing")
    if str(user.id) not in (str(listing.owner_id), str(offer.seeker_id)) and user.role != UserRole.ADMIN:
        raise ForbiddenError("Not your agreement.", code="not_your_agreement")
    landlord = await db.get(User, listing.owner_id)
    seeker = await db.get(User, offer.seeker_id)
    return _to_view(
        agreement=agreement, listing=listing, landlord=landlord, seeker=seeker
    )


async def presigned_download(
    *, user: User, agreement_id: uuid.UUID, db: AsyncSession
) -> tuple[str, int]:
    agreement = await db.get(Agreement, agreement_id)
    if agreement is None:
        raise NotFoundError("Agreement not found.", code="agreement_not_found")
    listing = await db.get(Listing, agreement.listing_id)
    offer = await db.get(Offer, agreement.offer_id)
    if listing is None or offer is None:
        raise NotFoundError("Context missing.", code="agreement_context_missing")
    if str(user.id) not in (str(listing.owner_id), str(offer.seeker_id)) and user.role != UserRole.ADMIN:
        raise ForbiddenError("Not your agreement.", code="not_your_agreement")
    if agreement.pdf_s3_key is None:
        raise ConflictError("PDF not yet rendered.", code="pdf_not_ready")
    # Sales agreements withhold the signed PDF until invoice paid (dev plan §4.4).
    if (
        listing.category == ListingCategory.SALES
        and agreement.status in (AgreementStatus.PENDING_PAYMENT,)
    ):
        raise ForbiddenError(
            "Signed agreement released after invoice payment is confirmed.",
            code="sales_pdf_withheld",
        )
    storage = get_storage()
    return (
        storage.presigned_get(key=agreement.pdf_s3_key, expiry_seconds=DEFAULT_GET_EXPIRY),
        DEFAULT_GET_EXPIRY,
    )


# ---------------------------------------------------------------------------
# Renewal sweeper helpers
# ---------------------------------------------------------------------------


async def find_agreements_due_for_renewal_prompt(
    *, db: AsyncSession, today: date | None = None
) -> list[Agreement]:
    """Active rent/student agreements ending within 30 days that haven't been
    prompted yet. Returned ordered by end date so the sweeper handles the
    most urgent ones first."""
    today = today or date.today()
    horizon = today + timedelta(days=30)
    stmt = (
        select(Agreement)
        .where(
            Agreement.status == AgreementStatus.ACTIVE,
            Agreement.type == AgreementType.TENANCY,
            Agreement.end_date.is_not(None),
            Agreement.end_date <= horizon,
            Agreement.renewal_prompted_at.is_(None),
            Agreement.renewed_into_id.is_(None),
        )
        .order_by(Agreement.end_date.asc())
    )
    return list((await db.execute(stmt)).scalars().all())
