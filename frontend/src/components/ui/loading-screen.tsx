/**
 * Full-screen loading state — the single, consistent loader shown while a
 * page's primary data is being fetched (e.g. opening a listing or a unit
 * type). Keep all page-level "Loading…" states on this component so the
 * experience is identical everywhere.
 */
export function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-2 text-slate-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </main>
  );
}
