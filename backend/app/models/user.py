"""User model — covers all six roles via a discriminator column.

Seeker/landlord/agent live in the public platform. Inspector/trusted_agent/admin
are internal staff accounts created only by admins (no self-registration).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models._enums import AccountType, Gender, UserRole
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role", values_callable=lambda x: [e.value for e in x]), nullable=False)

    # Identity (all roles)
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(32))

    # Landlord / agent onboarding
    account_type: Mapped[AccountType | None] = mapped_column(Enum(AccountType, name="account_type", values_callable=lambda x: [e.value for e in x]))
    nin: Mapped[str | None] = mapped_column(String(11))             # not retained, only verified flag kept
    nin_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Manual NIN review (MVP). Landlord uploads an ID image; admin reviews and
    # flips `nin_verified`. The Cloudinary URL and uploaded_at are cleared on
    # rejection so the landlord knows to resubmit. The note is the admin's
    # rejection reason and is shown back on the landlord card.
    nin_document_url: Mapped[str | None] = mapped_column(String(500))
    nin_document_uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    nin_review_note: Mapped[str | None] = mapped_column(Text)
    bvn_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)

    # Agency-specific
    business_name: Mapped[str | None] = mapped_column(String(255))
    cac_number: Mapped[str | None] = mapped_column(String(32))
    cac_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    agency_logo_url: Mapped[str | None] = mapped_column(String(500))

    # Profile
    profile_photo_url: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str | None] = mapped_column(String(1000))
    operating_area: Mapped[str | None] = mapped_column(String(255))

    # Seeker preferences — multi-select of ListingCategory values. JSONB keeps
    # the column simple on Neon and avoids a separate join table for what is
    # essentially a filter hint.
    category_preferences: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    institution: Mapped[str | None] = mapped_column(String(255))      # student seekers
    academic_level: Mapped[str | None] = mapped_column(String(64))
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender, name="gender", values_callable=lambda x: [e.value for e in x]))

    # Optional self-reported seeker profile (collected in onboarding, skippable).
    # Kept distinct from `date_of_birth` (the NIMC-verified value) — this is an
    # analytics/segmentation hint, never a verified fact. All nullable so a
    # seeker can skip the step entirely.
    age_band: Mapped[str | None] = mapped_column(String(16))
    occupation: Mapped[str | None] = mapped_column(String(100))
    budget_min: Mapped[int | None] = mapped_column(Integer)
    budget_max: Mapped[int | None] = mapped_column(Integer)
    preferred_area: Mapped[str | None] = mapped_column(String(255))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Inspector / trusted-agent activation. Both must acknowledge the conduct
    # standards before they can access their portal (dev plan §8.1, §13.3).
    # Set to the activation timestamp; null means not-yet-activated.
    conduct_acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Referral — the code captured from a share link before/at registration
    # (Path A, §3.1). Advisory only: it pre-fills the checkout field and is the
    # default attribution if the user later books. The binding money record is
    # `referral_attributions`, written at checkout — not this column.
    referred_by_code: Mapped[str | None] = mapped_column(String(32))

    # Relationships
    listings: Mapped[list["Listing"]] = relationship(
        back_populates="owner",
        foreign_keys="Listing.owner_id",
    )


# Forward-ref imports for relationship typing (deferred to avoid circular imports).
from app.models.listing import Listing  # noqa: E402
