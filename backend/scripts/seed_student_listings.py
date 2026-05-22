"""Seed student accommodation listings from the Targeting Pipeline spreadsheet.

Run:

    python -m scripts.seed_student_listings
    python -m scripts.seed_student_listings --owner-email landlord-super@beebop.ng

Creates 8 off-campus student accommodation listings sourced from the
BeeBop Listings Pipeline "Targeting" sheet (LEAD-001 through LEAD-008).
Each listing is owned by ``landlord-super@beebop.ng`` and goes straight
to LIVE_UNVERIFIED so it appears in seeker search immediately.

All accommodations share a baseline of common student amenities (generator,
borehole, security guards) while more expensive/exclusive amenities like
solar, CCTV, fibre, and washing machines are randomised per property to
create realistic distinction.

Idempotent: re-running wipes the prior batch (titles starting with the
``[student]`` prefix) and recreates them.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
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

TITLE_PREFIX = "[student]"
DEFAULT_OWNER_EMAIL = "landlord-super@beebop.ng"
DEFAULT_BASE_URL = "http://localhost:8000/dev-assets"
ASSET_ROOT = Path(__file__).resolve().parents[2] / "dummy listings"

PHOTO_LABELS = (
    "Reception",
    "Common area",
    "Room interior",
    "Bathroom",
    "Study area",
    "Exterior",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _amenities(**groups: dict[str, bool]) -> dict:
    """Build an amenities checklist in the JSONB shape the model expects."""
    out: dict[str, dict[str, dict[str, bool]]] = {}
    for group, items in groups.items():
        out[group] = {
            key: {"present": present, "confirmed": False}
            for key, present in items.items()
        }
    return out


def _photo_url(*, base_url: str, folder: str, filename: str) -> str:
    return f"{base_url.rstrip('/')}/{quote(folder)}/{quote(filename)}"


def _files_for_folder(folder: str) -> list[Path]:
    root = ASSET_ROOT / folder
    if not root.exists():
        return []
    return sorted(path for path in root.iterdir() if path.is_file())


# ---------------------------------------------------------------------------
# 8 student accommodation listing definitions
# ---------------------------------------------------------------------------


def _student_listings() -> list[dict]:
    """Return all 8 student hostel listings from the Targeting Pipeline."""
    return [
        # ---- LEAD-001 : Zen Den Student Apartments ----
        {
            "title": f"{TITLE_PREFIX} Zen Den Student Apartments",
            "subtitle": "Modern student living at Same Global Estate, A19 Road",
            "description": (
                "Zen Den Student Apartments is a purpose-built student "
                "accommodation located inside Same Global Estate on A19 Road, "
                "Abuja. The property features 24/7 power backed by a diesel "
                "generator and inverter system, borehole-fed water supply, and "
                "a gated compound with uniformed security guards on a 24-hour "
                "rotation. Rooms are tiled, cross-ventilated, and each bed comes "
                "with a reading desk, wardrobe, and ceiling fan. Common areas "
                "include a shared kitchen block with gas burners, a quiet study "
                "lounge, and laundry lines in the back courtyard. Fibre Wi-Fi "
                "covers all blocks. Mixed-gender occupancy — self-contain rooms "
                "have no gender restriction, shared rooms are gender-separated "
                "by floor."
            ),
            "address_line": "Same Global Estate, A19 Rd, Abuja",
            "district": "Gwarinpa",
            "gps_lat": 9.1052,
            "gps_lng": 7.4120,
            "price": None,
            "amenities": _amenities(
                power={"generator": True, "solar": False, "inverter": True,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": False, "tank": True},
                security={"gated_estate": True, "cctv": True,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": True, "wifi_included": True},
                parking={"private_parking": False, "shared_parking": True,
                         "gated_parking": True},
                kitchen={"fitted_cabinets": False, "gas_cooker": True,
                         "fridge": False, "microwave": False},
                laundry={"washing_machine": False, "dryer": False,
                         "external_line": True},
            ),
            "type_data": {
                "institutions_accepted": [
                    "Baze University",
                    "Nile University of Nigeria",
                    "University of Abuja",
                ],
            },
            "_photo_folder": "Listing_1",
            "_photo_offset": 0,
            "_photo_limit": 5,
            "_inventory": [
                {
                    "name": "Self-contain (en-suite)",
                    "kind": UnitKind.SELF_CONTAIN,
                    "beds_per_room": 1,
                    "total_units": 10,
                    "rooms": [
                        {"name": f"Block A — Room {i:02d}",
                         "gender_tag": Gender.ANY,
                         "beds_total": 1, "beds_available": 1}
                        for i in range(1, 7)
                    ],
                },
                {
                    "name": "Two-in-a-room (female)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 8,
                    "rooms": [
                        {"name": f"Block B — Room F{i:02d}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 2, "beds_available": 2}
                        for i in range(1, 5)
                    ],
                },
                {
                    "name": "Two-in-a-room (male)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 8,
                    "rooms": [
                        {"name": f"Block C — Room M{i:02d}",
                         "gender_tag": Gender.MALE,
                         "beds_total": 2, "beds_available": 1 if i == 1 else 2}
                        for i in range(1, 5)
                    ],
                },
            ],
        },

        # ---- LEAD-002 : Green Valley Student Residence ----
        {
            "title": f"{TITLE_PREFIX} Green Valley Student Residence",
            "subtitle": "Male & Female hostel in Green Valley Estate, Gaduwa",
            "description": (
                "Green Valley Student Residence sits inside the quiet Green "
                "Valley Estate in Gaduwa, offering affordable accommodation "
                "for male and female students. The compound features a 24-hour "
                "diesel generator with transparent fuel rota, two boreholes "
                "feeding an overhead tank, and a perimeter fence with gatehouse "
                "security. Rooms are spacious and naturally lit — each bed gets "
                "a steel-frame bunk (for shared rooms), a wardrobe locker, and "
                "a ceiling fan. The shared kitchen block has fitted gas burners "
                "and a deep sink. Solar-powered corridor lights and CCTV cameras "
                "cover common areas. Laundry is handled on external drying lines "
                "in the compound yard."
            ),
            "address_line": "Green Valley Estate, Gaduwa, Abuja",
            "district": "Galadimawa",
            "gps_lat": 8.9913,
            "gps_lng": 7.4782,
            "price": None,
            "amenities": _amenities(
                power={"generator": True, "solar": True, "inverter": False,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": True, "tank": True},
                security={"gated_estate": True, "cctv": True,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": False, "wifi_included": True},
                parking={"private_parking": False, "shared_parking": True,
                         "gated_parking": False},
                kitchen={"fitted_cabinets": False, "gas_cooker": True,
                         "fridge": False, "microwave": False},
                laundry={"washing_machine": False, "dryer": False,
                         "external_line": True},
            ),
            "type_data": {
                "institutions_accepted": [
                    "University of Abuja",
                    "Baze University",
                    "Veritas University",
                ],
            },
            "_photo_folder": "Listing_2",
            "_photo_offset": 0,
            "_photo_limit": 5,
            "_inventory": [
                {
                    "name": "Three-in-a-room (female wing)",
                    "kind": UnitKind.THREE_IN_A_ROOM,
                    "beds_per_room": 3,
                    "total_units": 6,
                    "rooms": [
                        {"name": f"Female Block — Room {i:02d}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 3, "beds_available": 3}
                        for i in range(1, 5)
                    ],
                },
                {
                    "name": "Three-in-a-room (male wing)",
                    "kind": UnitKind.THREE_IN_A_ROOM,
                    "beds_per_room": 3,
                    "total_units": 6,
                    "rooms": [
                        {"name": f"Male Block — Room {i:02d}",
                         "gender_tag": Gender.MALE,
                         "beds_total": 3, "beds_available": 2 if i == 1 else 3}
                        for i in range(1, 5)
                    ],
                },
                {
                    "name": "Two-in-a-room (mixed)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 4,
                    "rooms": [
                        {"name": f"Block C — Room {i:02d}",
                         "gender_tag": Gender.FEMALE if i <= 2 else Gender.MALE,
                         "beds_total": 2, "beds_available": 2}
                        for i in range(1, 5)
                    ],
                },
            ],
        },

        # ---- LEAD-003 : RKB Student Accommodation (Female) ----
        {
            "title": f"{TITLE_PREFIX} RKB Student Accommodation (Female)",
            "subtitle": "Female-only hostel beside Nile Street, near University",
            "description": (
                "RKB Student Accommodation (Female) is a well-maintained, "
                "female-only hostel located in Metroview Estate beside Nile "
                "Street, close to the university district. The building runs "
                "on a reliable diesel generator with inverter backup that "
                "handles lighting and phone charging through outages. Water "
                "is borehole-fed with a treatment filter and a 5,000-litre "
                "overhead tank. Security includes a perimeter fence, CCTV "
                "at entry points, and a female warden on-site after hours. "
                "Rooms are tiled with individual bed-light sockets and "
                "lockable wardrobes. A communal kitchen with gas cooker, "
                "microwave, and fridge is shared among residents. Fibre Wi-Fi "
                "is included in the termly rent."
            ),
            "address_line": "Metroview Estate, beside Nile Street, Abuja",
            "district": "Jabi",
            "gps_lat": 9.0743,
            "gps_lng": 7.4285,
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
                         "external_line": True},
            ),
            "type_data": {
                "institutions_accepted": [
                    "Nile University of Nigeria",
                    "Baze University",
                ],
            },
            "_photo_folder": "Listing_3",
            "_photo_offset": 0,
            "_photo_limit": 5,
            "_inventory": [
                {
                    "name": "Self-contain (female, en-suite)",
                    "kind": UnitKind.SELF_CONTAIN,
                    "beds_per_room": 1,
                    "total_units": 6,
                    "rooms": [
                        {"name": f"Suite F{i:02d}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 1, "beds_available": 1}
                        for i in range(1, 5)
                    ],
                },
                {
                    "name": "Two-in-a-room (female)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 8,
                    "rooms": [
                        {"name": f"Block A — Room F{i:02d}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 2, "beds_available": 2}
                        for i in range(1, 6)
                    ],
                },
                {
                    "name": "Three-in-a-room (female)",
                    "kind": UnitKind.THREE_IN_A_ROOM,
                    "beds_per_room": 3,
                    "total_units": 4,
                    "rooms": [
                        {"name": f"Block B — Room F{i:02d}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 3, "beds_available": 3}
                        for i in range(1, 4)
                    ],
                },
            ],
        },

        # ---- LEAD-004 : RKB Student Accommodation (Male) ----
        {
            "title": f"{TITLE_PREFIX} RKB Student Accommodation (Male)",
            "subtitle": "Male-only hostel at Oghosho Real Homes, Karmo/Idu",
            "description": (
                "RKB Student Accommodation (Male) is located within the "
                "Oghosho Real Homes development off Idu Industrial Layout, "
                "Karmo. The property caters exclusively to male students and "
                "runs a 24-hour generator with a prepaid meter system so fuel "
                "costs are transparent. Borehole water with an overhead tank "
                "ensures constant supply. Security guards man the gatehouse "
                "around the clock, and the compound is fenced with a controlled "
                "single-entry point. Rooms are fitted with metal-frame bunks, "
                "mosquito nets, lockable cupboards, and ceiling fans. A shared "
                "kitchen block has gas cookers and a communal fridge. External "
                "drying lines handle laundry."
            ),
            "address_line": "Oghosho Real Homes LTD, Karmo, Idu, Abuja",
            "district": "Karmo",
            "gps_lat": 9.0447,
            "gps_lng": 7.3729,
            "price": None,
            "amenities": _amenities(
                power={"generator": True, "solar": False, "inverter": False,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": False, "tank": True},
                security={"gated_estate": False, "cctv": False,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": False, "wifi_included": False},
                parking={"private_parking": False, "shared_parking": True,
                         "gated_parking": False},
                kitchen={"fitted_cabinets": False, "gas_cooker": True,
                         "fridge": True, "microwave": False},
                laundry={"washing_machine": False, "dryer": False,
                         "external_line": True},
            ),
            "type_data": {
                "institutions_accepted": [
                    "University of Abuja",
                    "Baze University",
                    "Nile University of Nigeria",
                ],
            },
            "_photo_folder": "Listing_1",
            "_photo_offset": 6,
            "_photo_limit": 5,
            "_inventory": [
                {
                    "name": "Two-in-a-room (male)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 10,
                    "rooms": [
                        {"name": f"Block A — Room M{i:02d}",
                         "gender_tag": Gender.MALE,
                         "beds_total": 2, "beds_available": 2}
                        for i in range(1, 7)
                    ],
                },
                {
                    "name": "Three-in-a-room (male)",
                    "kind": UnitKind.THREE_IN_A_ROOM,
                    "beds_per_room": 3,
                    "total_units": 6,
                    "rooms": [
                        {"name": f"Block B — Room M{i:02d}",
                         "gender_tag": Gender.MALE,
                         "beds_total": 3, "beds_available": 1 if i == 2 else 3}
                        for i in range(1, 5)
                    ],
                },
            ],
        },

        # ---- LEAD-005 : Lakeside Apartments ----
        {
            "title": f"{TITLE_PREFIX} Lakeside Apartments",
            "subtitle": "Student-friendly apartments in Utako, near Jabi Lake",
            "description": (
                "Lakeside Apartments is a modern student-friendly complex at "
                "20V7+67, Utako, minutes from Jabi Lake and major campus "
                "shuttle routes. The property boasts a premium amenity set: "
                "24/7 power via a central generator with solar panels and "
                "inverter backup, treated borehole water, fibre internet with "
                "Wi-Fi included, and CCTV-monitored gated parking. Each "
                "self-contain unit is en-suite with a kitchenette, fitted "
                "wardrobe, and study nook. Shared rooms are gender-separated "
                "by block and come with individual reading lamps, under-bed "
                "storage, and ceiling fans. A coin-operated washing machine "
                "is available in the laundry block."
            ),
            "address_line": "20V7+67, Utako, Abuja",
            "district": "Utako",
            "gps_lat": 9.0649,
            "gps_lng": 7.4450,
            "price": None,
            "amenities": _amenities(
                power={"generator": True, "solar": True, "inverter": True,
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
                         "external_line": True},
            ),
            "type_data": {
                "institutions_accepted": [
                    "Baze University",
                    "Nile University of Nigeria",
                    "African University of Science and Technology",
                ],
            },
            "_photo_folder": "Listing_2",
            "_photo_offset": 6,
            "_photo_limit": 5,
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
                        for i in range(1, 7)
                    ],
                },
                {
                    "name": "Two-in-a-room (female)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 4,
                    "rooms": [
                        {"name": f"Block B — Room F{i:02d}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 2, "beds_available": 2}
                        for i in range(1, 4)
                    ],
                },
                {
                    "name": "Two-in-a-room (male)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 4,
                    "rooms": [
                        {"name": f"Block C — Room M{i:02d}",
                         "gender_tag": Gender.MALE,
                         "beds_total": 2, "beds_available": 2}
                        for i in range(1, 4)
                    ],
                },
            ],
        },

        # ---- LEAD-006 : Madibe Hostel ----
        {
            "title": f"{TITLE_PREFIX} Madibe Hostel",
            "subtitle": "Budget-friendly hostel on Sharif Ibrahim St, Idu",
            "description": (
                "Madibe Hostel is an affordable student hostel located at "
                "2 Sharif Ibrahim Street, off Mahdi Namadi Sambo Way in Idu. "
                "The property is designed for budget-conscious students who "
                "need a clean, secure place to stay during term. Power comes "
                "from a shared generator on a scheduled rota with a prepaid "
                "meter system. Water is borehole-fed with an overhead tank. "
                "The compound has a perimeter fence with a manned gate. Rooms "
                "are simple but functional — tiled floors, ceiling fans, "
                "mosquito nets, and individual storage lockers. The shared "
                "kitchen has gas burners and a communal washing-up area. "
                "External drying lines are available in the yard."
            ),
            "address_line": "2 Sharif Ibrahim St, Mahdi Namadi Sambo Way, Idu, Abuja",
            "district": "Idu",
            "gps_lat": 9.0385,
            "gps_lng": 7.3685,
            "price": None,
            "amenities": _amenities(
                power={"generator": True, "solar": False, "inverter": False,
                       "estate_grid": False, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": False, "tank": True},
                security={"gated_estate": False, "cctv": False,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": False, "wifi_included": False},
                parking={"private_parking": False, "shared_parking": True,
                         "gated_parking": False},
                kitchen={"fitted_cabinets": False, "gas_cooker": True,
                         "fridge": False, "microwave": False},
                laundry={"washing_machine": False, "dryer": False,
                         "external_line": True},
            ),
            "type_data": {
                "institutions_accepted": [
                    "University of Abuja",
                    "Baze University",
                ],
            },
            "_photo_folder": "Listing_3",
            "_photo_offset": 6,
            "_photo_limit": 5,
            "_inventory": [
                {
                    "name": "Three-in-a-room (female)",
                    "kind": UnitKind.THREE_IN_A_ROOM,
                    "beds_per_room": 3,
                    "total_units": 5,
                    "rooms": [
                        {"name": f"Female Wing — Room {i:02d}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 3, "beds_available": 3}
                        for i in range(1, 4)
                    ],
                },
                {
                    "name": "Three-in-a-room (male)",
                    "kind": UnitKind.THREE_IN_A_ROOM,
                    "beds_per_room": 3,
                    "total_units": 5,
                    "rooms": [
                        {"name": f"Male Wing — Room {i:02d}",
                         "gender_tag": Gender.MALE,
                         "beds_total": 3, "beds_available": 2 if i == 3 else 3}
                        for i in range(1, 4)
                    ],
                },
                {
                    "name": "Two-in-a-room (male)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 4,
                    "rooms": [
                        {"name": f"Annex — Room M{i:02d}",
                         "gender_tag": Gender.MALE,
                         "beds_total": 2, "beds_available": 2}
                        for i in range(1, 4)
                    ],
                },
            ],
        },

        # ---- LEAD-007 : Wrace Hall ----
        {
            "title": f"{TITLE_PREFIX} Wrace Hall",
            "subtitle": "Premium student hall in Mbora District, Gitec Estate",
            "description": (
                "Wrace Hall is a premium student accommodation located at "
                "2406 Mbora District inside Gitec Estate, Abuja. It caters to "
                "students who want a higher-end hostel experience. The building "
                "runs 24/7 on a central generator with solar panel augmentation "
                "and an inverter system for seamless power transitions. Water is "
                "treated and borehole-fed with dual overhead tanks. The estate "
                "is gated with CCTV coverage at all entry and exit points, plus "
                "security guards at the gatehouse. Rooms feature quality "
                "finishes — PVC flooring, en-suite bathrooms in self-contain "
                "units, individual reading lights, and air-conditioning in "
                "premium suites. The communal kitchen is fully fitted with "
                "gas cookers, a shared fridge, and microwave. A coin-operated "
                "washing machine is available on the ground floor."
            ),
            "address_line": "2406 Mbora District, Gitec Estate, Abuja",
            "district": "Mbora",
            "gps_lat": 9.0012,
            "gps_lng": 7.4123,
            "price": None,
            "amenities": _amenities(
                power={"generator": True, "solar": True, "inverter": True,
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
                         "external_line": True},
            ),
            "type_data": {
                "institutions_accepted": [
                    "Baze University",
                    "Nile University of Nigeria",
                    "Veritas University",
                    "University of Abuja",
                ],
            },
            "_photo_folder": "Listing_1",
            "_photo_offset": 12,
            "_photo_limit": 5,
            "_inventory": [
                {
                    "name": "Premium self-contain (en-suite, AC)",
                    "kind": UnitKind.SELF_CONTAIN,
                    "beds_per_room": 1,
                    "total_units": 6,
                    "rooms": [
                        {"name": f"Premium Suite {i:02d}",
                         "gender_tag": Gender.ANY,
                         "beds_total": 1, "beds_available": 1}
                        for i in range(1, 5)
                    ],
                },
                {
                    "name": "Standard self-contain",
                    "kind": UnitKind.SELF_CONTAIN,
                    "beds_per_room": 1,
                    "total_units": 8,
                    "rooms": [
                        {"name": f"Standard Suite {i:02d}",
                         "gender_tag": Gender.ANY,
                         "beds_total": 1, "beds_available": 1}
                        for i in range(1, 6)
                    ],
                },
                {
                    "name": "Two-in-a-room (female)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 4,
                    "rooms": [
                        {"name": f"Block B — Room F{i:02d}",
                         "gender_tag": Gender.FEMALE,
                         "beds_total": 2, "beds_available": 2}
                        for i in range(1, 4)
                    ],
                },
                {
                    "name": "Two-in-a-room (male)",
                    "kind": UnitKind.TWO_IN_A_ROOM,
                    "beds_per_room": 2,
                    "total_units": 4,
                    "rooms": [
                        {"name": f"Block C — Room M{i:02d}",
                         "gender_tag": Gender.MALE,
                         "beds_total": 2, "beds_available": 1 if i == 1 else 2}
                        for i in range(1, 4)
                    ],
                },
            ],
        },

        # ---- LEAD-008 : Mountain View Province Phase 3 ----
        {
            "title": f"{TITLE_PREFIX} Mountain View Province Phase 3",
            "subtitle": "Student lodge in Katampe Extension, Tony Momoh Road",
            "description": (
                "Mountain View Province Phase 3 is a student accommodation "
                "complex in Katampe Extension, off 6 Tony Momoh Road. The "
                "property is well-suited for students attending universities "
                "across the Abuja metropolitan area. Power is supplied by a "
                "diesel generator with estate grid backup and a prepaid meter "
                "setup. Borehole water is filtered and stored in overhead tanks. "
                "The compound is gated with a perimeter fence, security guards, "
                "and nighttime flood-lighting. Self-contain units are en-suite "
                "with tiled floors and fitted cupboards. Shared rooms are "
                "gender-separated, with reading desks and individual power "
                "sockets per bed. A shared kitchen block with gas cookers "
                "is available on each floor. Limited fibre coverage — Wi-Fi "
                "hotspots are placed in the study lounge and reception."
            ),
            "address_line": "Katampe Extension, 6 Tony Momoh Road, Abuja",
            "district": "Katampe Extension",
            "gps_lat": 9.0965,
            "gps_lng": 7.4612,
            "price": None,
            "amenities": _amenities(
                power={"generator": True, "solar": False, "inverter": True,
                       "estate_grid": True, "prepaid_meter": True},
                water={"borehole": True, "running_water": True,
                       "water_treatment": True, "tank": True},
                security={"gated_estate": True, "cctv": False,
                          "perimeter_fence": True, "security_guards": True},
                internet={"fibre_available": True, "wifi_included": False},
                parking={"private_parking": False, "shared_parking": True,
                         "gated_parking": True},
                kitchen={"fitted_cabinets": False, "gas_cooker": True,
                         "fridge": False, "microwave": False},
                laundry={"washing_machine": False, "dryer": False,
                         "external_line": True},
            ),
            "type_data": {
                "institutions_accepted": [
                    "Baze University",
                    "Nile University of Nigeria",
                    "University of Abuja",
                ],
            },
            "_photo_folder": "Listing_2",
            "_photo_offset": 12,
            "_photo_limit": 5,
            "_inventory": [
                {
                    "name": "Self-contain (en-suite)",
                    "kind": UnitKind.SELF_CONTAIN,
                    "beds_per_room": 1,
                    "total_units": 10,
                    "rooms": [
                        {"name": f"Block A — Room {i:02d}",
                         "gender_tag": Gender.ANY,
                         "beds_total": 1, "beds_available": 1}
                        for i in range(1, 7)
                    ],
                },
                {
                    "name": "Two-in-a-room (female)",
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
                    "name": "Three-in-a-room (male)",
                    "kind": UnitKind.THREE_IN_A_ROOM,
                    "beds_per_room": 3,
                    "total_units": 6,
                    "rooms": [
                        {"name": f"Block C — Room M{i:02d}",
                         "gender_tag": Gender.MALE,
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
        if user.role not in (UserRole.LANDLORD, UserRole.AGENT):
            user.role = UserRole.LANDLORD
        if user.account_type is None:
            user.account_type = AccountType.INDIVIDUAL
        return user

    user = User(
        email=email,
        role=UserRole.LANDLORD,
        first_name="Landlord",
        last_name="Super",
        phone="+2348000000000",
        account_type=AccountType.INDIVIDUAL,
        nin_verified=True,
        bvn_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _wipe_existing(db, owner: User) -> int:
    stmt = (
        select(Listing)
        .where(Listing.owner_id == owner.id)
        .where(Listing.title.like(f"{TITLE_PREFIX}%"))
    )
    rows = (await db.execute(stmt)).scalars().all()
    for row in rows:
        await db.delete(row)
    return len(rows)


def _local_photos(
    *,
    base_url: str,
    folder: str,
    limit: int = 5,
    offset: int = 0,
) -> list[dict[str, str]]:
    root = ASSET_ROOT / folder
    if not root.exists():
        return []
    files = sorted(path for path in root.iterdir() if path.is_file())
    if not files:
        return []

    selected = files[offset: offset + limit]
    # wrap around if we run out of photos
    if len(selected) < limit:
        selected.extend(files[: limit - len(selected)])

    return [
        {
            "url": _photo_url(base_url=base_url, folder=folder, filename=file.name),
            "room_label": PHOTO_LABELS[index % len(PHOTO_LABELS)],
        }
        for index, file in enumerate(selected)
    ]


async def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed 8 student accommodation listings from the Targeting Pipeline."
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
    email = args.owner_email.strip().lower()
    base_url = args.base_url.rstrip("/")

    listings_data = [
        {**p, "category": ListingCategory.OFF_CAMPUS}
        for p in _student_listings()
    ]

    async with AsyncSessionLocal() as db:
        owner = await _ensure_owner(db, email)
        wiped = await _wipe_existing(db, owner)

        created = 0
        photo_count = 0
        room_count = 0

        for payload in listings_data:
            inventory = payload.pop("_inventory")
            photo_folder = payload.pop("_photo_folder")
            photo_offset = payload.pop("_photo_offset")
            photo_limit = payload.pop("_photo_limit")

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
            db.add(listing)

            # Attach photos
            specs = _local_photos(
                base_url=base_url,
                folder=photo_folder,
                limit=photo_limit,
                offset=photo_offset,
            )
            listing.photos = [
                ListingPhoto(
                    url=spec["url"],
                    room_label=spec.get("room_label"),
                    display_order=index,
                    is_cover=index == 0,
                )
                for index, spec in enumerate(specs)
            ]
            photo_count += len(specs)

            await db.flush()  # need listing.id for unit-type FK

            # Create unit types and rooms
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
                    room_count += 1

            created += 1

        await db.commit()

    print(f"Owner: {email} ({owner.id})")
    if wiped:
        print(f"Removed {wiped} prior [student] listing(s).")
    print(f"Created {created} student accommodation listing(s).")
    print(f"Attached {photo_count} photo(s) from {base_url}.")
    print(f"Created {room_count} room(s) across all unit types.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
