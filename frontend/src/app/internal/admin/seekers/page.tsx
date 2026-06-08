'use client';

/**
 * Seeker insights — aggregate view of the optional self-reported profile
 * collected during seeker onboarding (age band, occupation, budget, area).
 * Read-only analytics; no PII is shown, only counts.
 */

import { useEffect, useState } from 'react';

import { admin, type CountBucket, type SeekerInsights } from '@/lib/admin';

const NAIRA = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

export default function SeekerInsightsPage() {
  const [data, setData] = useState<SeekerInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    admin
      .seekerInsights()
      .then((res) => !cancelled && setData(res))
      .catch(() => !cancelled && setError('Could not load seeker insights.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const completion =
    data && data.total_seekers > 0
      ? Math.round((data.profile_provided / data.total_seekers) * 100)
      : 0;

  const budgetRange =
    data && (data.avg_budget_min != null || data.avg_budget_max != null)
      ? `${data.avg_budget_min != null ? NAIRA.format(data.avg_budget_min) : '—'} – ${
          data.avg_budget_max != null ? NAIRA.format(data.avg_budget_max) : '—'
        }`
      : '—';

  return (
    <div className="p-6 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Seeker insights</h1>
        <p className="mt-1 text-sm text-slate-500">
          Self-reported profile data from onboarding. Optional fields — not every seeker answers.
        </p>
      </header>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {data === null && !error && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total seekers" value={data.total_seekers.toLocaleString('en-NG')} />
            <StatCard
              label="Completed profile"
              value={`${data.profile_provided.toLocaleString('en-NG')}`}
              sub={`${completion}% of seekers`}
            />
            <StatCard
              label="Gave a budget"
              value={data.budget_responses.toLocaleString('en-NG')}
            />
            <StatCard label="Avg budget range" value={budgetRange} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <BarCard title="Age range" buckets={data.age_bands} total={data.total_seekers} />
            <BarCard title="Occupation" buckets={data.occupations} total={data.total_seekers} />
            <BarCard
              title="Top preferred areas"
              buckets={data.preferred_areas}
              total={data.total_seekers}
              emptyHint="No areas submitted yet."
            />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function BarCard({
  title,
  buckets,
  total,
  emptyHint = 'No responses yet.',
}: {
  title: string;
  buckets: CountBucket[];
  total: number;
  emptyHint?: string;
}) {
  // Scale bars relative to the most common bucket so the chart fills the width.
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {buckets.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyHint}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {buckets.map((b) => {
            const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
            return (
              <li key={b.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-700">{b.label}</span>
                  <span className="ml-2 shrink-0 tabular-nums text-slate-500">
                    {b.count.toLocaleString('en-NG')} ({pct}%)
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.round((b.count / max) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
