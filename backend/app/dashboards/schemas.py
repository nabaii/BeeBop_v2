"""Dashboard response shapes."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.models._enums import Gender, ListingCategory, ListingStatus


class CountByStatus(BaseModel):
    status: ListingStatus
    count: int


class SeekerOverview(BaseModel):
    saved_count: int
    active_offers_count: int = 0           # Sprint 8
    agreements_count: int = 0              # Sprint 10
    unread_notifications: int


class MonthlyIncome(BaseModel):
    month: str
    amount: float


class ListingRevenueStats(BaseModel):
    listing_id: str
    title: str | None
    category: ListingCategory
    status: ListingStatus
    price: float | None
    total_income: float
    occupancy_rate: float
    view_count: int
    save_count: int
    enquiry_count: int
    cover_photo_url: str | None = None


class LandlordOverview(BaseModel):
    listings_total: int
    listings_by_status: list[CountByStatus]
    pending_offers_count: int = 0
    unread_notifications: int
    total_income: float
    occupancy_rate: float
    monthly_income: list[MonthlyIncome]
    listing_stats: list[ListingRevenueStats]


class ListingAnalytics(BaseModel):
    listing_id: str
    title: str | None
    category: ListingCategory
    view_count: int
    save_count: int
    enquiry_count: int


# ---------------------------------------------------------------------------
# Student accommodation PMS
# ---------------------------------------------------------------------------


class GenderBreakdown(BaseModel):
    female_total: int = 0
    female_available: int = 0
    male_total: int = 0
    male_available: int = 0
    any_total: int = 0          # self-contain rooms
    any_available: int = 0


class UnitOccupancy(BaseModel):
    unit_type_id: str
    unit_name: str
    kind: str
    beds_per_room: int
    total_units: int
    breakdown: GenderBreakdown


class StudentPMS(BaseModel):
    listing_id: str
    listing_title: str | None
    overall: GenderBreakdown
    units: list[UnitOccupancy]
    waitlist_total: int = 0     # Sprint 8 — wired when enquiries land


# ---------------------------------------------------------------------------
# Short-let
# ---------------------------------------------------------------------------


class ShortLetPricingView(BaseModel):
    base_rate: float | None = None
    weekend_rate: float | None = None
    min_stay_nights: int | None = None
    turnaround_days: int | None = None
    instant_booking: bool | None = None


class ShortLetCalendarDay(BaseModel):
    date: date
    state: str         # "available" | "booked" | "turnaround"
    is_weekend: bool
    rate: float | None = None


class ShortLetCalendar(BaseModel):
    listing_id: str
    days: list[ShortLetCalendarDay]


class ShortLetDashboard(BaseModel):
    listing_id: str
    title: str | None
    pricing: ShortLetPricingView
    calendar: ShortLetCalendar
    upcoming_bookings_count: int = 0       # Sprint 11
    pending_booking_requests: int = 0      # Sprint 11
    revenue_30d: float = 0                 # Sprint 11
    occupancy_30d_pct: float = 0           # Sprint 11
