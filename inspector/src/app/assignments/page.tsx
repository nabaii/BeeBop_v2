'use client';

/**
 * Inspector assignments list. Each row links to the per-report assessment
 * page (which renders the briefing pack + form).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { RouteGuard } from '@/components/route-guard';
import { ApiError } from '@/lib/api';
import { inspector, type AssignmentRow } from '@/lib/inspector';

export default function AssignmentsPage() {
  return (
    <RouteGuard>
      <Inner />
    </RouteGuard>
  );
}

function Inner() {
  const [items, setItems] = useState<AssignmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    inspector
      .myAssignments()
      .then((rows) => !cancelled && setItems(rows))
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load assignments.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Assignments</h1>
        <p className="mt-1 text-sm text-slate-500">
          Properties assigned to you. Tap one to open the briefing pack and start the assessment.
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
              key={row.report_id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <Link
                href={`/assessment/${row.report_id}` as `/assessment/${string}`}
                className="block"
              >
                <header className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900">
                      {row.listing_title}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                      {row.listing_category.replace('_', ' ')} · {row.address_district ?? 'Abuja'}
                    </div>
                  </div>
                  <StatusPill status={row.status} />
                </header>
                {row.assigned_at && (
                  <div className="mt-2 text-xs text-slate-500">
                    Assigned {new Date(row.assigned_at).toLocaleDateString('en-NG')}
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

function StatusPill({ status }: { status: AssignmentRow['status'] }) {
  const colour = {
    assigned: 'bg-slate-100 text-slate-700',
    in_progress: 'bg-amber-100 text-amber-800',
    pending: 'bg-blue-100 text-blue-800',
    queried: 'bg-orange-100 text-orange-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
  }[status];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${colour}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
