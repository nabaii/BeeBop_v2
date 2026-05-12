'use client';

/**
 * Doc review queue. Sorted oldest first server-side.
 * Approve fires badge issuance. Query reverts to draft with a note. Reject
 * suspends the listing with a note. All three notify the landlord.
 */

import { useEffect, useState } from 'react';

import { DocumentViewer } from '@/components/admin/doc-viewer';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  admin,
  type AdminListingDetail,
  type DocReviewQueueRow,
} from '@/lib/admin';

type ActionKind = 'approve' | 'query' | 'reject';

export default function DocReviewQueuePage() {
  const [items, setItems] = useState<DocReviewQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<DocReviewQueueRow | null>(null);

  async function refresh() {
    try {
      const res = await admin.docReviewQueue();
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
          <h1 className="text-2xl font-semibold text-slate-900">Doc review queue</h1>
          <p className="mt-1 text-sm text-slate-500">Oldest first.</p>
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
                <th className="px-4 py-2">Landlord</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2">Docs</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row) => (
                <tr key={row.listing_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.title}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      {row.category.replace('_', ' ')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.landlord_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(row.submitted_at).toLocaleString('en-NG')}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.document_count}</td>
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
        <ReviewDrawer
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

function ReviewDrawer({
  row,
  onClose,
  onResolved,
}: {
  row: DocReviewQueueRow;
  onClose: () => void;
  onResolved: () => Promise<void>;
}) {
  const [listing, setListing] = useState<AdminListingDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [note, setNote] = useState('');
  const [viewing, setViewing] = useState<AdminListingDetail['documents'][number] | null>(null);

  useEffect(() => {
    let cancelled = false;
    admin
      .listingDetail(row.listing_id)
      .then((l) => !cancelled && setListing(l))
      .catch(() => !cancelled && setLoadError('Could not load this listing.'));
    return () => {
      cancelled = true;
    };
  }, [row.listing_id]);

  async function run(action: ActionKind) {
    if (action !== 'approve' && !note.trim()) {
      setActionError('A note is required to query or reject.');
      return;
    }
    setBusy(action);
    setActionError(null);
    try {
      if (action === 'approve') await admin.approve(row.listing_id, note.trim() || undefined);
      else if (action === 'query') await admin.query(row.listing_id, note.trim());
      else await admin.reject(row.listing_id, note.trim());
      await onResolved();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{row.title}</div>
            <div className="text-xs text-slate-500">{row.landlord_name}</div>
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
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {!listing && !loadError && <p className="text-sm text-slate-500">Loading…</p>}
          {listing && (
            <div className="space-y-5">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Description
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {listing.description}
                </p>
              </section>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Documents ({listing.documents.length})
                </h3>
                {listing.documents.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No documents uploaded.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {listing.documents.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium text-slate-900">{d.filename}</div>
                          <div className="text-xs text-slate-500">
                            {d.doc_type.replaceAll('_', ' ')} · {d.content_type}
                          </div>
                        </div>
                        <Button variant="secondary" onClick={() => setViewing(d)}>
                          View
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
        <footer className="space-y-3 border-t border-slate-200 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">
              Note (required to query or reject)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void run('approve')} disabled={busy !== null}>
              {busy === 'approve' ? 'Approving…' : 'Approve & issue badge'}
            </Button>
            <Button variant="secondary" onClick={() => void run('query')} disabled={busy !== null}>
              {busy === 'query' ? 'Sending…' : 'Query'}
            </Button>
            <Button variant="ghost" onClick={() => void run('reject')} disabled={busy !== null}>
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </Button>
          </div>
        </footer>
      </div>
      {viewing && (
        <DocumentViewer
          listingId={row.listing_id}
          document={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
