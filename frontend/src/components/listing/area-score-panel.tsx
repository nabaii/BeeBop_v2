'use client';

import type { PublicAreaScore } from '@/lib/search';

interface Props {
  areaScore: PublicAreaScore | null;
}

export function AreaScorePanel({ areaScore }: Props) {
  if (!areaScore) return null;

  const entries = Object.entries(areaScore.scores ?? {}).filter(
    ([, value]) => typeof value === 'number',
  ) as [string, number][];

  if (entries.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Area infrastructure</h2>
          <p className="mt-1 text-sm text-slate-600">
            Shared neighbourhood scores published independently of badge status.
          </p>
        </div>
        {areaScore.last_assessed_at && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            Updated {new Date(areaScore.last_assessed_at).toLocaleDateString('en-NG')}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-lg border border-slate-200 p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {key.replaceAll('_', ' ')}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{value} / 5</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
