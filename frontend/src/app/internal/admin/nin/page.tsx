'use client';

/**
 * Manual NIN review queue. Landlords upload an ID image; admins eyeball it
 * here, then either Verify (sets nin_verified=true) or Reject with a note
 * (clears the upload so the landlord re-submits).
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { admin, type NinReviewQueueRow } from '@/lib/admin';

export default function NinReviewPage() {
  const [items, setItems] = useState<NinReviewQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<NinReviewQueueRow | null>(null);

  async function refresh() {
    try {
      const res = await admin.ninReviewQueue();
      setItems(res.items);
    } catch {
      setError('Could not load the queue.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="p-6 sm:p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">NIN review</h1>
          <p className="mt-1 text-sm text-slate-500">
            Landlords waiting for identity verification. Oldest first.
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
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Uploaded</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row) => (
                <tr key={row.user_id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.full_name}</td>
                  <td className="px-4 py-3 text-slate-700">{row.email}</td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
                    {row.role.replaceAll('_', ' ')}
                    {row.account_type ? ` · ${row.account_type}` : ''}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(row.uploaded_at).toLocaleString('en-NG')}
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
        <NinReviewModal
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

function NinReviewModal({
  row,
  onClose,
  onResolved,
}: {
  row: NinReviewQueueRow;
  onClose: () => void;
  onResolved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function approve() {
    setBusy('approve');
    setError(null);
    try {
      await admin.approveNin(row.user_id);
      await onResolved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not approve.');
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!note.trim()) {
      setError('A note is required to reject.');
      return;
    }
    setBusy('reject');
    setError(null);
    try {
      await admin.rejectNin(row.user_id, note.trim());
      await onResolved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reject.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{row.full_name}</h2>
            <p className="truncate text-sm text-slate-500">{row.email}</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            {/* Native img tag — Cloudinary URL is user-content scope. */}
            <img
              src={row.nin_document_url}
              alt={`${row.full_name}'s ID`}
              className="mx-auto max-h-[60vh] w-auto rounded object-contain"
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Uploaded {new Date(row.uploaded_at).toLocaleString('en-NG')}
          </p>

          <label className="mt-5 block text-sm">
            <span className="mb-1 block text-slate-700">Rejection note (required to reject)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              placeholder="Tell the landlord what to fix on resubmission."
            />
          </label>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="ghost" onClick={() => void reject()} disabled={busy !== null}>
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </Button>
          <Button onClick={() => void approve()} disabled={busy !== null}>
            {busy === 'approve' ? 'Verifying…' : 'Verify identity'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
