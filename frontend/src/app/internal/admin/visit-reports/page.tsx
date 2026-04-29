'use client';

/**
 * Admin visit-report review queue. Approve / Query / Flag controls.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  adminAgents,
  type VisitReportReviewDetail,
  type VisitReportReviewQueueRow,
} from '@/lib/agents';

type ActionKind = 'approve' | 'query' | 'flag';

export default function AdminVisitReportsPage() {
  const [items, setItems] = useState<VisitReportReviewQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<VisitReportReviewQueueRow | null>(null);

  async function refresh() {
    try {
      setItems(await adminAgents.visitReportQueue());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load queue.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="p-6 sm:p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Visit report review</h1>
          <p className="mt-1 text-sm text-slate-500">
            Submitted post-visit reports awaiting approval.
          </p>
        </div>
        {items && (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
            {items.length} pending
          </span>
        )}
      </header>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items === null ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-500">All caught up.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Listing</th>
                <th className="px-4 py-2">Agent</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row) => (
                <tr key={row.visit_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.listing_title}</div>
                    <div className="text-xs text-slate-500">
                      Seeker: {row.seeker_first_name ?? '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.agent_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.submitted_at ? new Date(row.submitted_at).toLocaleString('en-NG') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" onClick={() => setActive(row)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {active && (
        <Drawer
          row={active}
          onClose={() => setActive(null)}
          onResolved={async () => {
            setActive(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function Drawer({
  row,
  onClose,
  onResolved,
}: {
  row: VisitReportReviewQueueRow;
  onClose: () => void;
  onResolved: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<VisitReportReviewDetail | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminAgents
      .visitReportDetail(row.visit_id)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) =>
        !cancelled &&
        setError(err instanceof ApiError ? err.message : 'Could not load detail.'),
      );
    return () => {
      cancelled = true;
    };
  }, [row.visit_id]);

  async function run(action: ActionKind) {
    if (action !== 'approve' && !note.trim()) {
      setError('A note is required to query or flag.');
      return;
    }
    setBusy(action);
    setError(null);
    try {
      if (action === 'approve') await adminAgents.approve(row.visit_id, note.trim() || undefined);
      else if (action === 'query') await adminAgents.query(row.visit_id, note.trim());
      else await adminAgents.flag(row.visit_id, note.trim());
      await onResolved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {row.listing_title}
            </div>
            <div className="text-xs text-slate-500">{row.agent_name}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {!detail ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
              {JSON.stringify(detail.visit_report ?? {}, null, 2)}
            </pre>
          )}
        </div>
        <footer className="space-y-3 border-t border-slate-200 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">
              Note (required to query or flag)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void run('approve')} disabled={busy !== null}>
              {busy === 'approve' ? 'Approving…' : 'Approve & unlock'}
            </Button>
            <Button variant="secondary" onClick={() => void run('query')} disabled={busy !== null}>
              {busy === 'query' ? 'Sending…' : 'Query'}
            </Button>
            <Button variant="ghost" onClick={() => void run('flag')} disabled={busy !== null}>
              {busy === 'flag' ? 'Flagging…' : 'Flag listing'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
