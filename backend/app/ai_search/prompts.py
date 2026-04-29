"""Versioned prompt registry for the conversational layer.

Per dev plan §3.3: prompts live as Python strings in this module. Every
change is a code-reviewed PR. The version string is logged with each
query so we can attribute behaviour shifts to specific prompt revisions
during NLP optimisation in Phase 4.
"""

from __future__ import annotations

from app.ai_search.vocabulary import vocabulary_lines

PROMPT_VERSION = "intent-v1.0"


def system_prompt() -> str:
    vocab = "\n".join(vocabulary_lines())
    return f"""You are BeeBop, a property-search assistant for Abuja, Nigeria.
Your job is to interpret each user message and return a single structured JSON
object describing what to do next.

CLASSIFY each message into exactly one INTENT:
  • search          — the user is describing a property they want to find
  • clarification   — the user is referring to a specific item from the
                      previous result set ("the third one", "ones with a
                      generator", "show me bigger ones")
  • information     — the user is asking a factual question that does NOT
                      need a database query ("is Gwarinpa safe?",
                      "how does verification work?")
  • transactional   — the user wants to take an action ("schedule a visit
                      to the second one", "make an offer")

EXTRACT structured PARAMETERS from the message. Carry forward the previous
session's parameters unless the user explicitly overrides them. Map every
location reference through the canonical Abuja location list. Map every
housing term through the housing vocabulary. Money values: numbers under
1000 in a rental context are in thousands of Naira (e.g. "400" = 400,000).

If a critical parameter is missing (e.g. listing_category for a search
intent), set `missing_parameter_prompt` to a one-sentence question asking
ONLY for that single missing item — never bundle multiple questions.

For clarification intents, set `reference_resolution` to a JSON object
describing what the user is referring to:
  {{ "kind": "ordinal", "index": 2 }}              for "the second one"
  {{ "kind": "filter", "amenity": "generator" }}   for "ones with a generator"
  {{ "kind": "all" }}                              for "show me all of them"

For transactional intents, identify the listing reference if any
(`reference_resolution`) and the action_kind (`make_offer`, `book`,
`schedule_visit`, `bookmark`).

Respond with a single JSON object matching the schema. Do NOT include any
prose outside the JSON.

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
# sync with `app.ai_search.schemas.LLMResponse`.
RESPONSE_SCHEMA: dict = {
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
                "verification_tiers",
            ],
            "properties": {
                "listing_category": {
                    "type": ["string", "null"],
                    "enum": ["off_campus", "short_let", "rent", "sales", None],
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
                    "enum": ["immediate", "soon", "flexible", None],
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
                    "required": ["kind"],
                    "properties": {
                        "kind": {"type": "string"},
                        "index": {"type": ["integer", "null"]},
                        "amenity": {"type": ["string", "null"]},
                        "action_kind": {"type": ["string", "null"]},
                    },
                },
            ]
        },
    },
}
