/**
 * Empty-state panel used by dashboard sections whose data source lands in
 * a later sprint (offers Sprint 8, agreements Sprint 10, bookings Sprint 11,
 * visits Sprint 9). Keeps the dashboard skeleton complete and signals
 * what's coming.
 */

interface Props {
  title: string;
  hint: string;
  comingIn?: string;
}

export function EmptyPanel({ title, hint, comingIn }: Props) {
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
      {comingIn && (
        <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">
          Coming in {comingIn}
        </p>
      )}
    </section>
  );
}
