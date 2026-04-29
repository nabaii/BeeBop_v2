'use client';

/**
 * In-portal document viewer modal. Uses a 15-min presigned GET URL — fresh
 * one fetched on every open, never stored beyond the modal lifetime.
 */

import { useEffect, useState } from 'react';

import { admin, type DocumentPresignedView } from '@/lib/admin';

interface Props {
  listingId: string;
  document: { id: string; filename: string; doc_type: string; content_type: string };
  onClose: () => void;
}

export function DocumentViewer({ listingId, document: doc, onClose }: Props) {
  const [view, setView] = useState<DocumentPresignedView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    admin
      .documentUrl(listingId, doc.id)
      .then((v) => !cancelled && setView(v))
      .catch(() => !cancelled && setError('Could not fetch document URL.'));
    return () => {
      cancelled = true;
    };
  }, [listingId, doc.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{doc.filename}</div>
            <div className="text-xs text-slate-500">
              {doc.doc_type.replaceAll('_', ' ')} · {doc.content_type}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close viewer"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-hidden bg-slate-50">
          {error && <p className="p-6 text-sm text-red-600">{error}</p>}
          {!view && !error && <p className="p-6 text-sm text-slate-500">Loading…</p>}
          {view && doc.content_type === 'application/pdf' && (
            <iframe title={doc.filename} src={view.url} className="h-full w-full" />
          )}
          {view && doc.content_type.startsWith('image/') && (
            <div className="flex h-full items-center justify-center p-4">
              <img src={view.url} alt={doc.filename} className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
