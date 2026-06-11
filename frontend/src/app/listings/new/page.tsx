'use client';

/**
 * Entry to listing creation — pick a category, confirm, then go straight to
 * the category-aware editor. The backend creates a DRAFT listing and returns
 * its id; we push to /listings/edit/[id].
 *
 * Selection is explicit: tapping a card only *selects* it (nothing is
 * pre-selected), and a separate Continue action performs the create. This
 * prevents an accidental tap — especially on the short-let card in the mobile
 * grid — from silently creating the wrong listing type.
 */

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { LandlordAccessGate } from '@/components/landlord-access-gate';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { createListing, type ListingCategory } from '@/lib/listings';

const CATEGORIES: { value: ListingCategory; label: string; blurb: string }[] = [
  { value: 'rent', label: 'Rent', blurb: 'Annual or 2-year tenancy' },
  { value: 'sales', label: 'For sale', blurb: 'Outright sale' },
  { value: 'off_campus', label: 'Student accommodation', blurb: 'Off-campus hostels & rooms' },
  { value: 'short_let', label: 'Short-let', blurb: 'Nightly stays' },
];

export default function NewListingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<ListingCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const listing = await createListing(selected);
      router.replace(`/listings/edit/${listing.id}`);
    } catch {
      setError('Could not start a new listing. Please try again.');
      setBusy(false);
    }
  }

  return (
    <LandlordAccessGate next="/listings/new" intent="create">
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Create a listing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose what you&apos;re listing. Listings are free to upload — you pay only on a
          completed transaction.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => {
            const isSelected = selected === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={isSelected}
                disabled={busy}
                onClick={() => setSelected(c.value)}
                className={cn(
                  'relative rounded-xl border p-4 text-left shadow-sm transition-colors disabled:opacity-60',
                  isSelected
                    ? 'border-brand bg-brand/5 ring-2 ring-brand'
                    : 'border-slate-200 bg-white hover:border-brand hover:bg-brand/5',
                )}
              >
                {isSelected && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-slate-900">
                    <Check className="h-3.5 w-3.5 stroke-[3]" aria-hidden />
                  </span>
                )}
                <div className="text-sm font-semibold text-slate-900">{c.label}</div>
                <div className="mt-1 text-xs text-slate-500">{c.blurb}</div>
              </button>
            );
          })}
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-8 flex items-center gap-3">
          <Button onClick={() => void start()} disabled={!selected || busy}>
            {busy ? 'Creating…' : 'Continue'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </main>
    </LandlordAccessGate>
  );
}
