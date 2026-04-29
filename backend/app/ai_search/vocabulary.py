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
    out.append("LANDMARKS (treat as proximity hints, not exact locations):")
    for raw, canon in sorted(LANDMARKS.items()):
        out.append(f'  • "{raw}" → {canon}')
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
