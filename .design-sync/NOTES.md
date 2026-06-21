# Beebop Design-Sync — NOTES

Validation findings and known caveats for the DS bundle.
Maintained across re-syncs; each section documents a warn/info tag
from `package-validate.mjs` that is expected and does not need chasing.

---

## Known Warnings

### `[FONT_REMOTE]` — Brand fonts loaded from Google Fonts CDN

The DS bundle's `css-prelude.css` imports Bricolage Grotesque and Instrument
Sans from `fonts.googleapis.com`. This is **intentional**: the production app
self-hosts both faces via `next/font` (the CSS variables `--font-display` and
`--font-body` are injected at runtime). The bundle renders outside Next.js, so
Google Fonts is the correct fallback for preview cards. The validator reports
this as `[FONT_REMOTE]` — informational, not actionable.

### No `[RENDER_THIN]`, `[RENDER_BLANK]`, or `[GRID_OVERFLOW]` findings

All 8 components render cleanly in the render check:
- 0 errors, 0 blank, 0 thin, 0 placeholder, 0 fallback cards
- No grid overflow (no fixed/portal content in any preview)

---

## Component Coverage

| Group         | Components                            | Count |
|---------------|---------------------------------------|-------|
| brand         | BeebopLockup, BeebopMark              | 2     |
| actions       | Button                                | 1     |
| forms         | Input                                 | 1     |
| feedback      | ListingCardSkeleton, LoadingScreen, Skeleton | 3     |
| data-display  | Price                                 | 1     |
| **Total**     |                                       | **8** |

All 8 have authored previews (`.design-sync/previews/*.tsx`) — no floor cards.

---

## Build Pipeline

The DS is an app surface (Next.js + Tailwind), not a published library.
The build requires a two-step prepare phase (`.design-sync/prepare.mjs`):

1. **`entry.tsx`** — barrel re-exporting only the 8 scoped components from
   `cfg.componentSrcMap`, so esbuild bundles those rather than the entire app.
2. **`bundle.css`** — the app's Tailwind theme compiled to a real stylesheet
   via the DS-scoped `tailwind.config.ds.ts`, with the brand-font prelude
   prepended.

Both outputs land in `frontend/.ds-cache/` (gitignored).

Run order: `node .design-sync/prepare.mjs` → `node .ds-sync/resync.mjs …`

---

## Naira Formatting

The `Price` component uses `Intl.NumberFormat('en-NG', { style: 'currency',
currency: 'NGN' })`. The rendered prefix is `₦` (Unicode U+20A6). Preview
stories show ₦1,200,000 / ₦850,000 / ₦420,000 and a "Price on request"
fallback — all rendering correctly.
