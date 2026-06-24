"""Enumerations used across ORM models. Stored as Postgres native enums."""

from enum import StrEnum


class UserRole(StrEnum):
    SEEKER = "seeker"
    LANDLORD = "landlord"
    AGENT = "agent"             # Lister view — same permissions as landlord
    INSPECTOR = "inspector"
    TRUSTED_AGENT = "trusted_agent"
    ADMIN = "admin"


class AccountType(StrEnum):
    INDIVIDUAL = "individual"
    AGENCY = "agency"


class ListingCategory(StrEnum):
    OFF_CAMPUS = "off_campus"
    SHORT_LET = "short_let"
    RENT = "rent"
    SALES = "sales"


class ListingStatus(StrEnum):
    DRAFT = "draft"
    UNDER_DOC_REVIEW = "under_doc_review"
    LIVE_UNVERIFIED = "live_unverified"     # doc rejected / skipped (student only)
    DOC_VERIFIED = "doc_verified"
    FULLY_VERIFIED = "fully_verified"
    LET_AGREED = "let_agreed"
    SALE_AGREED = "sale_agreed"
    SUSPENDED = "suspended"
    DELISTED = "delisted"


class BadgeType(StrEnum):
    DOCUMENT = "document"
    PHYSICAL = "physical"


class BadgeStatus(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


class OfferStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    COUNTERED = "countered"
    EXPIRED = "expired"
    WITHDRAWN = "withdrawn"


class AgreementStatus(StrEnum):
    DRAFT = "draft"
    PARTIAL_SIGNED = "partial_signed"
    PENDING_PAYMENT = "pending_payment"
    SIGNED = "signed"
    ACTIVE = "active"
    EXPIRED = "expired"
    TERMINATED = "terminated"


class AgreementType(StrEnum):
    TENANCY = "tenancy"     # rent + student
    SALE = "sale"


class Gender(StrEnum):
    FEMALE = "female"
    MALE = "male"
    ANY = "any"             # self-contain units — no gender tag


class UnitKind(StrEnum):
    SINGLE_ROOM = "single_room"
    TWO_IN_A_ROOM = "two_in_a_room"
    THREE_IN_A_ROOM = "three_in_a_room"
    SELF_CONTAIN = "self_contain"
    CUSTOM = "custom"


class BedStatus(StrEnum):
    OCCUPIED = "occupied"
    AVAILABLE = "available"
    VACATING = "vacating"


class BookingStatus(StrEnum):
    REQUESTED = "requested"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class VisitStatus(StrEnum):
    PENDING_ASSIGNMENT = "pending_assignment"   # admin queue
    AGENT_ASSIGNED = "agent_assigned"            # awaiting agent confirmation
    SCHEDULED = "scheduled"                      # agent confirmed; visit upcoming
    REPORT_PENDING = "report_pending"            # visit took place; agent's post-visit report awaiting admin review
    COMPLETED = "completed"                      # admin approved the post-visit report; seeker can finalise the offer
    CANCELLED = "cancelled"
    REPORT_QUERIED = "report_queried"            # admin returned the report to the agent with a note


class VisitReportOutcome(StrEnum):
    APPROVED = "approved"
    QUERIED = "queried"
    FLAGGED = "flagged"


class VisitCancelledBy(StrEnum):
    SEEKER = "seeker"
    LANDLORD = "landlord"
    AGENT = "agent"
    ADMIN = "admin"


class InspectionReportStatus(StrEnum):
    ASSIGNED = "assigned"           # admin created, inspector hasn't started
    IN_PROGRESS = "in_progress"     # inspector is filling the report (drafts may sync repeatedly)
    PENDING = "pending"             # inspector submitted; awaiting admin review
    APPROVED = "approved"
    QUERIED = "queried"             # admin sent back to inspector with a note
    REJECTED = "rejected"


class NotificationChannel(StrEnum):
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    IN_APP = "in_app"


class NotificationStatus(StrEnum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"


# --- Referral programme (spec: Beebop Referral System v1.0) -------------------


class ReferralTier(StrEnum):
    STANDARD = "standard"
    PARTNER = "partner"             # campus partner — elevated, tiered rate


class ReferralCodeStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"         # admin-suspended on confirmed abuse


class ReferralEarningType(StrEnum):
    REFERRER_EARNING = "referrer_earning"   # paid to the code owner
    PAYER_CASHBACK = "payer_cashback"       # paid to the booking student


class ReferralEarningState(StrEnum):
    PENDING = "pending"             # in the clearing window
    CLEARED = "cleared"             # cleared the window — withdrawable
    PAID = "paid"                   # disbursed via Paystack — terminal
    REVERSED = "reversed"           # transaction cancelled/disputed — terminal


class PayoutStatus(StrEnum):
    REQUESTED = "requested"
    SUCCESS = "success"
    FAILED = "failed"
