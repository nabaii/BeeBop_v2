"""Seed dummy listings for local development.

Run:

    python -m scripts.seed_listings
    python -m scripts.seed_listings --owner-email someone@beebop.store
    python -m scripts.seed_listings --asset-base-url http://127.0.0.1:8181/dev-assets

Creates an Abuja-flavored mix of rent, sales, and off-campus listings owned
by a seed landlord (auto-created at first run as `landlord-seed@beebop.store`).
All listings go straight to LIVE_UNVERIFIED so they appear in seeker search
without needing the admin doc-review queue. Photos are attached from the
local `dummy listings` folder through the FastAPI `/dev-assets` mount.

Idempotent: re-running deletes the prior seed batch for the owner (titles
starting with the `[seed]` prefix) before recreating, so it's safe to run
repeatedly while iterating on the dataset.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models._enums import (
    AccountType,
    Gender,
    ListingCategory,
    ListingStatus,
    UnitKind,
    UserRole,
)
from app.models.listing import Listing, ListingPhoto
from app.models.student_accommodation import Room, UnitType
from app.models.user import User

SEED_PREFIX = "[seed]"
DEFAULT_OWNER_EMAIL = "landlord-super@beebop.store"
DEFAULT_DEV_ASSET_BASE_URL = "http://127.0.0.1:8000/dev-assets"
ROOT_DIR = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT_DIR / "dummy listings"
DEV_STATE_FILE = ROOT_DIR / ".codex-run" / "dev-state.json"
PHOTO_LABELS = (
    "Living room",
    "Kitchen",
    "Bedroom",
    "Bathroom",
    "Dining area",
    "Exterior",
)

LAND_PHOTOS = [
    {
        "url": "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80",
        "room_label": "Plot overview",
    },
    {
        "url": "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
        "room_label": "Access road",
    },
    {
        "url": "https://images.unsplash.com/photo-1448630360428-65456885c650?auto=format&fit=crop&w=1200&q=80",
        "room_label": "Neighbourhood",
    },
]


def _amenities(**groups: dict[str, bool]) -> dict:
    """Build an amenities checklist in the JSONB shape the model expects.

    Each amenity is `{"present": bool, "confirmed": False}` — confirmation
    flips true only after a physical-badge inspector visit, so seed data
    keeps it false.
    """
    out: dict[str, dict[str, dict[str, bool]]] = {}
    for group, items in groups.items():
        out[group] = {key: {"present": present, "confirmed": False}
                      for key, present in items.items()}
    return out


def _browser_host(host: str) -> str:
    if host in {"0.0.0.0", "::"}:
        return "localhost"
    return host


def _default_asset_base_url() -> str:
    env_value = os.getenv("BEEBOP_DEV_ASSET_BASE_URL")
    if env_value:
        return env_value.rstrip("/")

    if DEV_STATE_FILE.exists():
        try:
            state = json.loads(DEV_STATE_FILE.read_text(encoding="utf-8"))
            port = state.get("backendPort")
            if port:
                host = _browser_host(str(state.get("backendHost") or "127.0.0.1"))
                return f"http://{host}:{port}/dev-assets"
        except (OSError, json.JSONDecodeError):
            pass

    api_url = os.getenv("NEXT_PUBLIC_API_URL")
    if api_url:
        return f"{api_url.rstrip('/')}/dev-assets"

    return DEFAULT_DEV_ASSET_BASE_URL


def _photo_url(*, base_url: str, folder: str, filename: str) -> str:
    return f"{base_url.rstrip('/')}/{quote(folder)}/{quote(filename)}"


def _files_for_folder(folder: str) -> list[Path]:
    root = ASSET_ROOT / folder
    if not root.exists():
        raise FileNotFoundError(f"Dummy listing folder not found: {root}")
    return sorted(path for path in root.iterdir() if path.is_file())


def _local_photos(
    *,
    base_url: str,
    folder: str,
    limit: int = 6,
    offset: int = 0,
) -> list[dict[str, str]]:
    files = _files_for_folder(folder)
    if not files:
        raise FileNotFoundError(f"No dummy listing photos found in {ASSET_ROOT / folder}")

    selected = files[offset: offset + limit]
    if len(selected) < limit:
        selected.extend(files[: limit - len(selected)])

    return [
        {
            "url": _photo_url(base_url=base_url, folder=folder, filename=file.name),
            "room_label": PHOTO_LABELS[index % len(PHOTO_LABELS)],
        }
        for index, file in enumerate(selected)
    ]


# ---------------------------------------------------------------------------
# Listing payloads — Abuja-flavored
# ---------------------------------------------------------------------------


def _rent_listings() -> list[dict]:
    today = date.today()
    return [
        {
            "title": f"{SEED_PREFIX} Furnished 3-bedroom flat in Wuse 2",
            "subtitle": "Serviced apartment with 24/7 power and gated security",
            "description": (
                "Bright, fully-furnished three-bedroom flat in the heart of Wuse 2, "
                "five minutes from Banex Plaza and Sahad Stores. The unit sits on "
                "the second floor of a serviced block with a backup generator, "
                "borehole-fed water, and a uniformed security team at the gate. "
                "All bedrooms are en-suite; the master has a walk-in closet and "
                "balcony view. Comes with fitted kitchen, fridge, gas cooker, and "
                "washing machine. Assigned parking for two vehicles plus shared "
                "guest bays. Service charge covers diesel, water, and waste."
            ),
            "address_line": "12 Aminu Kano Crescent, Wuse 2, Abuja",
            "district": "Wuse 2",
            "gps_lat": 9.0782,
            "gps_lng": 7.4843,
            "price": 8_500_000,
            "amenities": _amenities(
                power={"generator": True, "solar": False, "inverter": True,
                       "estate_grid": False, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": True, "tank": True},
                security={"gated_estate": True, "cctv": True,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": True, "wifi_included": False},
                parking={"private_parking": True, "shared_parking": True,
                         "gated_parking": True},
                kitchen={"fitted_cabinets": True, "gas_cooker": True,
                         "fridge": True, "microwave": False},
                laundry={"washing_machine": True, "dryer": False,
                         "external_line": False},
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
            "title": f"{SEED_PREFIX} 2-bedroom mini flat in Gwarinpa Estate",
            "subtitle": "Quiet 1st Avenue close, family-friendly compound",
            "description": (
                "Spacious two-bedroom mini flat tucked into a quiet close on "
                "Gwarinpa 1st Avenue. The compound holds four flats with a "
                "shared generator on a tested rota and a borehole tank that "
                "tops up daily. Bedrooms come with built-in wardrobes; the "
                "living room is wired for cable and fibre. Tiled throughout, "
                "newly repainted, semi-furnished with a fridge and gas cooker "
                "left by the previous tenant. Walking distance to Game Village "
                "and the Berger junction market."
            ),
            "address_line": "Plot 47, 1st Avenue, Gwarinpa Estate, Abuja",
            "district": "Gwarinpa",
            "gps_lat": 9.1147,
            "gps_lng": 7.4198,
            "price": 3_500_000,
            "amenities": _amenities(
                power={"generator": True, "solar": False, "inverter": False,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": False, "tank": True},
                security={"gated_estate": True, "cctv": False,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": True, "wifi_included": False},
                parking={"private_parking": True, "shared_parking": False,
                         "gated_parking": True},
                kitchen={"fitted_cabinets": True, "gas_cooker": True,
                         "fridge": True, "microwave": False},
                laundry={"washing_machine": False, "dryer": False,
                         "external_line": True},
            ),
            "type_data": {
                "bedroom_count": 2,
                "property_type": "mini_flat",
                "furnishing": "semi_furnished",
                "payment_structure": "annual",
                "available_from": (today + timedelta(days=30)).isoformat(),
            },
        },
        {
            "title": f"{SEED_PREFIX} 4-bedroom semi-detached duplex in Jabi",
            "subtitle": "Lakeview estate, all rooms en-suite, BQ included",
            "description": (
                "Four-bedroom semi-detached duplex inside a 30-unit estate on "
                "the Jabi Lake side. All bedrooms are en-suite and the master "
                "bedroom opens to a private balcony overlooking the estate "
                "lawn. Ground floor includes a guest toilet, fitted kitchen "
                "with breakfast bar, and a lounge that flows into a small "
                "dining area. Detached BQ at the rear with its own entrance. "
                "Estate covers diesel for the central generator, two security "
                "shifts, and weekly waste collection. Two-year payment plans "
                "are negotiable for verified tenants."
            ),
            "address_line": "House 12, Lakeview Estate, Jabi, Abuja",
            "district": "Jabi",
            "gps_lat": 9.0712,
            "gps_lng": 7.4302,
            "price": 12_000_000,
            "amenities": _amenities(
                power={"generator": True, "solar": True, "inverter": True,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": True, "tank": True},
                security={"gated_estate": True, "cctv": True,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": True, "wifi_included": False},
                parking={"private_parking": True, "shared_parking": True,
                         "gated_parking": True},
                kitchen={"fitted_cabinets": True, "gas_cooker": True,
                         "fridge": False, "microwave": False},
                laundry={"washing_machine": False, "dryer": False,
                         "external_line": True},
            ),
            "type_data": {
                "bedroom_count": 4,
                "property_type": "semi_detached",
                "furnishing": "unfurnished",
                "payment_structure": "two_years_upfront",
                "available_from": (today + timedelta(days=45)).isoformat(),
            },
        },
    ]


def _sales_listings() -> list[dict]:
    return [
        {
            "title": f"{SEED_PREFIX} 5-bedroom detached duplex in Maitama",
            "subtitle": "C of O title, fully fitted, ready to move in",
            "description": (
                "Newly built five-bedroom detached duplex on a 1,200sqm plot "
                "in Maitama Extension. The property is fenced with electric "
                "wire on top, holds a private gatehouse, and has space for "
                "six cars in the forecourt. Interior is fully fitted: marble "
                "flooring on the ground level, oak hardwood on the upper "
                "level, imported sanitary ware throughout. All bedrooms are "
                "en-suite with walk-in closets; the master suite has a study "
                "and lounge attached. Detached two-bedroom BQ at the rear. "
                "Title is a registered Certificate of Occupancy held by the "
                "seller; the deed has been verified by counsel."
            ),
            "address_line": "Plot 88, Maitama Extension, Abuja",
            "district": "Maitama",
            "gps_lat": 9.0935,
            "gps_lng": 7.4901,
            "price": 450_000_000,
            "amenities": _amenities(
                power={"generator": True, "solar": True, "inverter": True,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": True, "tank": True},
                security={"gated_estate": False, "cctv": True,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": True, "wifi_included": False},
                parking={"private_parking": True, "shared_parking": False,
                         "gated_parking": True},
                kitchen={"fitted_cabinets": True, "gas_cooker": True,
                         "fridge": True, "microwave": True},
                laundry={"washing_machine": True, "dryer": True,
                         "external_line": False},
            ),
            "type_data": {
                "bedroom_count": 5,
                "property_type": "detached",
                "development_status": "ready",
                "title_type": "c_of_o",
            },
        },
        {
            "title": f"{SEED_PREFIX} 1,000sqm residential plot in Lokogoma",
            "subtitle": "Dry land, motorable access, Governor's Consent ready",
            "description": (
                "Residential plot of 1,000 square metres inside a partially "
                "developed estate off Lokogoma District Road. The land is "
                "dry, gently sloped, and free of encumbrances — survey plan, "
                "deed of assignment, and Governor's Consent application "
                "documents are available for inspection. The estate has tarred "
                "internal roads, drainage on both sides of the access road, "
                "and a perimeter fence around the development. Adjacent plots "
                "are already built up with single- and twin-duplex projects. "
                "Suitable for personal build or short-hold investment."
            ),
            "address_line": "Plot 214, Sunshine Garden Estate, Lokogoma, Abuja",
            "district": "Lokogoma",
            "gps_lat": 8.9851,
            "gps_lng": 7.4612,
            "price": 65_000_000,
            "amenities": _amenities(
                power={"generator": False, "solar": False, "inverter": False,
                       "estate_grid": True, "prepaid_meter": False},
                water={"borehole": False, "running_water": False,
                       "water_treatment": False, "tank": False},
                security={"gated_estate": True, "cctv": False,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": False, "wifi_included": False},
                parking={"private_parking": False, "shared_parking": False,
                         "gated_parking": False},
                kitchen={"fitted_cabinets": False, "gas_cooker": False,
                         "fridge": False, "microwave": False},
                laundry={"washing_machine": False, "dryer": False,
                         "external_line": False},
            ),
            "type_data": {
                "property_type": "land_only",
                "development_status": "ready",
                "title_type": "governors_consent",
            },
        },
        {
            "title": f"{SEED_PREFIX} Off-plan 4-bedroom terrace in Lugbe",
            "subtitle": "Phase II launch, 18-month delivery, flexible plan",
            "description": (
                "Off-plan four-bedroom terrace in Phase II of an established "
                "estate along the Lugbe-Airport corridor. Phase I is delivered "
                "and 70% occupied — buyers can tour the show home before "
                "committing. Each terrace has all rooms en-suite, a guest "
                "toilet, fitted kitchen with island, and a small back garden. "
                "Construction is contracted for 18 months from full payment, "
                "with milestone-based instalments available over 12 months at "
                "no interest. Title is a registered Deed of Assignment with "
                "the estate developer; perfection support is included in the "
                "purchase price."
            ),
            "address_line": "Phase II, Greenfield Estate, Lugbe, Abuja",
            "district": "Lugbe",
            "gps_lat": 8.9624,
            "gps_lng": 7.3786,
            "price": 120_000_000,
            "amenities": _amenities(
                power={"generator": True, "solar": False, "inverter": False,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": False, "tank": True},
                security={"gated_estate": True, "cctv": True,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": True, "wifi_included": False},
                parking={"private_parking": True, "shared_parking": True,
                         "gated_parking": True},
                kitchen={"fitted_cabinets": True, "gas_cooker": True,
                         "fridge": False, "microwave": False},
                laundry={"washing_machine": False, "dryer": False,
                         "external_line": True},
            ),
            "type_data": {
                "bedroom_count": 4,
                "property_type": "terraced",
                "development_status": "off_plan",
                "title_type": "deed_of_assignment",
            },
        },
    ]


def _off_campus_listings() -> list[dict]:
    """Each listing also returns its unit-type inventory under `_inventory`."""
    return [
        {
            "title": f"{SEED_PREFIX} BeeBop Lodge — University of Abuja, Giri",
            "subtitle": "Walk-in hostel, 7 minutes to UniAbuja main gate",
            "description": (
                "Mixed hostel built specifically for University of Abuja "
                "students at the Giri campus. The compound runs a 24-hour "
                "diesel generator on a transparent fuel rota, has two "
                "boreholes feeding a 10,000-litre overhead tank, and keeps a "
                "uniformed security team at the gate around the clock. Common "
                "areas include a study lounge with shared printers, a small "
                "convenience store, and a kitchen block with metered gas "
                "burners. Self-contain rooms come fitted with a bed, "
                "wardrobe, reading desk, and ceiling fan; shared rooms use "
                "the same fittings per bed. Termly rent — payment plans "
                "negotiable for sponsored students."
            ),
            "address_line": "Off Giri-Gwagwalada Road, University of Abuja Permanent Site",
            "district": "Giri",
            "gps_lat": 8.9985,
            "gps_lng": 7.1856,
            "price": None,  # off-campus pricing lives on each unit type
            "amenities": _amenities(
                power={"generator": True, "solar": False, "inverter": True,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": True, "tank": True},
                security={"gated_estate": True, "cctv": True,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": True, "wifi_included": True},
                parking={"private_parking": False, "shared_parking": True,
                         "gated_parking": True},
                kitchen={"fitted_cabinets": True, "gas_cooker": True,
                         "fridge": False, "microwave": False},
                laundry={"washing_machine": True, "dryer": False,
                         "external_line": True},
            ),
            "type_data": {
                "institutions_accepted": [
                    "University of Abuja",
                    "Veritas University",
                ],
            },
            "_inventory": [
                {
                    "name": "Self-contain (en-suite)",
                    "kind": UnitKind.SELF_CONTAIN,
                    "beds_per_room": 1,
                    "total_units": 12,
                    "rooms": [
                        {"name": f"Block A — Room {i:02d}",
                         "gender_tag": Gender.ANY,
                         "beds_total": 1, "beds_available": 1}
                        for i in range(1, 9)
                    ],
                },
                {
                    "name": "Two-in-a-room (female wing)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 6,
                    "rooms": [
                        {"name": f"Block B — Room F{i:02d}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 2, "beds_available": 2}
                        for i in range(1, 5)
                    ],
                },
                {
                    "name": "Two-in-a-room (male wing)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 6,
                    "rooms": [
                        {"name": f"Block C — Room M{i:02d}",
                         "gender_tag": Gender.MALE,
                         "beds_total": 2,
                         # leave one room with one occupant to exercise occupancy UI
                         "beds_available": 1 if i == 1 else 2}
                        for i in range(1, 5)
                    ],
                },
            ],
        },
        {
            "title": f"{SEED_PREFIX} Jabi Student Lodge — Baze & Nile University",
            "subtitle": "Premium hostel near Jabi Lake, fibre Wi-Fi included",
            "description": (
                "Modern student lodge purpose-built for Baze and Nile "
                "University students, two minutes from the Baze gate and a "
                "short ride from the Nile University shuttle stop. Rooms are "
                "tiled, en-suite where listed, and each bed comes with a "
                "lockable wardrobe and reading lamp. The building runs on "
                "estate grid with an inverter backup that covers the Wi-Fi, "
                "fans, and lighting through outages. Housekeeping covers "
                "common areas weekly; a contracted cleaner handles each "
                "self-contain on request. Fibre Wi-Fi is included in the "
                "termly rate. No curfew, but visitor sign-in is logged at "
                "the gatehouse."
            ),
            "address_line": "Plot 19, Jabi District, near Baze University",
            "district": "Jabi",
            "gps_lat": 9.0768,
            "gps_lng": 7.4263,
            "price": None,
            "amenities": _amenities(
                power={"generator": True, "solar": False, "inverter": True,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": True, "tank": True},
                security={"gated_estate": True, "cctv": True,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": True, "wifi_included": True},
                parking={"private_parking": False, "shared_parking": True,
                         "gated_parking": True},
                kitchen={"fitted_cabinets": True, "gas_cooker": True,
                         "fridge": True, "microwave": True},
                laundry={"washing_machine": True, "dryer": False,
                         "external_line": False},
            ),
            "type_data": {
                "institutions_accepted": [
                    "Baze University",
                    "Nile University of Nigeria",
                    "African University of Science and Technology",
                ],
            },
            "_inventory": [
                {
                    "name": "Premium self-contain",
                    "kind": UnitKind.SELF_CONTAIN,
                    "beds_per_room": 1,
                    "total_units": 8,
                    "rooms": [
                        {"name": f"Suite {i:02d}",
                         "gender_tag": Gender.ANY,
                         "beds_total": 1, "beds_available": 1}
                        for i in range(1, 9)
                    ],
                },
                {
                    "name": "Three-in-a-room (female)",
                    "kind": UnitKind.THREE_IN_A_ROOM,
                    "beds_per_room": 3,
                    "total_units": 4,
                    "rooms": [
                        {"name": f"Female Hall — Room {i}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 3, "beds_available": 3}
                        for i in range(1, 5)
                    ],
                },
            ],
        },
    ]


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


async def _ensure_owner(db, email: str) -> User:
    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if user is not None:
        # Promote to landlord if the existing user has a different role,
        # otherwise leave their existing identity intact.
        if user.role not in (UserRole.LANDLORD, UserRole.AGENT):
            user.role = UserRole.LANDLORD
        if user.account_type is None:
            user.account_type = AccountType.INDIVIDUAL
        return user

    user = User(
        email=email,
        role=UserRole.LANDLORD,
        first_name="BeeBop",
        last_name="Landlord",
        phone="+2348000000000",
        account_type=AccountType.INDIVIDUAL,
        nin_verified=True,
        bvn_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _wipe_existing_seed(db, owner: User) -> int:
    stmt = (
        select(Listing)
        .where(Listing.owner_id == owner.id)
        .where(Listing.title.like(f"{SEED_PREFIX}%"))
    )
    rows = (await db.execute(stmt)).scalars().all()
    for row in rows:
        await db.delete(row)
    return len(rows)


def _build_listing(owner: User, payload: dict) -> Listing:
    listing = Listing(
        owner_id=owner.id,
        category=payload["category"],
        status=ListingStatus.LIVE_UNVERIFIED,
        title=payload["title"],
        subtitle=payload["subtitle"],
        description=payload["description"],
        address_line=payload["address_line"],
        district=payload["district"],
        gps_lat=payload["gps_lat"],
        gps_lng=payload["gps_lng"],
        price=payload["price"],
        amenities=payload["amenities"],
        type_data=payload["type_data"],
    )
    return listing


def _photo_specs_for_listing(payload: dict, asset_base_url: str) -> list[dict[str, str]]:
    title = str(payload["title"])
    if "Furnished 3-bedroom flat" in title:
        return _local_photos(base_url=asset_base_url, folder="Listing_2", limit=6)
    if "2-bedroom mini flat" in title:
        return _local_photos(base_url=asset_base_url, folder="Listing_1", limit=5)
    if "4-bedroom semi-detached duplex" in title:
        return _local_photos(base_url=asset_base_url, folder="Listing_3", limit=6)
    if "5-bedroom detached duplex" in title:
        return _local_photos(base_url=asset_base_url, folder="Listing_3", limit=6, offset=4)
    if "1,000sqm residential plot" in title:
        return LAND_PHOTOS
    if "Off-plan 4-bedroom terrace" in title:
        return _local_photos(base_url=asset_base_url, folder="Listing_3", limit=5, offset=10)
    if "BeeBop Lodge" in title:
        return _local_photos(base_url=asset_base_url, folder="Listing_1", limit=6, offset=6)
    if "Jabi Student Lodge" in title:
        return _local_photos(base_url=asset_base_url, folder="Listing_2", limit=6, offset=6)
    return _local_photos(base_url=asset_base_url, folder="Listing_1", limit=4)


def _add_listing_photos(listing: Listing, payload: dict, asset_base_url: str) -> int:
    specs = _photo_specs_for_listing(payload, asset_base_url)
    listing.photos = [
        ListingPhoto(
            url=spec["url"],
            room_label=spec.get("room_label"),
            display_order=index,
            is_cover=index == 0,
        )
        for index, spec in enumerate(specs)
    ]
    return len(specs)


async def main() -> int:
    parser = argparse.ArgumentParser(description="Seed dummy BeeBop listings.")
    parser.add_argument("--owner-email", default=DEFAULT_OWNER_EMAIL,
                        help=f"Owner email (default: {DEFAULT_OWNER_EMAIL}).")
    parser.add_argument(
        "--asset-base-url",
        default=_default_asset_base_url(),
        help="Base URL for local dummy images (default: detected dev backend /dev-assets).",
    )
    args = parser.parse_args()
    email = args.owner_email.strip().lower()
    asset_base_url = args.asset_base_url.rstrip("/")

    rent = [{**p, "category": ListingCategory.RENT} for p in _rent_listings()]
    sales = [{**p, "category": ListingCategory.SALES} for p in _sales_listings()]
    student = [{**p, "category": ListingCategory.OFF_CAMPUS}
               for p in _off_campus_listings()]

    async with AsyncSessionLocal() as db:
        owner = await _ensure_owner(db, email)
        wiped = await _wipe_existing_seed(db, owner)
        photo_count = 0

        for payload in rent + sales:
            listing = _build_listing(owner, payload)
            db.add(listing)
            photo_count += _add_listing_photos(listing, payload, asset_base_url)

        for payload in student:
            inventory = payload.pop("_inventory")
            listing = _build_listing(owner, payload)
            db.add(listing)
            photo_count += _add_listing_photos(listing, payload, asset_base_url)
            await db.flush()  # need listing.id for unit-type FK
            for ut_payload in inventory:
                ut = UnitType(
                    listing_id=listing.id,
                    name=ut_payload["name"],
                    kind=ut_payload["kind"],
                    beds_per_room=ut_payload["beds_per_room"],
                    total_units=ut_payload["total_units"],
                )
                db.add(ut)
                await db.flush()
                for room_payload in ut_payload["rooms"]:
                    db.add(Room(
                        unit_type_id=ut.id,
                        name=room_payload["name"],
                        gender_tag=room_payload["gender_tag"],
                        beds_total=room_payload["beds_total"],
                        beds_available=room_payload["beds_available"],
                    ))

        await db.commit()

    total = len(rent) + len(sales) + len(student)
    print(f"Owner: {email} ({owner.id})")
    if wiped:
        print(f"Removed {wiped} prior seed listing(s).")
    print(f"Created {total} listing(s): "
          f"{len(rent)} rent, {len(sales)} sales, {len(student)} off-campus.")
    print(f"Attached {photo_count} photo(s) from {asset_base_url}.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
