'use client';

/**
 * Public listing detail page. Accessible to anyone (SSR-friendly data
 * shape; rendered as a client page here for Sprint 3 while the session
 * store remains client-side). The valuation-report panel gates its own
 * content based on the session — anonymous visitors see a locked preview.
 */

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

import { AmenitiesDisplay } from '@/components/listing/amenities-display';
import { AreaScorePanel } from '@/components/listing/area-score-panel';
import { BookmarkButton } from '@/components/browse/bookmark-button';
import { CtaBar } from '@/components/listing/cta-bar';
import { ListingGallery } from '@/components/listing/gallery';
import { ValuationReportPanel } from '@/components/listing/valuation-report';
import { ApiError } from '@/lib/api';
import { getPublicListing, type PublicListingDetail } from '@/lib/search';

export default function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicListing(id)
      .then((l) => !cancelled && setListing(l))
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError && err.status === 404 ? 'Listing not found.' : 'Could not load listing.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand underline">Back to home</Link>
      </main>
    );
  }
  if (!listing) {
    return <main className="p-8 text-sm text-slate-500">Loading…</main>;
  }

  const short = listing.description.length > 400 && !expanded;
  const description = short ? listing.description.slice(0, 400) + '…' : listing.description;

  return (
    <>
      <main className="mx-auto max-w-5xl space-y-8 p-4 pb-28 sm:p-8 sm:pb-28">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                {listing.category.replace('_', ' ')}
              </div>
              <h1 className="text-2xl font-semibold text-slate-900">{listing.title}</h1>
              {listing.subtitle && <p className="text-sm text-slate-600">{listing.subtitle}</p>}
              {listing.district && <p className="mt-1 text-xs text-slate-500">Approximate area: {listing.district}</p>}
            </div>
            <BookmarkButton listingId={listing.id} initial={listing.is_bookmarked} />
          </div>
        </header>

        <ListingGallery listing={listing} />

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">About this home</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{description}</p>
          {listing.description.length > 400 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 text-xs text-brand hover:underline"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">Amenities</h2>
          <div className="mt-3">
            <AmenitiesDisplay amenities={listing.amenities} />
          </div>
        </section>

        <AreaScorePanel areaScore={listing.area_score} />

        <ValuationReportPanel report={listing.valuation_report} />

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-900">Approximate location</h2>
          <p className="mt-1 text-xs text-slate-500">
            Exact address shared after offer acceptance or a confirmed visit.
          </p>
          <div className="mt-3 aspect-[2/1] rounded-lg bg-slate-100 text-xs text-slate-500">
            <div className="flex h-full items-center justify-center">
              {listing.gps_lat != null && listing.gps_lng != null
                ? `Pin at ${listing.gps_lat.toFixed(4)}, ${listing.gps_lng.toFixed(4)}`
                : 'Location pin not set'}
            </div>
          </div>
        </section>
      </main>
      <CtaBar listing={listing} />
    </>
  );
}
