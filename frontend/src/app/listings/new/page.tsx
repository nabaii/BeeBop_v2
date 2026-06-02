'use client';

/**
 * Entry to listing creation — pick a category, then go straight to the
 * category-aware editor. The backend creates a DRAFT listing and returns
 * its id; we push to /listings/edit/[id].
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { LandlordAccessGate } from '@/components/landlord-access-gate';
import { Button } from '@/components/ui/button';
import { createListing, type ListingCategory } from '@/lib/listings';

const CATEGORIES: { value: ListingCategory; label: string; blurb: string }[] = [
  { value: 'rent', label: 'Rent', blurb: 'Annual or 2-year tenancy' },
  { value: 'sales', label: 'For sale', blurb: 'Outright sale' },
  { value: 'off_campus', label: 'Off-campus', blurb: 'Student accommodation' },
  { value: 'short_let', label: 'Short-let', blurb: 'Nightly stays' },
];

export default function NewListingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<ListingCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(category: ListingCategory) {
    setBusy(category);
    setError(null);
    try {
      const listing = await createListing(category);
      router.replace(`/listings/edit/${listing.id}`);
    } catch {
      setError('Could not start a new listing. Please try again.');
      setBusy(null);
    }
  }

  return (
    <LandlordAccessGate next="/listings/new" intent="create">
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Create a listing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Listings are free to upload. You pay only on a completed transaction.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={busy !== null}
              onClick={() => start(c.value)}
              className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-brand hover:bg-brand/5 disabled:opacity-60"
            >
              <div className="text-sm font-semibold text-slate-900">{c.label}</div>
              <div className="mt-1 text-xs text-slate-500">{c.blurb}</div>
              {busy === c.value && <div className="mt-2 text-xs text-brand">Creating…</div>}
            </button>
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-8">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </main>
    </LandlordAccessGate>
  );
}
