'use client';

/**
 * Student PMS index — lists off-campus listings owned by the user. Click
 * through to the per-listing inventory PMS at /dashboard/student/[id].
 */

import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { listMyListings, type ListingView } from '@/lib/listings';

export default function StudentIndexPage() {
  const [listings, setListings] = useState<ListingView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyListings()
      .then((all) => {
        if (cancelled) return;
        setListings(all.filter((l) => l.category === 'off_campus'));
      })
      .catch(() => !cancelled && setError('Could not load listings.'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 sm:p-10">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Student accommodation PMS</h1>
        <p className="mt-1 text-sm text-slate-500">
          Inventory, occupancy, and gender breakdown per off-campus listing.
        </p>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {listings === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <p className="text-sm text-slate-600">No off-campus listings yet.</p>
          <Link
            href="/listings/new"
            className="mt-3 inline-block text-sm text-brand underline"
          >
            Create one
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {listings.map((l) => (
            <li key={l.id}>
              <Link
                href={`/dashboard/student/${l.id}` as Route}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {l.title ?? 'Untitled'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {l.district ?? 'Abuja'} · {l.status.replaceAll('_', ' ')}
                  </div>
                </div>
                <span className="text-xs text-brand">Open PMS →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
