# Sprint 13 - Conversational Search

## Status

Completed on May 1, 2026.

## Delivered

| Area | Status | Notes |
|------|--------|-------|
| Conversational search API | ✅ | Added `/ai-search/chat`, `/ai-search/sessions/{id}` delete/get, and `/ai-search/click`. Session state is Redis-backed and expires after inactivity. |
| Multi-turn session context | ✅ | Query parameters, last result IDs, and recent turns now persist per session via `app.ai_search.session_store`. "New chat" clears local state and deletes the backend session. |
| Intent handling | ✅ | Search, clarification, information, and transactional intents are handled through the Sprint 13 service layer. Clarifications like ordinal references and amenity follow-ups reuse prior context. |
| Ranking + fallback | ✅ | Conversational results are ranked with verification, rating, parameter match, recency, and light price weighting. Deterministic fallback keeps the flow usable when the live LLM is unavailable. |
| Homepage chat UX | ✅ | Replaced the main-page stub with the real conversational flow and the three-state results window (collapsed, expanded, minimized). |
| Browse-page handoff | ✅ | Chat-derived filters now seed the category browse pages through the shared search store. |

## Files added

- `backend/app/ai_search/service.py`
- `backend/app/ai_search/routes.py`
- `backend/tests/test_ai_search.py`
- `frontend/src/lib/ai-search.ts`
- `frontend/src/components/chat-search.tsx`

## Validation

- `python -m pytest tests/test_ai_search.py tests/test_health.py tests/test_search_filters.py`
- `python -m ruff check app/ai_search app/main.py tests/test_ai_search.py`
- `npm run typecheck`

## Notes

- The frontend typecheck also surfaced an unrelated `Button` variant mismatch in the trusted-agent visit page; that has been fixed so the repo returns to a passing state.
- Full-repo Python lint still contains legacy findings outside Sprint 13 scope. The new Sprint 13 backend files pass targeted Ruff checks.
