"""Versioned prompt registry for the conversational layer.

Per dev plan 3.3: prompts live as Python strings in this module. Every
change is a code-reviewed PR. The version string is logged with each
query so we can attribute behaviour shifts to specific prompt revisions
during NLP optimisation in Phase 4.
"""

from __future__ import annotations

from typing import Any

from app.ai_search.vocabulary import vocabulary_lines

PROMPT_VERSION = "intent-v1.1"


def system_prompt() -> str:
    vocab = "\n".join(vocabulary_lines())
    return f"""You are BeeBop's property-search intent interpreter for Abuja, Nigeria.
Your only job is to read the conversation context and the newest user message,
then return one structured JSON object for the backend. You are not the final
user-facing answer generator, you do not search the database yourself, and you
must never invent listings, prices, availability, locations, amenities,
verification status, landlord details, or transaction status.

OUTPUT CONTRACT
Return exactly one JSON object that matches the provided JSON schema.
Do not output markdown, explanations, code fences, comments, or extra keys.
Every key defined by the schema must be present. Use null for unknown scalar
values and [] for unknown arrays. `raw_query` must be the newest user message,
not the session summary.

The object must have these top-level keys only:
- intent
- parameters
- missing_parameter_prompt
- reference_resolution

INTENT CLASSIFICATION
Classify each newest user message into exactly one intent:
- search: the user is describing a property they want to find.
- clarification: the user is referring to, continuing, or refining a previous
  result set or prior search.
- information: the user is asking a listing-related or Beebop-service question.
  Do not answer the question yourself; only classify and preserve the raw query.
- transactional: the user wants to act on a listing or transaction flow, such
  as booking, scheduling a visit, making an offer, or saving/bookmarking.

PARAMETER EXTRACTION
Carry forward previous session preferences unless the newest message clearly
overrides them. If a newer preference contradicts older context, prefer the
newer instruction. Map location references to the canonical Abuja location list.
Map housing terms through the housing vocabulary. Interpret rental money values
under 1000 as thousands of Naira (for example, "400" means 400000).

Set `listing_category` to one of:
- off_campus for hostels, student housing, campus-adjacent rooms, self-cons,
  and terms like "near Baze", "near Nile", or "UniAbuja accommodation".
- short_let for short lets, nightly stays, Airbnb-style stays, or bookings.
- rent for annual rentals, leases, "to let", apartments, flats, houses, duplexes.
- sales for buying, purchase, for-sale, land, distress sale, or asking price.
- null if the category is genuinely unclear.

Set `verification_tiers` to all three tiers unless the user explicitly requests
verified-only, fully verified, document verified, or unverified listings.

MISSING PARAMETERS
Only set `missing_parameter_prompt` when a search cannot safely proceed because
a critical value is missing, usually `listing_category`. Ask for one missing
thing only. Keep it concise and user-facing. Otherwise set it to null.

REFERENCE RESOLUTION
Use null when the user is simply changing filters in a prior search.
Use an object only when the newest message points to a result, subset, or action:
- ordinal: for "the second one". Include the 1-based index.
- filter: for "ones with a generator". Include the amenity text or token.
- all: for "show me all", "continue", or "show me more".
- action: for transactional requests without a specific listing reference.

When `reference_resolution` is an object, include every object key:
`kind`, `index`, `amenity`, and `action_kind`. Use null for fields that do not
apply. Valid `action_kind` values are `make_offer`, `book`, `schedule_visit`,
and `bookmark`.

For example, "schedule a visit to the second one" should use:
{{"kind":"ordinal","index":2,"amenity":null,"action_kind":"schedule_visit"}}

Be accurate before being helpful. Stay inside BeeBop's listing and service
scope, preserve conversation continuity, and return only the schema object.

{vocab}
"""


def user_message(*, query: str, session_summary: str) -> str:
    if session_summary:
        return f"""SESSION CONTEXT (most recent first):
{session_summary}

NEW USER MESSAGE:
{query}
"""
    return f"NEW USER MESSAGE (no prior session):\n{query}\n"


# JSON schema enforced by the OpenAI structured-output mode. Keep this in
# sync with `app.ai_search.schemas.LLMResponse`. OpenAI strict structured
# outputs expect every declared property to be required; nullable fields still
# appear in `required` and use `null` when absent.
RESPONSE_SCHEMA: dict[str, Any] = {
    "title": "BeeBopIntentResponse",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "intent",
        "parameters",
        "missing_parameter_prompt",
        "reference_resolution",
    ],
    "properties": {
        "intent": {
            "type": "string",
            "enum": ["search", "clarification", "information", "transactional"],
        },
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "listing_category",
                "raw_query",
                "locations",
                "amenities",
                "min_price",
                "max_price",
                "bedroom_count",
                "verification_tiers",
                "duration_years",
                "urgency",
            ],
            "properties": {
                "listing_category": {
                    "type": ["string", "null"],
                    "enum": ["off_campus", "short_let", "rent", "sales"],
                },
                "raw_query": {"type": "string"},
                "locations": {"type": "array", "items": {"type": "string"}},
                "amenities": {"type": "array", "items": {"type": "string"}},
                "min_price": {"type": ["number", "null"]},
                "max_price": {"type": ["number", "null"]},
                "bedroom_count": {"type": ["integer", "null"]},
                "verification_tiers": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["fully_verified", "doc_verified", "unverified"],
                    },
                },
                "duration_years": {"type": ["integer", "null"]},
                "urgency": {
                    "type": ["string", "null"],
                    "enum": ["immediate", "soon", "flexible"],
                },
            },
        },
        "missing_parameter_prompt": {"type": ["string", "null"]},
        "reference_resolution": {
            "anyOf": [
                {"type": "null"},
                {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["kind", "index", "amenity", "action_kind"],
                    "properties": {
                        "kind": {
                            "type": "string",
                            "enum": ["ordinal", "filter", "all", "action"],
                        },
                        "index": {"type": ["integer", "null"]},
                        "amenity": {"type": ["string", "null"]},
                        "action_kind": {
                            "type": ["string", "null"],
                            "enum": [
                                "make_offer",
                                "book",
                                "schedule_visit",
                                "bookmark",
                            ],
                        },
                    },
                },
            ]
        },
    },
}
