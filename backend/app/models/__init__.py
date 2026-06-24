"""SQLAlchemy ORM models. Populated in Phase 0 (schema) and extended per sprint."""

from app.models.user import User  # noqa: F401
from app.models.listing import Listing, ListingPhoto, ListingDocument, ListingAmenity  # noqa: F401
from app.models.student_accommodation import UnitType, Room  # noqa: F401
from app.models.offer import Offer  # noqa: F401
from app.models.agreement import Agreement  # noqa: F401
from app.models.inspection import InspectionReport, AreaScore  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.badge import Badge  # noqa: F401
from app.models.booking import Booking  # noqa: F401
from app.models.visit import Visit  # noqa: F401
from app.models.chat import ChatThread, ChatMessage  # noqa: F401
from app.models.bookmark import Bookmark  # noqa: F401
from app.models.audit_log import AdminAuditLog  # noqa: F401
from app.models.review import Review  # noqa: F401
from app.models.referral import (  # noqa: F401
    Payout,
    ReferralAttribution,
    ReferralCode,
    ReferralConfig,
    ReferralEarning,
)
