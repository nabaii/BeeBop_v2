# Sprint 3 — Seeker Discovery (Browse & Listing Page)

Weeks 8–9. Development Plan v3.0 §7.3.

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| Main page layout | ✅ | Left sidebar (collapsible to icon rail) with category links + New Chat. Centred Ask Beebop input with suggestion pills. Featured verified-listings carousel on the landing body. No Chats history section (per v2.0 session-only change). |
| Four category browse pages | ✅ | `/browse/{off-campus,short-let,rent,sales}`. Left filter panel + listings grid. Shared filters (location multi-select, verification tiers, amenities, price range, sort). Verification default pre-checks Fully Verified + Doc Verified. |
| Category-specific filters | ✅ | Off-campus (unit kinds, available now; institution + gender silently applied from profile). Short-let (check-in/out, guests, min stay, instant-booking, min rating). Rent (bedroom pills, property type, furnishing, payment structure, available from). Sales (bedroom pills, property type, development status, title type). |
| Map view toggle | ✅ | Abuja pin map with verification-tier colour coding (teal/blue/grey). Click pin → navigates to listing. Google Maps used when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set; graceful list-style fallback otherwise. All active filters apply to the pin set (shared state). |
| Listing page — core sections | ✅ | Hero grid + room-grouped gallery. Inspector walkthrough photos labelled as a separate "Beebop Verified Walkthrough" section. Title/subtitle/district. Description with Read more. Amenities list with `Confirmed` indicator support (populated on physical-badge issuance in Sprint 7). Approximate location map panel. |
| Listing page — fixed CTA bar | ✅ | Type-specific: short-let date picker with dynamic weekend-uplifted price; rent duration selector + Make offer; sales Make offer; off-campus Enquire with starting price. Fixed to viewport bottom. Unauthenticated users see "Sign in to continue" with `return_to` preserved. |
| Valuation report — gated | ✅ | Locked preview for anonymous visitors (blurred skeleton + sign-in CTA). For signed-in users: area scores, inspector note, report date (placeholder shape — real generator output arrives Sprint 7). **No FMV indicator, no comparable listings** per v2.0. |
| Bookmark / save listing | ✅ | Bookmark toggle on every listing card and on the detail page. Anonymous clicks redirect to `/login?return_to=...`. Seeker dashboard shows saved listings; status-based `Unavailable` badge for let/sold/delisted (listing stays in the list — never auto-removed). |

## Files added / modified

### Backend
- `app/models/bookmark.py` — `(user_id, listing_id)` join with unique constraint.
- `app/search/schemas.py` — `SharedFilters` + per-category extension models, `SearchResponse`, `PublicListingDetail`, `ValuationReport` (area scores + note + date only).
- `app/search/service.py` — category-scoped query builder, JSONB `cast`-based filters, verification-tier composition, pagination.
- `app/search/routes.py` — `GET /search/{category}`, `GET /public/listings/{id}`, `GET /public/featured`. Silent application of seeker profile (institution, gender) for off-campus. Valuation report returned only for authenticated + doc-verified+ statuses.
- `app/bookmarks/routes.py` — idempotent save, delete-by-pair, list-saved.
- `app/main.py` — wired `search_router` and `bookmarks_router`.

### Frontend
- `src/lib/search.ts` — typed client (query-string serialiser handles arrays + booleans), `PublicListingDetail`, `ValuationReport`.
- `src/lib/bookmarks.ts` — save / unsave / list.
- `src/lib/api.ts` — added `api.{get,post,patch,delete}` convenience wrapper used across all sprints.
- `src/components/browse/filter-panel.tsx` — shared filter panel (location chips, verification tiers, price, amenities from backend vocabulary, sort).
- `src/components/browse/results-grid.tsx` — paginated grid, empty state, per-card bookmark button.
- `src/components/browse/map-view.tsx` — Google Maps embed with circle markers coloured per tier; graceful list fallback when no key.
- `src/components/browse/category-browse.tsx` — generic shell used by all four category pages.
- `src/components/browse/category/{off-campus,short-let,rent,sales}-filters.tsx` — per-category filter fields.
- `src/components/browse/bookmark-button.tsx` — save toggle with anonymous-to-login redirect.
- `src/app/browse/{off-campus,short-let,rent,sales}/page.tsx` — concrete pages.
- `src/components/listing/gallery.tsx` — hero grid + room-grouped horizontal strips + inspector walkthrough section.
- `src/components/listing/amenities-display.tsx` — read-only list with Confirmed pill.
- `src/components/listing/cta-bar.tsx` — fixed bottom bar with category-specific controls.
- `src/components/listing/valuation-report.tsx` — locked panel for anonymous; area-scores + inspector-note layout for signed-in.
- `src/app/listings/[id]/page.tsx` — public detail page consuming all of the above.
- `src/components/main-sidebar.tsx`, `src/components/chat-input-stub.tsx`, `src/components/featured-carousel.tsx`, `src/app/page.tsx` — main-page shell.
- `src/app/dashboard/seeker/page.tsx` — saved listings grid with Unavailable badge.

### Tests
- `tests/test_search_filters.py` — verification-tier clause composition (fully_verified also matches let/sale_agreed), combined tiers, default pre-check, all filter default values. Integration suite (real Postgres) lands with the CI test container.

## Design decisions

- **Debounced filter changes, not a search button.** 300ms debounce on filter state keeps the UX conversational and matches the sidebar-plus-grid pattern expected on the main page in Sprint 13.
- **Silent off-campus filters (institution, gender) applied server-side.** The seeker profile is the source of truth — the API layers them in at request time per §7.3 rather than trusting any client-provided value. Gender filtering matches rooms tagged with the seeker's gender OR `ANY` (self-contain).
- **Valuation report placeholder.** The endpoint returns a `ValuationReport | None` shape today; Sprint 7 swaps in the Claude-generated content without any client change. This keeps the panel's locked/unlocked UX testable now.
- **Map fallback without an API key.** We render a styled list with verification-tier colour chips so the flow is demoable end-to-end. When the key is set, the same code renders a real Google Maps pin map — no conditional in the callers.
- **Bookmarks never auto-remove.** Unavailable listings stay in the seeker's list with a visible marker per §7.3. Keeps history legible; user removes manually.

## Known gaps / deferred

- Real-time listing availability (short-let date conflicts) won't filter until the Booking table is populated in Sprint 11. Date-range inputs are accepted today but only `cursor` into the availability query once bookings exist.
- Rating signal in search is stubbed (`rating=null`). Real aggregate plus `highest_rated` sort land in Sprint 4 once the Review feed exists.
- Main page results window (three-state collapsed/expanded/minimised) belongs to Sprint 13 alongside the Claude pipeline. The current chat input routes to the Rent browse page with `?q=...` so user intent still surfaces.
- Public listing page is rendered as a client component for Sprint 3. The SSR/SEO migration lands alongside the rating-system sprint — the API shape is already SSR-friendly.
- Google Maps Places API integration (address lookup) remains a Sprint 3 stretch item — the current map is display-only.

## External dependencies

Public search works entirely without external credentials. Map is progressive-enhancement: with a Google Maps key it renders pins; without one it falls back cleanly.
