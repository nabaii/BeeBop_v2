# Beebop Design Conventions

> Nigerian student housing marketplace — "Find your next home, the smart way."

## Brand Identity

Beebop is a warm, trustworthy platform that helps Nigerian university students
find verified accommodation. The visual language favours **clarity over
cleverness**: every screen should feel approachable, premium, and unmistakably
Beebop within the first second.

The brand mark is a stylised hive (three circles arranged in a triangular cluster)
rendered in the brand amber. The wordmark is set in **Bricolage Grotesque SemiBold**
at the title scale.

---

## Colour Palette

| Token           | Hex       | Role                                              |
|-----------------|-----------|----------------------------------------------------|
| `brand`         | `#F0980F` | Honey — primary action colour (CTAs, active tabs). Always paired with `text-ink`, never white. |
| `brand-600`     | `#D77F08` | Hover state for brand surfaces.                    |
| `brand-50`      | `#FEF6E8` | Faint honey wash — selected chips, row highlights. |
| `ink`           | `#231A0F` | Hive Black — all primary text.                     |
| `ink-muted`     | `#6F6253` | Warm secondary text (labels, captions).            |
| `ink-soft`      | `#9C8E79` | Warm placeholder / decorative text.                |
| `paper`         | `#FCFAF6` | App background — barely off-white, perceptibly warm. |
| `nectar`        | `#FBEFD8` | Pale honey — user bubbles, chip hover.             |
| `hairline`      | `#EFE7DA` | 1 px borders replacing decorative drop-shadows.    |
| `verified`      | `#1D4ED8` | Verified Blue — verification badges ONLY.          |
| `growth`        | `#15803D` | Growth Green — availability / success ONLY.        |

### Rules

- **Never use raw Tailwind slate/stone** — prefer the named `ink`, `paper`, `hairline`
  tokens so the warm tint can't drift back to clinical grey.
- Brand amber (Honey) has ≈ 7 : 1 contrast against `ink` on white, but only
  ≈ 2 : 1 against pure white text — **never set white text on a brand surface**.
- Semantic colours (`verified`, `growth`) are single-purpose. Do not reuse
  `verified` blue for generic links or `growth` green for decorative elements.

---

## Typography

Two faces, loaded via `next/font` (self-hosted, no CDN in production):

| CSS variable       | Family                | Use                                        |
|---------------------|-----------------------|--------------------------------------------|
| `--font-display`    | Bricolage Grotesque   | Hero headings, section heads, the wordmark |
| `--font-body`       | Instrument Sans       | Everything else — body, UI, labels         |

### Type Scale (5 sizes, no exceptions)

| Name      | Size    | Line-height | Letter-spacing | Tailwind class  |
|-----------|---------|-------------|----------------|-----------------|
| `caption` | 13 px   | 1.4         | —              | `text-caption`  |
| `body`    | 15 px   | 1.5         | —              | `text-body`     |
| `title`   | 17 px   | 1.3         | −0.01 em       | `text-title`    |
| `section` | 22 px   | 1.2         | −0.015 em      | `text-section`  |
| `hero`    | 34 px   | 1.15        | −0.02 em       | `text-hero`     |

Legacy aliases (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`,
`text-2xl`, `text-3xl`) are remapped onto these five sizes. No size outside
this scale should appear in production.

---

## Spacing & Radius

- **Grid**: 4 px base unit. Common stops: 4, 8, 12, 16, 20, 24, 32, 48 px.
- **Default border-radius**: `rounded-lg` (8 px) for cards, buttons, inputs.
  Chips use `rounded-full`; the app chrome itself has no rounding.
- **Elevation**: Beebop avoids drop-shadows. Depth is conveyed with `hairline`
  borders (1 px solid `#EFE7DA`) or subtle background shifts (paper → nectar).

---

## Motion

Enter-only animations, no loops. Always gated behind `motion-safe:` so users
with `prefers-reduced-motion` get the static end-state for free.

| Animation         | Duration | Use                                      |
|-------------------|----------|------------------------------------------|
| `fade-up`         | 180 ms   | Message bubbles, suggestion chips        |
| `fade-up-hero`    | 420 ms   | Hero question on initial page load       |

Fill-mode is `both` so staggered elements don't flash before their delay.

---

## Component Conventions

1. **`forwardRef` pattern** — every interactive primitive wraps `forwardRef`.
2. **`cn()` utility** — class merging via `clsx` + `twMerge`. Always use `cn()`
   to combine base classes with caller overrides; never raw template literals.
3. **Variant prop** — visual style variants are a single `variant` prop with a
   union type (`'primary' | 'secondary' | 'ghost' | 'danger'`), defaulting to
   `'primary'`.
4. **Tailwind-first** — styles are composed from utility classes in a `const`
   lookup, not CSS modules or inline styles.
5. **Naira currency** — use `<Price>` component or `Intl.NumberFormat('en-NG', {
   style: 'currency', currency: 'NGN' })`. Symbol is `₦`, always prefix.
   Whole naira by default (`maximumFractionDigits: 0`).

---

## File Structure

```
src/components/
  brand/       BeebopLogo (mark + lockup)
  ui/          Button, Input, Price, Skeleton, LoadingScreen
  listing/     Domain-specific listing components
```

All DS-synced components live under `ui/` or `brand/`.
