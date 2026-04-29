"""Short-let pricing and availability helpers.

Pricing lives inside `Listing.type_data` so the single listing record carries
everything the browse / listing page needs without a join. The turnaround
window is enforced at booking time (Sprint 11) — this module only persists
the configured days.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.listings.schemas import ShortLetPricingPayload
from app.models._enums import ListingCategory
from app.models.listing import Listing
from app.models.user import User


async def set_short_let_pricing(
    *,
    user: User,
    listing_id: uuid.UUID,
    payload: ShortLetPricingPayload,
    db: AsyncSession,
) -> Listing:
    listing = await db.get(Listing, listing_id)
    if listing is None:
        raise NotFoundError("Listing not found.", code="listing_not_found")
    if str(listing.owner_id) != str(user.id):
        raise ForbiddenError("You do not own this listing.", code="listing_not_yours")
    if listing.category != ListingCategory.SHORT_LET:
        raise ValidationError(
            "Short-let pricing only applies to short-let listings.",
            code="not_short_let",
        )

    merged = dict(listing.type_data or {})
    merged.update(
        {
            "base_rate": payload.base_rate,
            "weekend_rate": payload.weekend_rate,
            "min_stay_nights": payload.min_stay_nights,
            "turnaround_days": payload.turnaround_days,
            "instant_booking": payload.instant_booking,
        }
    )
    listing.type_data = merged

    # Convenience: mirror base_rate into Listing.price so the listing card
    # component renders short-lets consistently with rent/sales cards.
    listing.price = payload.base_rate

    await db.flush()
    return listing
