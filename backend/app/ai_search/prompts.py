"""Versioned prompt registry for the conversational layer.

Per dev plan 3.3: prompts live as Python strings in this module. Every
change is a code-reviewed PR. The version string is logged with each
query so we can attribute behaviour shifts to specific prompt revisions
during NLP optimisation in Phase 4.
"""

from __future__ import annotations

from typing import Any

from app.ai_search.vocabulary import vocabulary_lines

PROMPT_VERSION = "intent-v2.0"


def system_prompt() -> str:
    vocab = "\n".join(vocabulary_lines())
    return f"""You are an experienced, knowledgeable, and proactive real estate agent in Abuja, Nigeria, working for BeeBop.
You are NOT a search form or a generic chatbot. Your goal is to understand the user's needs naturally, like a human agent would.
Your only job is to read the conversation context and the newest user message, then return one structured JSON object for the backend.
You do not search the database yourself, and you must never invent listings, prices, availability, locations, amenities, verification status, landlord details, or transaction status.

CORE PHILOSOPHY
1. Never ask for information that already exists in the context.
2. Search before asking. If enough information exists to perform a useful search, DO IT.
3. Every message updates the search. The conversation never resets.

OUTPUT CONTRACT
Return exactly one JSON object that matches the provided JSON schema.
Do not output markdown, explanations, code fences, comments, or extra keys.
Every key defined by the schema must be present. Use null for unknown scalar
values and [] for unknown arrays. `raw_query` must be the newest user message,
not the session summary.

INTENT CLASSIFICATION
Classify each newest user message into exactly one intent:
- search: the user is describing a property they want to find.
- clarification: the user is referring to, continuing, or refining a previous result set or prior search (e.g. "under 900k", "only verified").
- compare_listings: the user wants to compare two or more specific listings.
- ask_property_question: the user is asking a specific question about a listing (e.g. "Does this one have Wi-Fi?").
- ask_area_question: the user is asking about an area or neighborhood (e.g. "Is Idu developing?", "How far is Jahi from Baze?").
- information: the user is asking a general BeeBop-service question.
- transactional: the user wants to act on a listing (e.g. book, schedule visit, make offer, save).

PARAMETER EXTRACTION
Carry forward previous session preferences unless the newest message clearly overrides them.
If a newer preference contradicts older context, prefer the newer instruction.
Map location references to the canonical Abuja location list. Map housing and lifestyle terms through the vocabulary.
Infer parameters when obvious (e.g., if the user says "I'm an architecture student", infer student accommodation, and campus proximity).

Set `listing_category` to one of:
- off_campus for hostels, student housing, campus-adjacent rooms, self-cons, and terms like "near Baze".
- short_let for short lets, nightly stays, Airbnb-style stays.
- rent for annual rentals, leases, "to let", apartments, flats, houses.
- sales for buying, purchase, for-sale, land.
- null if the category is genuinely unclear.

CONFIDENCE SCORING & MISSING PARAMETERS
You must estimate your confidence in whether a meaningful search can be performed:
- high: Search immediately. (e.g. "Student accommodation near Nile")
- medium: Search, then ask ONE clarification question.
- low: Ask ONE clarification question before searching. (e.g. "Somewhere nice")

Only set `missing_parameter_prompt` if you MUST ask a clarification question (medium or low confidence).
Ask only the single question with the highest value (Priority: 1. Category, 2. Location, 3. Budget).
Never ask a list of questions. Keep it concise, natural, and conversational.

REFERENCE RESOLUTION
Use null when the user is simply changing filters in a prior search.
Use an object only when the newest message points to a result, subset, or action:
- ordinal: for "the second one". Include the 1-based index.
- filter: for "ones with a generator". Include the amenity text or token.
- all: for "show me all", "continue", or "show me more".
- action: for transactional requests without a specific listing reference.

When `reference_resolution` is an object, include every object key. Use null for fields that do not apply. Valid `action_kind` values: `make_offer`, `book`, `schedule_visit`, `bookmark`.

Be accurate before being helpful. Stay inside Beebop's scope, preserve conversation continuity, and return only the schema object.

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


# --- Concierge response generator -------------------------------------------
#
CONCIERGE_PROMPT_VERSION = "concierge-v2.0"


def concierge_system_prompt() -> str:
    return """You are an experienced, knowledgeable real estate agent in Abuja, working for BeeBop.
The backend has already interpreted the seeker's intent and run the search. You turn its
results into a brief, warm, intelligent reply.

INPUTS
- user_message: the seeker's newest message.
- intent: the classified intent.
- results: sanitized listing objects (may be empty).
- differentiators: deterministic facts about how the results differ.
- context: brief prior-turn summary.
- property_answer: If answering a property question, factual metadata from the DB.
- area_answer: If answering an area question, factual knowledge base info.

RULES
1. Never invent or infer beyond these inputs. Never fabricate a listing.
2. Explain the results intelligently. Don't just dump them. Explain WHY they were selected based on the user's needs.
   Example: "I found 3 options. The first is closest to campus. The second is the cheapest."
3. If the user asked a question (property or area), answer it directly using the provided factual inputs.
4. If there are NO results, be helpful. Never dead-end. The backend may have provided expanded results (e.g. higher budget, nearby area) — explain that gracefully.
   Example: "I couldn't find anything under 700k near Nile. However, I found these 3 options under 900k."

VOICE
Premium, proactive, like a knowledgeable property advisor. Natural conversational English.
No slang, no hype words. State verification exactly as the data gives it. Render Naira exactly as provided.
Keep the reply graspable at a glance: 2-4 sentences max. Return only the reply text.
"""


def concierge_user_message(*, payload_json: str) -> str:
    return f"INPUTS:\n{payload_json}\n"


CONCIERGE_RESPONSE_SCHEMA: dict[str, Any] = {
    "title": "BeebopConciergeReply",
    "type": "object",
    "additionalProperties": False,
    "required": ["reply"],
    "properties": {
        "reply": {"type": "string"},
    },
}


RESPONSE_SCHEMA: dict[str, Any] = {
    "title": "BeebopIntentResponse",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "intent",
        "parameters",
        "missing_parameter_prompt",
        "reference_resolution",
        "confidence"
    ],
    "properties": {
        "intent": {
            "type": "string",
            "enum": [
                "search",
                "clarification",
                "compare_listings",
                "ask_property_question",
                "ask_area_question",
                "information",
                "transactional"
            ],
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "medium", "low"],
        },
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "listing_category",
                "raw_query",
                "locations",
                "institution",
                "amenities",
                "min_price",
                "max_price",
                "bedroom_count",
                "verification_tiers",
                "duration_years",
                "urgency",
                "occupancy",
                "property_type",
                "furnished",
                "pet_friendly",
                "gender_preference"
            ],
            "properties": {
                "listing_category": {
                    "type": ["string", "null"],
                    "enum": ["off_campus", "short_let", "rent", "sales"],
                },
                "raw_query": {"type": "string"},
                "locations": {"type": "array", "items": {"type": "string"}},
                "institution": {"type": ["string", "null"]},
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
                "occupancy": {
                    "type": ["string", "null"],
                    "enum": ["shared", "single", "any"],
                },
                "property_type": {"type": ["string", "null"]},
                "furnished": {"type": ["boolean", "null"]},
                "pet_friendly": {"type": ["boolean", "null"]},
                "gender_preference": {
                    "type": ["string", "null"],
                    "enum": ["female", "male"],
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
