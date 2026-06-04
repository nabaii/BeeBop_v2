"""Tenancy and sale agreements — pre-filled, OTP-signed, stored as PDFs in S3."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models._enums import AgreementStatus, AgreementType
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Agreement(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "agreements"

    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("listings.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offers.id", ondelete="RESTRICT"), index=True, nullable=False
    )

    type: Mapped[AgreementType] = mapped_column(
        Enum(AgreementType, name="agreement_type", values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    status: Mapped[AgreementStatus] = mapped_column(
        Enum(AgreementStatus, name="agreement_status", values_callable=lambda x: [e.value for e in x]),
        default=AgreementStatus.DRAFT,
        nullable=False,
        index=True,
    )

    # Signing — OTP events captured as structured JSON for audit.
    #   { party: "lister" | "seeker",
    #     channel: "email" | "whatsapp",
    #     signed_at: iso8601,
    #     ip_hash: sha256 }
    signatures: Mapped[list[dict]] = mapped_column(JSONB, default=list, nullable=False)

    # S3 storage — presigned URL regenerated per request.
    pdf_s3_key: Mapped[str | None] = mapped_column(String(500))

    # Term dates (rent/student) — sale agreements use start_date only.
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)

    # Pre-filled structured data used for both PDF rendering and audit.
    rendered_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Sales-only — Paystack invoice that withholds the signed PDF until paid.
    sales_invoice_reference: Mapped[str | None] = mapped_column(String(200))
    sales_invoice_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Fees charged — denormalised for the billing/dashboard views.
    landlord_fee_total: Mapped[float | None] = mapped_column(Numeric(14, 2))
    seeker_fee_total: Mapped[float | None] = mapped_column(Numeric(14, 2))
    seller_fee_total: Mapped[float | None] = mapped_column(Numeric(14, 2))
    facilitation_fee_total: Mapped[float | None] = mapped_column(Numeric(14, 2))
    landlord_payment_reference: Mapped[str | None] = mapped_column(String(200))
    seeker_payment_reference: Mapped[str | None] = mapped_column(String(200))
    paystack_reference: Mapped[str | None] = mapped_column(String(200))
    payment_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Renewal — set when an active rent/student agreement has been rolled into
    # a new agreement. Used by the renewal sweeper to avoid double-prompting.
    renewed_into_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agreements.id", ondelete="SET NULL")
    )
    renewal_prompted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
