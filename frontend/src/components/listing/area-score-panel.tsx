'use client';

import { Activity, CalendarDays } from 'lucide-react';

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
    <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">Area infrastructure</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Shared neighbourhood scores published independently of badge status.
          </p>
        </div>
        {areaScore.last_assessed_at && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {new Date(areaScore.last_assessed_at).toLocaleDateString('en-NG')}
          </span>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-2xl bg-white p-4 shadow-sm">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Activity className="h-4 w-4 text-brand-600" aria-hidden />
              {key.replaceAll('_', ' ')}
            </dt>
            <dd className="mt-3 text-xl font-bold text-slate-950">{value} / 5</dd>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.min(100, Math.max(0, (value / 5) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
