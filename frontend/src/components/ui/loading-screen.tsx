'use client';

import { useEffect, useState } from 'react';

import { BeebopMark } from '@/components/brand/beebop-logo';

/**
 * Full-screen loading state — the single, consistent loader shown while a
 * page's primary data is being fetched (e.g. opening a listing or a unit
 * type). Keep all page-level "Loading…" states on this component so the
 * experience is identical everywhere.
 *
 * The triad spins as the loader: its rotational symmetry was designed to spin
 * cleanly (per the Brand Spec), so the logo doubles as the brand's spinner.
 *
 * If the fetch is still running after a few seconds it's almost certainly a
 * free-tier cold start (see `rawFetchResilient` in lib/api), so we surface a
 * reassuring note rather than leave the user staring at a silent spinner.
 */
const COLD_START_HINT_MS = 6_000;

export function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaking(true), COLD_START_HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center text-slate-500">
        <BeebopMark size={32} className="animate-spin [animation-duration:1.6s]" decorative />
        <span className="text-sm font-medium">{waking ? 'Waking up the server…' : message}</span>
        {waking && (
          <span className="text-xs text-slate-400">
            The first visit after a quiet spell can take up to a minute. Hang tight — we&apos;re
            getting things ready.
          </span>
        )}
      </div>
    </main>
  );
}
