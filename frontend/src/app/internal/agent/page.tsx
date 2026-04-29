'use client';

/**
 * Agent portal home — visits sorted by scheduled date, then by assignment date.
 * Mobile-first per dev plan §13.2.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ApiError } from '@/lib/api';
import { agents, type AgentVisitRow } from '@/lib/agents';

export default function AgentVisitsPage() {
  const [items, setItems] = useState<AgentVisitRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    agents
      .myVisits()
      .then((rows) => !cancelled && setItems(rows))
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load visits.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Your visits</h1>
        <p className="mt-1 text-sm text-slate-500">
          Confirm assignments, run visits, and submit post-visit reports.
        </p>
      </header>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {items === null ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <p className="text-sm text-slate-600">No active assignments. Check back later.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((row) => (
            <li
              key={row.visit_id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <Link
                href={`/internal/agent/visits/${row.visit_id}` as `/internal/agent/visits/${string}`}
                className="block"
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900">
                      {row.listing_title}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                      {row.listing_category.replace('_', ' ')} ·{' '}
                      {row.address_district ?? 'Abuja'}
                    </div>
                  </div>
                  <StatusPill status={row.status} />
                </header>
                {row.scheduled_at && (
                  <div className="mt-2 text-xs text-slate-600">
                    Scheduled: {new Date(row.scheduled_at).toLocaleString('en-NG')}
                  </div>
                )}
                {row.agent_confirmation_deadline && row.status === 'agent_assigned' && (
                  <div className="mt-1 text-xs text-amber-700">
                    Confirm by {new Date(row.agent_confirmation_deadline).toLocaleString('en-NG')}
                  </div>
                )}
                {row.seeker_first_name && (
                  <div className="mt-1 text-xs text-slate-500">
                    Seeker: {row.seeker_first_name}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatusPill({ status }: { status: AgentVisitRow['status'] }) {
  const labels: Record<string, { label: string; colour: string }> = {
    agent_assigned: { label: 'Confirm needed', colour: 'bg-amber-100 text-amber-800' },
    scheduled: { label: 'Scheduled', colour: 'bg-emerald-100 text-emerald-800' },
    report_pending: { label: 'Report sent', colour: 'bg-blue-100 text-blue-800' },
    report_queried: { label: 'Report queried', colour: 'bg-orange-100 text-orange-800' },
  };
  const meta = labels[status] ?? {
    label: status.replaceAll('_', ' '),
    colour: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.colour}`}>
      {meta.label}
    </span>
  );
}
