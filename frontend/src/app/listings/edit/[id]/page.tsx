'use client';

/**
 * Listing editor — the creation wizard as a single long-scroll page with
 * auto-saving sections. The order of sections is identical across
 * categories; category-specific controls switch inside the relevant block.
 *
 * Submission runs the backend's `ready-for-submission` validator and, during
 * the test phase, publishes as `live_unverified`.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

import { RouteGuard } from '@/components/route-guard';
import { Button } from '@/components/ui/button';
import { AmenitiesChecklist } from '@/components/listing/amenities-checklist';
import { DocumentUpload } from '@/components/listing/document-upload';
import { ListingBaseForm } from '@/components/listing/base-form';
import { PhotoUpload } from '@/components/listing/photo-upload';
import { ShortLetPricing } from '@/components/listing/short-let-pricing';
import { StudentInventory } from '@/components/listing/student-inventory';
import { TypeDataForm } from '@/components/listing/type-data-form';
import { ApiError } from '@/lib/api';
import { getListing, submitListing, type ListingView } from '@/lib/listings';

export default function EditListingPage({
  params,
}: {
  // Next.js 15 — `params` is a Promise.
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RouteGuard roles={['landlord', 'agent']}>
      <EditingShell id={id} />
    </RouteGuard>
  );
}

function EditingShell({ id }: { id: string }) {
  const router = useRouter();
  const [listing, setListing] = useState<ListingView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getListing(id)
      .then((l) => {
        if (!cancelled) setListing(l);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Listing not found.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit() {
    if (!listing) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const next = await submitListing(listing.id);
      setListing(next);
      router.replace('/dashboard/landlord');
    } catch (err) {
      if (err instanceof ApiError && typeof err.message === 'string') {
        setSubmitError(err.message);
      } else {
        setSubmitError('Submission failed. Check the fields above and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <div className="p-8 text-sm text-red-600">{loadError}</div>;
  if (!listing) return <div className="p-8 text-sm text-slate-500">Loading…</div>;

  const isDraft = listing.status === 'draft';
  const patch = (partial: Partial<ListingView>) =>
    setListing((prev) => (prev ? { ...prev, ...partial } : prev));

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6 sm:p-10">
      <Link
        href="/dashboard/landlord"
        className="inline-flex items-center text-sm text-brand hover:underline"
      >
        ← Back to dashboard
      </Link>
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {listing.category.replace('_', ' ')}
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {listing.title || 'New listing'}
          </h1>
          <StatusPill status={listing.status} />
        </div>
      </header>

      <ListingBaseForm listing={listing} onSaved={setListing} />
      <TypeDataForm listing={listing} onSaved={setListing} />
      {listing.category === 'short_let' && (
        <ShortLetPricing listing={listing} onSaved={setListing} />
      )}
      <AmenitiesChecklist listing={listing} onSaved={setListing} />
      <PhotoUpload listing={listing} onSaved={patch} />
      {listing.category !== 'off_campus' && (
        <DocumentUpload listing={listing} onSaved={patch} />
      )}
      {listing.category === 'off_campus' && <StudentInventory listingId={listing.id} />}

      {isDraft && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">Submit for review</h2>
          <p className="mt-1 text-sm text-slate-500">
            Listings go live as unverified during this test phase. Verification badges can be added later.
          </p>
          {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
          <div className="mt-4">
            <Button onClick={() => void onSubmit()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit listing'}
            </Button>
          </div>
        </section>
      )}

      <div className="flex justify-end pt-4">
        <Link href="/dashboard/landlord">
          <Button variant="secondary">Done</Button>
        </Link>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: ListingView['status'] }) {
  const label = status.replaceAll('_', ' ');
  const color =
    status === 'draft'
      ? 'bg-slate-100 text-slate-700'
      : status === 'under_doc_review'
        ? 'bg-amber-100 text-amber-800'
        : status === 'live_unverified'
          ? 'bg-slate-200 text-slate-700'
          : status === 'doc_verified'
            ? 'bg-blue-100 text-blue-800'
            : status === 'fully_verified'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-slate-100 text-slate-700';
  return (
    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${color}`}>
      {label}
    </span>
  );
}
