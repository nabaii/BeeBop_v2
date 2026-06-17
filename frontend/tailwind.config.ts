import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm surface system — the amber "belongs" because the whole surface
        // is warmed to meet it. These are the named palette; prefer them over
        // raw slate/stone so the warmth can't drift back to clinical gray.
        ink: {
          DEFAULT: '#231A0F', // Hive Black — all primary text (was black/slate-900)
          muted: '#6F6253',   // warm secondary text (replaces slate-500/600)
          soft: '#9C8E79',    // warm placeholder / decorative (replaces slate-400)
        },
        paper: '#FCFAF6',     // app background — barely off-white, perceptibly warm
        nectar: '#FBEFD8',    // pale honey — user bubbles + chip hover (the branded move)
        hairline: '#EFE7DA',  // 1px borders that replace decorative drop shadows
        verified: '#1D4ED8',  // Verified Blue — verification ONLY, nothing else
        growth: '#15803D',    // Growth Green — availability / success ONLY
        // Verification badge palette per dev plan §7.3 (three meanings within
        // the verification domain). Blue aligned to the reserved Verified Blue.
        verification: {
          fully: '#0d9488',   // teal — fully verified
          doc: '#1D4ED8',     // Verified Blue — doc verified
          unverified: '#94a3b8', // grey — unverified
        },
        // Honey — the primary action color (send button, active tab, CTAs).
        // Deeper/richer than the old amber for better contrast on white.
        // Always paired with text-ink, never white (≈7:1 vs ≈2:1).
        brand: {
          DEFAULT: '#F0980F', // Honey
          50: '#FEF6E8',
          100: '#FBEFD8',     // = Nectar
          500: '#F0980F',
          600: '#D77F08',
          700: '#B0640A',
          900: '#5E3A0C',
        },
      },
      fontFamily: {
        // Body face — inherited app-wide via `font-sans` on <body>.
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        // Display face — opt in with `font-display` on hero/headings/listing names.
        display: ['var(--font-display)', 'var(--font-body)', 'system-ui', 'sans-serif'],
      },
      // Motion: enter-only, no loops. Always opt in via `motion-safe:` so
      // prefers-reduced-motion users get the static end state for free.
      keyframes: {
        // Message bubbles + suggestion chips: subtle fade-and-rise.
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Hero question on page load: slightly larger travel, slower.
        'fade-up-hero': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        // `both` holds the 0% (hidden) state through any animation-delay, so
        // staggered chips don't flash before their turn.
        'fade-up': 'fade-up 180ms ease-out both',
        'fade-up-hero': 'fade-up-hero 420ms ease-out both',
      },
    },
    // The Beebop type scale — five sizes, used everywhere, no exceptions.
    // Declared at theme root (not extend) so it REPLACES Tailwind's default
    // ramp: text-4xl and larger no longer exist, and the legacy aliases below
    // (xs…3xl) are snapped onto the scale so old class names can't drift off it.
    // Line-height + letter-spacing are baked in so they're never re-improvised.
    fontSize: {
      caption: ['0.8125rem', { lineHeight: '1.4' }],                            // 13 — chips, captions, eyebrows
      body: ['0.9375rem', { lineHeight: '1.5' }],                               // 15 — messages, body (never below 14)
      title: ['1.0625rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],    // 17 — card titles, listing names
      section: ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],  // 22 — section heads
      hero: ['2.125rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],     // 34 — the hero question

      // Legacy aliases → snapped onto the five sizes above (Phase 2 remap).
      xs: ['0.8125rem', { lineHeight: '1.4' }],                                 // → caption 13
      sm: ['0.9375rem', { lineHeight: '1.5' }],                                 // → body 15
      base: ['0.9375rem', { lineHeight: '1.5' }],                               // → body 15
      lg: ['1.0625rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],       // → title 17
      xl: ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],       // → section 22
      '2xl': ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],    // → section 22
      '3xl': ['2.125rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],    // → hero 34
    },
  },
  plugins: [],
};

export default config;
