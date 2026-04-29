# Sprint 6 — Inspector Portal and PWA

Weeks 15–16. Development Plan v3.0 §8.1.

This sprint opens **Phase 2** (Verification, Transactions and Messaging).

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| **Inspector onboarding flow** | ✅ | Sprint 5 landed: OTP login, NIN verification, profile photo, conduct acknowledgement, route guard. All steps mandatory. |
| **Inspector assignment view** | ✅ | Sprint 5 landed: assignments list with status pills, briefing pack link. No access to unassigned listings. |
| **Property assessment form** | ✅ | Structured checklist: Identity/Existence (3 options + notes), Listing Accuracy (3 options + notes), Amenity Confirmation (dynamic per listed amenity: present/not confirmed/absent), Structural Condition (1–5 rating + notes). All fields required before submission. IndexedDB saves on every field change (500ms debounce). |
| **Infrastructure scoring form** | ✅ | Road condition, Electricity (NEPA/PHCN), Security, Proximity — each scored 1–5. Stored against GPS coordinates (area level). Independent "Save Area Score" button. Submittable independently of assessment. Offline queuing via IDB sync. |
| **Photo and video capture with metadata** | ✅ | Camera access via `<input type="file" capture="environment">`. GPS captured via browser Geolocation API per photo. Timestamp via `new Date().toISOString()`. Upload via presigned S3 URL with XHR progress indicator. Evidence registered server-side on completion. Upload continues in background. Offline-queued registration via IDB sync. |
| **GPS location marking** | ✅ | Google Maps embed with draggable `AdvancedMarkerElement`. Device GPS auto-suggest on load. Manual drag-to-adjust. Coordinates stored to 6 decimal places. Geolocation permission requested correctly. |
| **Report submission** | ✅ | Packages assessment, infrastructure scores, photos, GPS into atomic submission. Completion gate requires: checklist, infra score, GPS pin (photos optional). Confirmation screen shows submission reference. Inspector sees Pending status. Offline fallback queues submit to IDB. |
| **PWA offline capability** | ✅ | Service worker via next-pwa caches form shell and static assets. IndexedDB stores all form data offline. Background sync dispatches queued mutations (drafts, evidence, scores, submits) on reconnect. Sync status indicator visible at all times in app header (Offline/Syncing/Up to date/Error). |

## Files added

### Inspector PWA — Components

- `src/components/assessment/assessment-form.tsx` — Form orchestrator. Manages all section state, loads briefing pack + IDB draft, debounced auto-save (500ms → IDB + sync queue), section completion tracking, submit flow with confirmation.
- `src/components/assessment/briefing-section.tsx` — Read-only briefing pack display: listing details, cover photo, address, amenity list, listing photos grid. Collapsible section.
- `src/components/assessment/checklist-section.tsx` — Structured assessment: Identity/Existence (radio), Listing Accuracy (radio), Amenity Confirmation (dynamic ✓/?/✗ toggles), Structural Condition (1–5 rating). All with optional notes textarea.
- `src/components/assessment/infra-score-section.tsx` — Infrastructure scoring: 4 slider inputs (Road, Electricity, Security, Proximity) each 1–5. Independent save button. Stores against GPS cell. Offline-safe with queue fallback.
- `src/components/assessment/photo-capture-section.tsx` — Camera capture with GPS + timestamp metadata. Photo gallery with upload progress overlay. Per-item status (signing/uploading/registering/done/error). Remove capability.
- `src/components/assessment/gps-pin-section.tsx` — Google Maps with draggable marker. Auto-detects device GPS. 6-decimal-place coordinate display. Re-detect GPS button.
- `src/components/assessment/submit-section.tsx` — Completion checklist (✓/○ per section), inspector note textarea, submit button gated on all-required sections, confirmation screen with reference number.

### Inspector PWA — Utilities

- `src/lib/upload.ts` — Presigned S3 upload utility. Flow: signature → XHR PUT (with progress) → register evidence. Offline fallback queues registration to IDB.

### Inspector PWA — Page

- `src/app/assessment/[reportId]/page.tsx` — Assessment page (replaces stub). RouteGuard-wrapped, back navigation, wires AssessmentForm component.

### Dev dependencies

- `@types/google.maps` — TypeScript types for Google Maps JavaScript API.

## Files modified

- `src/app/assessment/[listingId]/` — **Removed.** Route renamed to `[reportId]` to match actual semantics (assignments page links via `report_id`).
- `src/app/assessment/[reportId` — **Removed.** Cleaned up malformed directory with missing bracket.

## Design decisions

- **Accordion pattern, not stepper.** Sections are collapsible but any can be opened at any time. Inspectors in the field need to jump between sections freely — a strict stepper would slow them down. Progress indicators per section header show what's done.
- **Auto-save on every change.** Every field change writes to IndexedDB immediately (debounced 500ms). This means the inspector never loses progress even if the browser crashes, the device loses power, or they navigate away. Server saves are enqueued to the sync queue so they dispatch when connectivity allows.
- **Independent infrastructure scoring.** Per the dev plan, infra scores are stored at the area level (GPS cell) not against the listing. The save button is independent of the main submit, so an inspector can save area scores without completing the full assessment. This is important for multi-listing areas.
- **Photos upload in background.** S3 uploads run immediately on capture. The presigned URL flow means the file goes directly from the device to S3 without routing through the backend. Evidence registration (recording metadata) is queued to IDB if the registration call fails.
- **XHR for upload progress.** `XMLHttpRequest` is used instead of `fetch()` because `fetch` doesn't support upload progress events. Each photo gets an individual progress overlay showing percent.
- **GPS metadata stored in upload record, not EXIF.** Per the dev plan, GPS and timestamp are captured programmatically via the browser Geolocation API and `Date`, not extracted from EXIF (which may be stripped or absent on many mobile browsers).
- **Completion gate is strict.** Submit is disabled until: checklist complete (all radio selections + all amenities assessed + structural rating), infrastructure score saved, GPS pin placed. Photos are marked optional in the gate (some properties may not require evidence), though the section is always available.
- **Offline-first form shell.** The assessment form loads the briefing pack from the API on mount but falls back to a local IDB draft if the API call fails. This means an inspector who opened the assignment while online can continue the assessment offline. The sync status indicator in the app shell header shows the current state at all times.

## External dependencies

- **Google Maps JavaScript API** — Used by `gps-pin-section.tsx` for the property pin map. Requires `NEXT_PUBLIC_GOOGLE_MAPS_KEY` environment variable. Already provisioned in Phase 0 (Google Maps Platform setup).
- **S3 presigned URLs** — Used by `upload.ts` for evidence uploads. Backend generates presigned URLs via existing `POST /inspector/reports/{id}/evidence/signature` endpoint.

## Build verification

```
✓ TypeScript: npx tsc --noEmit — 0 errors
✓ Next.js build: npx next build — Compiled successfully
  Route (app)                                 Size  First Load JS
  ├ ƒ /assessment/[reportId]               15.2 kB         121 kB
  ├ ○ /assignments                         2.72 kB         109 kB
  ├ ○ /login                               3.53 kB         106 kB
  └ ○ /onboarding                          4.55 kB         107 kB
```
