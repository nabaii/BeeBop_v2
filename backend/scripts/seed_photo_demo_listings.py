"""Seed three landlord-super listings backed by local dummy image folders.

Run:

    python -m scripts.seed_photo_demo_listings

This is development-only content. It serves images through the FastAPI
`/dev-assets` mount and recreates the same three listings on each run.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models._enums import AccountType, ListingCategory, ListingStatus, UserRole
from app.models.listing import Listing, ListingPhoto
from app.models.user import User

TITLE_PREFIX = "[photo-demo]"
DEFAULT_OWNER_EMAIL = "landlord-super@beebop.ng"
DEFAULT_BASE_URL = "http://localhost:8000/dev-assets"
ASSET_ROOT = Path(__file__).resolve().parents[2] / "dummy listings"


def _amenities(**groups: dict[str, bool]) -> dict:
    out: dict[str, dict[str, dict[str, bool]]] = {}
    for group, items in groups.items():
        out[group] = {
            key: {"present": present, "confirmed": False}
            for key, present in items.items()
        }
    return out


def _listing_specs() -> list[dict]:
    today = date.today()
    return [
        {
            "folder": "Listing_1",
            "title": f"{TITLE_PREFIX} Contemporary 4-bedroom duplex in Katampe",
            "subtitle": "Freshly finished home with airy interiors and rooftop views",
            "description": (
                "Newly completed four-bedroom duplex in Katampe with generous natural "
                "light, polished finishes, and a clean modern layout built for family "
                "living. The compound includes a private parking apron, uniformed gate "
                "security, treated borehole water, and a backup power setup that keeps "
                "the core appliances running during outages. Each bedroom is en-suite, "
                "the kitchen has fitted cabinetry and a pantry wall, and the living "
                "areas flow into a compact outdoor sit-out suited for quiet evenings or "
                "small gatherings."
            ),
            "address_line": "14 Obafemi Awolowo Way, Katampe Extension, Abuja",
            "district": "Katampe",
            "gps_lat": 9.0984,
            "gps_lng": 7.4572,
            "price": 11_500_000,
            "amenities": _amenities(
                power={
                    "generator": True,
                    "solar": False,
                    "inverter": True,
                    "estate_grid": True,
                    "prepaid_meter": True,
                },
                water={
                    "borehole": True,
                    "running_water": True,
                    "water_treatment": True,
                    "tank": True,
                },
                security={
                    "gated_estate": False,
                    "cctv": True,
                    "perimeter_fence": True,
                    "security_guards": True,
                },
                internet={"fibre_available": True, "wifi_included": False},
                parking={
                    "private_parking": True,
                    "shared_parking": False,
                    "gated_parking": True,
                },
                kitchen={
                    "fitted_cabinets": True,
                    "gas_cooker": True,
                    "fridge": False,
                    "microwave": False,
                },
                laundry={
                    "washing_machine": False,
                    "dryer": False,
                    "external_line": True,
                },
            ),
            "type_data": {
                "bedroom_count": 4,
                "property_type": "semi_detached",
                "furnishing": "unfurnished",
                "payment_structure": "annual",
                "available_from": (today + timedelta(days=21)).isoformat(),
            },
        },
        {
            "folder": "Listing_2",
            "title": f"{TITLE_PREFIX} Furnished 3-bedroom apartment in Jahi",
            "subtitle": "Move-in-ready unit with warm finishes and family lounge",
            "description": (
                "Fully furnished three-bedroom apartment in Jahi designed for renters "
                "who want a ready-to-live-in space without heavy setup. The home comes "
                "with fitted wardrobes, a dining set, a practical kitchen layout, and "
                "a bright main lounge that opens toward the estate-facing balcony. The "
                "compound has controlled visitor access, paved parking, stable borehole "
                "water, and a shared standby generator arrangement already included in "
                "the service structure. It suits a small family or working professionals "
                "who want quick access to Wuse, Jabi, and the city centre."
            ),
            "address_line": "22 Naval Quarters Road, Jahi, Abuja",
            "district": "Jahi",
            "gps_lat": 9.0913,
            "gps_lng": 7.4458,
            "price": 8_800_000,
            "amenities": _amenities(
                power={
                    "generator": True,
                    "solar": False,
                    "inverter": False,
                    "estate_grid": True,
                    "prepaid_meter": True,
                },
                water={
                    "borehole": True,
                    "running_water": True,
                    "water_treatment": False,
                    "tank": True,
                },
                security={
                    "gated_estate": True,
                    "cctv": False,
                    "perimeter_fence": True,
                    "security_guards": True,
                },
                internet={"fibre_available": True, "wifi_included": False},
                parking={
                    "private_parking": True,
                    "shared_parking": True,
                    "gated_parking": True,
                },
                kitchen={
                    "fitted_cabinets": True,
                    "gas_cooker": True,
                    "fridge": True,
                    "microwave": True,
                },
                laundry={
                    "washing_machine": True,
                    "dryer": False,
                    "external_line": False,
                },
            ),
            "type_data": {
                "bedroom_count": 3,
                "property_type": "flat",
                "furnishing": "furnished",
                "payment_structure": "annual",
                "available_from": (today + timedelta(days=14)).isoformat(),
            },
        },
        {
            "folder": "Listing_3",
            "title": f"{TITLE_PREFIX} 5-bedroom terrace in Guzape",
            "subtitle": "Large entertainer layout with premium staircase and lounge zones",
            "description": (
                "Spacious five-bedroom terrace in Guzape with a dramatic internal "
                "staircase, layered living areas, and enough room for a larger family "
                "or executive shared household. The property sits inside a tidy private "
                "compound with perimeter lighting, CCTV coverage, treated water supply, "
                "and gated parking for multiple vehicles. Bedrooms are oversized and "
                "en-suite, while the main lounge and dining spaces are laid out for "
                "hosting. The finish level is intentionally premium, with statement "
                "ceilings, contemporary bathroom fittings, and strong circulation "
                "between indoor and outdoor relaxation areas."
            ),
            "address_line": "8 Idris Gidado Street, Guzape, Abuja",
            "district": "Guzape",
            "gps_lat": 8.9974,
            "gps_lng": 7.5231,
            "price": 16_000_000,
            "amenities": _amenities(
                power={
                    "generator": True,
                    "solar": True,
                    "inverter": True,
                    "estate_grid": False,
                    "prepaid_meter": True,
                },
                water={
                    "borehole": True,
                    "running_water": True,
                    "water_treatment": True,
                    "tank": True,
                },
                security={
                    "gated_estate": False,
                    "cctv": True,
                    "perimeter_fence": True,
                    "security_guards": True,
                },
                internet={"fibre_available": True, "wifi_included": False},
                parking={
                    "private_parking": True,
                    "shared_parking": False,
                    "gated_parking": True,
                },
                kitchen={
                    "fitted_cabinets": True,
                    "gas_cooker": True,
                    "fridge": False,
                    "microwave": False,
                },
                laundry={
                    "washing_machine": False,
                    "dryer": False,
                    "external_line": True,
                },
            ),
            "type_data": {
                "bedroom_count": 5,
                "property_type": "terraced",
                "furnishing": "semi_furnished",
                "payment_structure": "two_years_upfront",
                "available_from": (today + timedelta(days=30)).isoformat(),
            },
        },
    ]


async def _ensure_owner(db, email: str) -> User:
    owner = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if owner is not None:
        if owner.role != UserRole.LANDLORD:
            owner.role = UserRole.LANDLORD
        if owner.account_type is None:
            owner.account_type = AccountType.INDIVIDUAL
        if not owner.first_name:
            owner.first_name = "Landlord"
        if not owner.last_name:
            owner.last_name = "Super"
        return owner

    owner = User(
        email=email,
        role=UserRole.LANDLORD,
        first_name="Landlord",
        last_name="Super",
        phone="+2348000000000",
        account_type=AccountType.INDIVIDUAL,
        nin_verified=True,
        bvn_verified=True,
    )
    db.add(owner)
    await db.flush()
    return owner


async def _wipe_existing(db, owner: User) -> int:
    rows = (
        await db.execute(
            select(Listing).where(
                Listing.owner_id == owner.id,
                Listing.title.like(f"{TITLE_PREFIX}%"),
            )
        )
    ).scalars().all()
    for row in rows:
        await db.delete(row)
    return len(rows)


def _photo_url(*, base_url: str, folder: str, filename: str) -> str:
    return f"{base_url.rstrip('/')}/{quote(folder)}/{quote(filename)}"


def _files_for_folder(folder: str) -> list[Path]:
    root = ASSET_ROOT / folder
    if not root.exists():
        raise FileNotFoundError(f"Dummy listing folder not found: {root}")
    return sorted(path for path in root.iterdir() if path.is_file())


async def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed three landlord-super listings using local dummy images."
    )
    parser.add_argument(
        "--owner-email",
        default=DEFAULT_OWNER_EMAIL,
        help=f"Owner email (default: {DEFAULT_OWNER_EMAIL}).",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Public base URL for dummy images (default: {DEFAULT_BASE_URL}).",
    )
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        owner = await _ensure_owner(db, args.owner_email.strip().lower())
        removed = await _wipe_existing(db, owner)

        created: list[tuple[str, int]] = []
        for spec in _listing_specs():
            listing = Listing(
                owner_id=owner.id,
                category=ListingCategory.RENT,
                status=ListingStatus.LIVE_UNVERIFIED,
                title=spec["title"],
                subtitle=spec["subtitle"],
                description=spec["description"],
                address_line=spec["address_line"],
                district=spec["district"],
                gps_lat=spec["gps_lat"],
                gps_lng=spec["gps_lng"],
                price=spec["price"],
                amenities=spec["amenities"],
                type_data=spec["type_data"],
            )
            db.add(listing)
            await db.flush()

            files = _files_for_folder(spec["folder"])
            for index, file in enumerate(files):
                db.add(
                    ListingPhoto(
                        listing_id=listing.id,
                        url=_photo_url(
                            base_url=args.base_url,
                            folder=spec["folder"],
                            filename=file.name,
                        ),
                        room_label=f"{spec['folder']} photo {index + 1}",
                        display_order=index,
                        is_cover=index == 0,
                    )
                )
            created.append((spec["title"], len(files)))

        await db.commit()

    print(f"Owner: {owner.email}")
    if removed:
        print(f"Removed {removed} prior photo-demo listing(s).")
    for title, count in created:
        print(f"Created: {title} ({count} photo(s))")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
