"""Nigerian housing vocabulary + Abuja location synonyms.

Per product brief §10.2 — every conversational turn is normalised through
this table before being passed to the LLM. Keeping it as a Python module
(not a database table) keeps changes code-reviewed and version-controlled
per dev plan §3.3 ("All prompt templates stored as versioned Python strings
in the codebase. Changes tracked in Git. No live prompt editing.").
"""

from __future__ import annotations

# (canonical term, list of synonyms / colloquialisms / variants)
HOUSING_VOCABULARY: dict[str, str] = {
    # Self-contained units
    "self-con": "Self-contained unit with private bathroom and kitchen.",
    "self-contain": "Self-contained unit with private bathroom and kitchen.",
    "self contained": "Self-contained unit with private bathroom and kitchen.",
    # Boys' Quarters
    "bq": "Small separate structure on a compound, typically one room.",
    "boys quarters": "Small separate structure on a compound, typically one room.",
    "boys quarter": "Small separate structure on a compound, typically one room.",
    # Shared corridor housing
    "face me i face you": "Shared corridor housing with multiple rooms opening to a common passage.",
    "face-me-i-face-you": "Shared corridor housing with multiple rooms opening to a common passage.",
    # Mini flat
    "mini flat": "Open-plan studio with a separate bathroom.",
    "mini-flat": "Open-plan studio with a separate bathroom.",
    # Shared rooms (student)
    "2-in-1": "Shared room with 2 beds.",
    "2-in-a-room": "Shared room with 2 beds.",
    "two in a room": "Shared room with 2 beds.",
    "3-in-1": "Shared room with 3 beds.",
    "3-in-a-room": "Shared room with 3 beds.",
    "three in a room": "Shared room with 3 beds.",
    # Compound house
    "compound house": "Property where multiple tenants share a compound.",
    # Distress sale
    "distress sale": "Property sold urgently, often below market value.",
    # Numeric shorthand
    "400": "Interpreted as 400,000 Naira per year, not 400 Naira (rental context).",
    "500": "Interpreted as 500,000 Naira per year, not 500 Naira (rental context).",
    "1m": "Interpreted as 1,000,000 Naira.",
    "2m": "Interpreted as 2,000,000 Naira.",
    "5m": "Interpreted as 5,000,000 Naira.",
    # Location descriptors
    "behind": "Location descriptor — mapped to GPS proximity search.",
    "off": "Location descriptor — mapped to GPS proximity search.",
    "close to": "Location descriptor — mapped to GPS proximity search.",
}

# Common Abuja locations — both formal estate names and the colloquialisms
# Abuja residents actually use. Normalised to the canonical district name.
ABUJA_LOCATIONS: dict[str, str] = {
    "wuse 2": "Wuse 2",
    "wuse2": "Wuse 2",
    "wuse ii": "Wuse 2",
    "wuse 1": "Wuse 1",
    "wuse one": "Wuse 1",
    "garki 1": "Garki 1",
    "garki 2": "Garki 2",
    "asokoro": "Asokoro",
    "maitama": "Maitama",
    "maitama 2": "Maitama 2",
    "gwarinpa": "Gwarinpa",
    "lifecamp": "Life Camp",
    "life camp": "Life Camp",
    "katampe": "Katampe",
    "katampe extension": "Katampe Extension",
    "jabi": "Jabi",
    "jahi": "Jahi",
    "utako": "Utako",
    "kado": "Kado",
    "guzape": "Guzape",
    "lokogoma": "Lokogoma",
    "galadimawa": "Galadimawa",
    "gudu": "Gudu",
    "apo": "Apo",
    "kubwa": "Kubwa",
    "lugbe": "Lugbe",
    "karu": "Karu",
    "nyanya": "Nyanya",
    "mararaba": "Mararaba",
    "gishiri": "Gishiri",
    "durumi": "Durumi",
    "wuye": "Wuye",
    "dakwo": "Dakwo",
    "kafe": "Kafe",
    "mabuchi": "Mabuchi",
    "dawaki": "Dawaki",
    "karmo": "Karmo",
    "central area": "Central Area",
    "cbd": "Central Area",
    "city centre": "Central Area",
    "idu": "Idu",
    "mbora": "Mbora",
    "kaura": "Kaura",
    "wuse zone 3": "Wuse Zone 3",
    "wuse zone 5": "Wuse Zone 5",
    "zone 3": "Wuse Zone 3",
    "zone 5": "Wuse Zone 5",
}

# Universities seekers reference when looking for off-campus housing. Maps a
# colloquial form to a canonical institution name that is guaranteed to be a
# substring of the values landlords store in
# ``type_data["institutions_accepted"]`` (e.g. "Nile University" matches the
# stored "Nile University of Nigeria"). Used to populate the off-campus
# ``institution`` filter instead of leaking the school name into free-text
# keyword matching.
INSTITUTIONS: dict[str, str] = {
    "uniabuja": "University of Abuja",
    "uni abuja": "University of Abuja",
    "university of abuja": "University of Abuja",
    "baze": "Baze University",
    "baze university": "Baze University",
    "nile": "Nile University",
    "nileuni": "Nile University",
    "nile university": "Nile University",
    "nile university of nigeria": "Nile University",
    "veritas": "Veritas University",
    "veritas university": "Veritas University",
    "aust": "African University of Science and Technology",
    "african university of science and technology": (
        "African University of Science and Technology"
    ),
}

# Universities + landmarks Abuja seekers reference for proximity searches.
LANDMARKS: dict[str, str] = {
    "uniabuja": "University of Abuja",
    "university of abuja": "University of Abuja",
    "baze": "Baze University",
    "baze university": "Baze University",
    "nileuni": "Nile University",
    "nile university": "Nile University",
    "veritas": "Veritas University",
    "national hospital": "National Hospital Abuja",
    "asokoro hospital": "Asokoro District Hospital",
    "ceddi plaza": "Ceddi Plaza",
    "jabi lake mall": "Jabi Lake Mall",
    "shoprite jabi": "Shoprite Jabi",
}

# ---------------------------------------------------------------------------
# Lifestyle-to-filter mapping
# ---------------------------------------------------------------------------
# Natural language phrases seekers use that map to structured filters.
# The AI pipeline uses these both in prompt context and in heuristic
# extraction. Each entry maps a phrase to a dict of filter fields it implies.

LIFESTYLE_FILTERS: dict[str, dict[str, object]] = {
    # Budget qualifiers
    "cheap": {"sort_hint": "price_asc"},
    "affordable": {"sort_hint": "price_asc"},
    "budget": {"sort_hint": "price_asc"},
    "luxury": {"sort_hint": "price_desc"},
    "premium": {"sort_hint": "price_desc"},
    "high-end": {"sort_hint": "price_desc"},
    # Proximity
    "walking distance": {"distance_hint": "walkable"},
    "close to campus": {"distance_hint": "campus_near"},
    "near campus": {"distance_hint": "campus_near"},
    "near supermarket": {"distance_hint": "supermarket"},
    # Environment
    "quiet": {"environment_hint": "quiet"},
    "peaceful": {"environment_hint": "quiet"},
    "family friendly": {"environment_hint": "family"},
    "family-friendly": {"environment_hint": "family"},
    # Security → amenity mapping
    "good security": {"amenity": "security:gated_estate"},
    "secure": {"amenity": "security:gated_estate"},
    "gated": {"amenity": "security:gated_estate"},
    # Power → amenity mapping
    "24/7 electricity": {"amenities": ["power:generator", "power:inverter"]},
    "constant power": {"amenities": ["power:generator", "power:inverter"]},
    "no light issues": {"amenities": ["power:generator", "power:inverter"]},
    # Internet → amenity mapping
    "fast wi-fi": {"amenity": "internet:wifi_included"},
    "fast wifi": {"amenity": "internet:wifi_included"},
    "good internet": {"amenity": "internet:fibre_available"},
    # Occupancy
    "shared room": {"occupancy": "shared"},
    "private room": {"occupancy": "single"},
    "single room": {"occupancy": "single"},
    # Furnishing
    "furnished": {"furnished": True},
    "unfurnished": {"furnished": False},
    "fully furnished": {"furnished": True},
    # Gender
    "female only": {"gender_preference": "female"},
    "male only": {"gender_preference": "male"},
    "girls only": {"gender_preference": "female"},
    "boys only": {"gender_preference": "male"},
    # Pet
    "pet friendly": {"pet_friendly": True},
    "pet-friendly": {"pet_friendly": True},
    "allows pets": {"pet_friendly": True},
    # Availability
    "available immediately": {"urgency": "immediate"},
    "available now": {"urgency": "immediate"},
    "move in immediately": {"urgency": "immediate"},
    "move in now": {"urgency": "immediate"},
}

# District adjacency map — used for "nearby area" suggestions when a search
# returns zero results. Each key maps to its neighbouring districts.
DISTRICT_ADJACENCY: dict[str, list[str]] = {
    "Jabi": ["Utako", "Life Camp", "Kado", "Mabuchi"],
    "Utako": ["Jabi", "Wuse 2", "Mabuchi", "Gudu"],
    "Wuse 2": ["Wuse 1", "Utako", "Maitama", "Garki 1"],
    "Wuse 1": ["Wuse 2", "Garki 1"],
    "Maitama": ["Wuse 2", "Asokoro", "Jabi"],
    "Asokoro": ["Maitama", "Garki 2", "Guzape"],
    "Gwarinpa": ["Life Camp", "Dawaki", "Kado"],
    "Life Camp": ["Gwarinpa", "Jabi", "Kado", "Katampe"],
    "Katampe": ["Life Camp", "Katampe Extension", "Mabuchi"],
    "Katampe Extension": ["Katampe", "Jabi", "Mabuchi"],
    "Jahi": ["Kado", "Life Camp", "Gwarinpa"],
    "Kado": ["Jahi", "Life Camp", "Jabi", "Gwarinpa"],
    "Guzape": ["Asokoro", "Mabuchi", "Garki 2"],
    "Lokogoma": ["Galadimawa", "Apo", "Gudu"],
    "Galadimawa": ["Lokogoma", "Gudu"],
    "Gudu": ["Galadimawa", "Utako", "Lokogoma", "Apo"],
    "Apo": ["Lokogoma", "Gudu", "Durumi"],
    "Kubwa": ["Dawaki"],
    "Lugbe": ["Idu", "Karu"],
    "Karu": ["Lugbe", "Nyanya"],
    "Nyanya": ["Karu", "Mararaba"],
    "Mararaba": ["Nyanya"],
    "Durumi": ["Gudu", "Apo", "Garki 2"],
    "Wuye": ["Wuse 2", "Maitama"],
    "Mabuchi": ["Jabi", "Utako", "Katampe Extension"],
    "Dawaki": ["Gwarinpa", "Kubwa"],
    "Karmo": ["Life Camp", "Gwarinpa"],
    "Central Area": ["Garki 1", "Garki 2", "Wuse 1"],
    "Garki 1": ["Wuse 1", "Wuse 2", "Central Area", "Garki 2"],
    "Garki 2": ["Garki 1", "Asokoro", "Central Area", "Durumi"],
    "Idu": ["Lugbe"],
}


def vocabulary_lines() -> list[str]:
    """Compact lines for inclusion in the system prompt."""
    out: list[str] = ["KNOWN HOUSING TERMS:"]
    for term, meaning in HOUSING_VOCABULARY.items():
        out.append(f'  • "{term}" — {meaning}')
    out.append("")
    out.append("ABUJA LOCATIONS (normalise to the canonical name):")
    for raw, canon in sorted(ABUJA_LOCATIONS.items()):
        if raw == canon.lower():
            out.append(f"  • {canon}")
        else:
            out.append(f'  • "{raw}" → {canon}')
    out.append("")
    out.append("INSTITUTIONS (put in `institution`, never in `locations`):")
    for raw, canon in sorted(INSTITUTIONS.items()):
        if raw == canon.lower():
            out.append(f"  • {canon}")
        else:
            out.append(f'  • "{raw}" → {canon}')
    out.append("")
    out.append("LANDMARKS (treat as proximity hints, not exact locations):")
    for raw, canon in sorted(LANDMARKS.items()):
        out.append(f'  • "{raw}" → {canon}')
    out.append("")
    out.append("LIFESTYLE PHRASES (map to structured filters):")
    for phrase in sorted(LIFESTYLE_FILTERS.keys()):
        out.append(f'  • "{phrase}"')
    return out


def normalise_location(raw: str) -> str | None:
    """Best-effort canonical lookup. Returns None on no match."""
    cleaned = raw.strip().lower()
    if not cleaned:
        return None
    if cleaned in ABUJA_LOCATIONS:
        return ABUJA_LOCATIONS[cleaned]
    # Loose substring match — covers "wuse 2 area" → "Wuse 2".
    for synonym, canonical in ABUJA_LOCATIONS.items():
        if synonym in cleaned:
            return canonical
    return None


def nearby_districts(district: str, *, limit: int = 3) -> list[str]:
    """Return neighbouring districts for zero-results expansion."""
    return DISTRICT_ADJACENCY.get(district, [])[:limit]
