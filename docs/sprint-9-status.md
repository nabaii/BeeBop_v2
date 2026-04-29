# Sprint 9 — Agent Workflow and Visit Management

Weeks 21–22. Development Plan v3.0 §8.4.

## Acceptance criteria — coverage

| Story | Status | Notes |
|-------|--------|-------|
| **Trusted agent onboarding** | ✅ | `POST /internal/admin/agents` creates a `User(role=TRUSTED_AGENT)` and dispatches a WhatsApp OTP invitation. Activation reuses the inspector gate (NIN + photo + conduct ack) — `is_activation_complete()` and the `/users/me/verify-nin` endpoint already accept the trusted-agent role. |
| **Agent portal — visit schedule** | ✅ | `GET /agent/visits` returns active assignments sorted by scheduled date (then by assignment date), each with a status pill, deadline, and seeker first name. Mobile-first layout (single column, large tap targets). |
| **Briefing pack** | ✅ | `GET /agent/visits/{id}/briefing` returns address + GPS + listing photos + listed amenities + seeker first name + verification status + 6-line conduct reminder list. Photos accessible inline; GPS opens Google Maps. |
| **Confirm assignment / flag conflict** | ✅ | `POST /agent/visits/{id}/confirm` accepts `confirmed=true` with `scheduled_at` (must be future) or `confirmed=false` with a conflict reason. Conflict path returns the visit to `PENDING_ASSIGNMENT` and notifies the seeker. |
| **Post-visit report — agent** | ✅ | `POST /agent/visits/{id}/report` accepts visit-confirmation block (occurred / access issues / conduct issues + notes) plus property-observations block (amenity matrix vs listing, discrepancies, free-text). Atomic — entire payload persisted to `Visit.visit_report` JSONB. Status moves to `REPORT_PENDING`. |
| **Admin visit-report review** | ✅ | `GET /internal/admin/visit-reports` queue. Approve → `COMPLETED` + `visit_report.approved` notification (unlocks seeker's post-visit offer flow per dev plan §13.4). Query → `REPORT_QUERIED` returns to agent with note. Flag → also marks complete but knocks the listing back to `LIVE_UNVERIFIED` for admin reassessment. |
| **Visit cancellation (any party)** | ✅ | `POST /visits/{id}/cancel` (seeker / landlord / admin path) and `POST /agent/visits/{id}/cancel` both go through the same `cancel_visit` service. `Visit.cancelled_by` (`SEEKER` / `LANDLORD` / `AGENT` / `ADMIN`), `cancelled_by_user_id`, `cancellation_reason`, `cancelled_at` all persisted. Notifies all other parties via `visit.cancelled` template (email + WhatsApp + in-app). Listing remains active — visit row marked CANCELLED so the seeker can submit a new offer that triggers a fresh visit request. |
| **Role separation** | ✅ | Already enforced in Sprint 8's `list_available_agents` (excludes anyone with an inspection on this listing). Service-layer `assign_agent` re-checks at assignment time. The conflict surfaces server-side with `role_separation_violation`; the admin UI's available-agents dropdown never shows them in the first place. |

## Files added / modified

### Backend
- `app/models/_enums.py` — added `VisitStatus.REPORT_PENDING`, `REPORT_QUERIED`, `VisitReportOutcome` enum, `VisitCancelledBy` enum.
- `app/models/visit.py` — added `visit_report_reviewed_at`, `visit_report_reviewed_by_id`, `visit_report_review_note`, `cancelled_by`, `cancelled_by_user_id`.
- `app/agents/__init__.py`, `app/agents/schemas.py`, `app/agents/service.py`, `app/agents/routes.py` — full agent + admin-side surface (invite, list, briefing, confirm, post-visit report, cancel, admin queue/detail/approve/query/flag). Agent activation gate **reuses** `app.inspector.service.is_activation_complete` so a single source of truth governs both field roles.
- `app/notifications/templates.py` — added `visit.confirmed` (email + WhatsApp + in-app), `visit.cancelled` (email + WhatsApp + in-app), `visit_report.approved` (email + in-app), `visit_report.queried` (in-app only — internal nudge).
- `app/main.py` — wired `agents_router`, `agents_cancel_router`, `admin_agents_router`.
- `tests/test_agent_visits.py` — invariant tests for conduct reminders coverage and payload schemas.

### Frontend
- `src/lib/agents.ts` — typed wrappers for the agent portal AND the admin visit-report endpoints + admin agent invite/list.
- `src/app/internal/agent/layout.tsx` — `RouteGuard roles={['trusted_agent']}` (sits inside the parent `/internal/layout.tsx` which permits admin + trusted_agent).
- `src/app/internal/agent/page.tsx` — visits list with status pills + confirmation deadlines + scheduled date.
- `src/app/internal/agent/visits/[id]/page.tsx` — single-page visit detail with collapsible briefing pack, Confirm/Conflict card (when `agent_assigned`), Post-Visit Report form (when `scheduled` or `report_queried`) with amenity-observation matrix sourced from the listing, Cancel button.
- `src/app/internal/admin/visit-reports/page.tsx` — admin queue + side drawer with approve/query/flag controls and the raw `visit_report` JSONB payload pretty-printed for review.
- `src/app/internal/admin/agents/page.tsx` — agents roster + inline invite form.
- `src/components/admin/admin-shell.tsx` — added `Visit reports` and `Trusted agents` nav entries.

## Design decisions

- **Agent activation reuses the inspector gate.** Same NIN + photo + conduct rules. Using a single helper means a future tightening (e.g. mandatory area confirmation field) lifts both roles in one place.
- **Conduct reminders live in code, not in the database.** They're authoritative copy from the dev plan; storing them as a Python list means any change is a code-reviewed PR, not an admin action.
- **Visit cancellation never auto-deletes the row.** Cancellation history is preserved with `cancelled_by` (enum) + `cancelled_by_user_id` (FK) + reason. The next time the seeker offers, a fresh `Visit` row is created on acceptance.
- **Conflict-flagged visits return to admin queue, not auto-reassigned.** Per dev plan §8.4 the admin selects manually — no auto-assignment engine. The flagged reason is captured in `Visit.cancellation_reason` so the admin sees context when reassigning.
- **Flag (admin) marks the listing as `LIVE_UNVERIFIED`.** This drops the verification badge gating until admin re-runs doc review. Avoids creating a separate "under_review" state for what is operationally already a flag-and-investigate path.

## Known gaps / deferred

- **Agent activation onboarding UI** lives at the same `/onboarding`-style flow used by inspectors but on the agent portal. The current page is opinionated for inspectors; a slim agent variant ships in Sprint 10's pre-launch polish since the inspector PWA is the offline-critical path.
- **Visit re-open logic** — when a seeker submits a new offer post-cancellation, `submit_offer` recomputes `requires_visit_before_acceptance` against `_completed_visit_exists`. Cancelled visits don't satisfy that lookup, so a fresh visit request is correctly created on the next acceptance.
- **Landlord-side visit panel** still reuses the existing Sprint 5 stub on the landlord dashboard. Read-only data is available via `GET /visits/listing/{id}` (Sprint 8); a richer panel can land any time without backend changes.
- **Seeker-side visit-status display** on the offer thread already shows the `Visit pending agent assignment` banner from Sprint 8. A live "scheduled at" line lands when the seeker dashboard offer card joins to the visit table — small frontend addition deferred to Sprint 10's polish.

## External dependencies

No new external services. New WhatsApp templates (`visit_confirmed`, `visit_cancelled`) need to be submitted alongside the Sprint 8 batch in Meta Business Manager — already covered in the Phase 0 founder-action checklist.
