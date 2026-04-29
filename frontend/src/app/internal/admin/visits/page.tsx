'use client';

/** Admin visit queue. Manual agent assignment per dev plan §8.3. */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { visits, type AvailableAgent, type VisitQueueRow } from '@/lib/visits';

export default function AdminVisitsPage() {
  const [rows, setRows] = useState<VisitQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRow, setActiveRow] = useState<VisitQueueRow | null>(null);

  async function refresh() {
    try {
      setRows(await visits.adminQueue());
    } catch {
      setError('Could not load the visit queue.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="p-6 sm:p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Visit queue</h1>
          <p className="mt-1 text-sm text-slate-500">
            Auto-created when a seeker offer is accepted. Assign a trusted agent.
          </p>
        </div>
        {rows && (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
            {rows.length} active
          </span>
        )}
      </header>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows === null ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-500">No visits to assign.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Listing</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Agent</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.visit_id}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">
                      {r.listing_title}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      {r.listing_category.replace('_', ' ')}
                      {r.district ? ` · ${r.district}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-700">
                      {r.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(r.created_at).toLocaleDateString('en-NG')}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.assigned_agent_name ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'pending_assignment' ? (
                      <Button variant="secondary" onClick={() => setActiveRow(r)}>
                        Assign agent
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {r.assigned_at
                          ? `Assigned ${new Date(r.assigned_at).toLocaleString('en-NG')}`
                          : ''}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {activeRow && (
        <AssignAgentModal
          row={activeRow}
          onClose={() => setActiveRow(null)}
          onAssigned={async () => {
            setActiveRow(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function AssignAgentModal({
  row,
  onClose,
  onAssigned,
}: {
  row: VisitQueueRow;
  onClose: () => void;
  onAssigned: () => Promise<void>;
}) {
  const [agents, setAgents] = useState<AvailableAgent[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    visits
      .availableAgents(row.visit_id)
      .then((list) => {
        setAgents(list);
        if (list.length > 0) setSelected(list[0].id);
      })
      .catch(() => setError('Could not load agents.'));
  }, [row.visit_id]);

  async function assign() {
    setBusy(true);
    setError(null);
    try {
      await visits.assignAgent(row.visit_id, selected);
      await onAssigned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Assignment failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <header className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Assign agent</h2>
            <p className="mt-1 text-sm text-slate-500">{row.listing_title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="mt-4 space-y-3">
          {agents === null ? (
            <p className="text-sm text-slate-500">Loading agents…</p>
          ) : agents.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              No eligible agents — anyone who has previously inspected this listing
              is excluded by the role-separation rule.
            </p>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-700">Available trusted agents</span>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.operating_area ? ` · ${a.operating_area}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-slate-500">
            The agent has 2 hours to confirm or flag a conflict before this visit reverts to the queue.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void assign()} disabled={busy || !selected || agents?.length === 0}>
              {busy ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
