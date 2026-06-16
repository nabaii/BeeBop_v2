import { BeebopMark } from '@/components/brand/beebop-logo';

/**
 * Full-screen loading state — the single, consistent loader shown while a
 * page's primary data is being fetched (e.g. opening a listing or a unit
 * type). Keep all page-level "Loading…" states on this component so the
 * experience is identical everywhere.
 *
 * The triad spins as the loader: its rotational symmetry was designed to spin
 * cleanly (per the Brand Spec), so the logo doubles as the brand's spinner.
 */
export function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <BeebopMark size={32} className="animate-spin [animation-duration:1.6s]" decorative />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </main>
  );
}
