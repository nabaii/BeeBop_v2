'use client';

/**
 * Public listing detail page. Accessible to anyone (SSR-friendly data
 * shape; rendered as a client page here for Sprint 3 while the session
 * store remains client-side).
 */

import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  Car,
  ChevronRight,
  MapPin,
  Share2,
  Sparkles,
  SquareDashedMousePointer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { use, useEffect, useState } from 'react';

import { BookmarkButton } from '@/components/browse/bookmark-button';
import { AmenitiesDisplay } from '@/components/listing/amenities-display';
import { AreaScorePanel } from '@/components/listing/area-score-panel';
import { CtaBar } from '@/components/listing/cta-bar';
import { ListingGallery } from '@/components/listing/gallery';
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
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Listing not found.'
            : 'Could not load listing.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand underline">
          Back to home
        </Link>
      </main>
    );
  }

  if (!listing) {
    return <main className="p-8 text-sm text-slate-500">Loading...</main>;
  }

  const short = listing.description.length > 400 && !expanded;
  const description = short
    ? `${listing.description.slice(0, 400).replace(/\s+\S*$/, '')}…`
    : listing.description;

  return (
    <>
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto min-h-screen max-w-[480px] bg-slate-50 pb-32 shadow-xl sm:max-w-5xl sm:shadow-none">
          <ListingHeader listing={listing} />

          <div className="space-y-8 px-4 py-5 sm:px-8">
            <ListingGallery listing={listing} />
            <HighlightChips listing={listing} />

            <section>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {categoryLabel(listing.category)}
              </p>
              <h1 className="mt-3 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">
                {cleanTitle(listing.title)}
              </h1>
              {listing.subtitle && (
                <p className="mt-2 text-sm leading-6 text-slate-600">{listing.subtitle}</p>
              )}
              {listing.district && (
                <p className="mt-2 flex items-center gap-1 text-sm font-medium text-orange-700">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {listing.district}, Abuja
                </p>
              )}
              <div className="mt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-600">
                  {priceCaption(listing.category)}
                </p>
                <p className="mt-2 text-2xl font-bold leading-none text-slate-950">
                  {listing.category === 'off_campus'
                    ? formatPrice(unitFromPrice(listing))
                    : formatPrice(listing.price)}
                </p>
              </div>
            </section>

            <SpecTiles listing={listing} />

            {listing.category === 'off_campus' ? (
              <UnitTypes listing={listing} />
            ) : (
              <section className="rounded-[24px] bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
                <p className="text-sm text-stone-600">{priceCaption(listing.category)}</p>
                <p className="mt-3 text-3xl font-bold leading-none text-slate-950">
                  {formatPrice(listing.price)}
                </p>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-600">
                  Secure transaction support available in Beebop
                </p>
              </section>
            )}

            <section>
              <h2 className="text-2xl font-bold text-slate-950">About this Property</h2>
              <p className="mt-4 whitespace-pre-wrap text-base leading-8 text-stone-700">
                {description}
              </p>
              {listing.description.length > 400 && (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="mt-4 text-sm font-semibold text-orange-700 hover:underline"
                >
                  {expanded ? 'Show less' : 'Read full description'}
                </button>
              )}
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-950">Premium Amenities</h2>
              <div className="mt-5">
                <AmenitiesDisplay amenities={listing.amenities} />
              </div>
            </section>

            <AreaScorePanel areaScore={listing.area_score} />

            <ApproximateLocation listing={listing} />
          </div>
        </div>
      </main>
      <CtaBar listing={listing} />
    </>
  );
}

function ListingHeader({ listing }: { listing: PublicListingDetail }) {
  function shareListing() {
    const url = window.location.href;
    if (navigator.share) {
      void navigator.share({ title: cleanTitle(listing.title), url });
      return;
    }
    void navigator.clipboard?.writeText(url);
  }

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-100 bg-white px-4 sm:px-8">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back to home"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <BeebopMark />
        <span className="text-lg font-bold text-brand-700">Beebop</span>
      </div>
      <div className="flex items-center gap-2">
        <BookmarkButton
          listingId={listing.id}
          initial={listing.is_bookmarked}
          icon="heart"
          className="h-9 w-9 bg-white text-slate-600 shadow-none ring-0 hover:bg-slate-100"
        />
        <button
          type="button"
          onClick={shareListing}
          aria-label="Share listing"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
        >
          <Share2 className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </header>
  );
}

function HighlightChips({ listing }: { listing: PublicListingDetail }) {
  const chips = highlightLabels(listing);
  if (chips.length === 0) return null;

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {chips.map(({ label, icon: Icon }) => (
        <span
          key={label}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-100"
        >
          <Icon className="h-4 w-4 text-brand-600" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}

function SpecTiles({ listing }: { listing: PublicListingDetail }) {
  const specs = listingSpecs(listing);

  return (
    <dl className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2">
      {specs.map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="rounded-[18px] bg-white px-5 py-6 text-center shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
        >
          <Icon className="mx-auto h-7 w-7 text-brand-600" aria-hidden />
          <dt className="mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-stone-600">
            {label}
          </dt>
          <dd className="mt-1 text-xl font-bold text-slate-950">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function UnitTypes({ listing }: { listing: PublicListingDetail }) {
  const units = [...listing.unit_types].sort((a, b) => a.price - b.price);
  if (units.length === 0) {
    return (
      <section className="rounded-[24px] bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
        <p className="text-sm text-stone-600">No units listed yet</p>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          The landlord hasn’t added room options for this property yet. Check back soon.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[24px] bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-bold text-slate-950">Available units</h2>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-stone-600">
          {units.length} option{units.length > 1 ? 's' : ''}
        </p>
      </div>
      <ul className="mt-5 space-y-3">
        {units.map((u) => {
          const soldOut = u.beds_available <= 0;
          return (
            <li key={u.id}>
              <Link
                href={`/listings/${listing.id}/units/${u.id}` as Route}
                aria-label={`View ${u.name} details`}
                className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-5 py-4 transition hover:border-brand/40 hover:bg-white hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-semibold text-slate-950">{u.name}</p>
                    <UnitGenderBadge gender={u.gender_tag} />
                  </div>
                  <p className="mt-0.5 text-xs font-medium capitalize text-stone-600">
                    {u.kind.replaceAll('_', ' ')} · {u.beds_per_room} bed(s)/room
                  </p>
                  <p className="mt-1 text-xs font-semibold">
                    {soldOut ? (
                      <span className="text-red-600">Fully booked</span>
                    ) : (
                      <span className="text-emerald-700">
                        {u.beds_available} bed{u.beds_available > 1 ? 's' : ''} available
                      </span>
                    )}
                  </p>
                  {u.amenities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {u.amenities.slice(0, 3).map((a) => (
                        <span
                          key={a}
                          className="inline-block rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-stone-600 ring-1 ring-slate-200"
                        >
                          {a}
                        </span>
                      ))}
                      {u.amenities.length > 3 && (
                        <span className="inline-block rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-100">
                          +{u.amenities.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold leading-none text-slate-950">{formatPrice(u.price)}</p>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-stone-500">
                    per unit
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-600">
        Secure transaction support available in Beebop
      </p>
    </section>
  );
}

function UnitGenderBadge({ gender }: { gender: 'female' | 'male' | 'any' }) {
  if (gender === 'any') return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
        gender === 'female' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
      }`}
    >
      {gender}
    </span>
  );
}

function ApproximateLocation({ listing }: { listing: PublicListingDetail }) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-6">
      <h2 className="text-2xl font-bold text-slate-950">Approximate location</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Exact address shared after offer acceptance or a confirmed visit.
      </p>
      <div className="mt-5 aspect-[4/3] overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#5aa6aa_0%,#2f8791_45%,#9fbf67_100%)] p-4 text-xs text-white sm:aspect-[2/1]">
        <div className="flex h-full items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-semibold text-slate-800 shadow-sm">
            <MapPin className="h-4 w-4 text-brand-600" aria-hidden />
            {listing.district ?? 'Abuja'}
          </span>
        </div>
      </div>
    </section>
  );
}

function BeebopMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden>
      <circle cx="6" cy="9" r="3" fill="#f59e0b" />
      <circle cx="14" cy="6" r="3" fill="#f59e0b" />
      <circle cx="10" cy="15" r="3" fill="#fbbf24" />
    </svg>
  );
}

function cleanTitle(title: string): string {
  return title.replace(/^\[seed\]\s*/i, '');
}

function formatPrice(value: number | null): string {
  if (value == null) return 'Price on request';
  return `\u20a6${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

/** Cheapest unit price for an off-campus listing \u2014 drives the "Starting rate"
 * headline now that student listings price per unit rather than on the listing. */
function unitFromPrice(listing: PublicListingDetail): number | null {
  const prices = listing.unit_types.map((u) => u.price).filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : null;
}

function categoryLabel(category: PublicListingDetail['category']): string {
  switch (category) {
    case 'off_campus':
      return 'Off-campus accommodation';
    case 'short_let':
      return 'Short-let stay';
    case 'sales':
      return 'Property for sale';
    case 'rent':
    default:
      return 'Property for rent';
  }
}

function priceCaption(category: PublicListingDetail['category']): string {
  switch (category) {
    case 'short_let':
      return 'Nightly rate';
    case 'off_campus':
      return 'Starting rate';
    case 'sales':
      return 'Asking price';
    case 'rent':
    default:
      return 'Annual rent';
  }
}

function listingSpecs(listing: PublicListingDetail) {
  const data = listing.type_data ?? {};
  const bedrooms = numberValue(data.bedroom_count);
  const bathrooms =
    numberValue(data.bathroom_count) ?? (bedrooms ? (bedrooms >= 4 ? 4.5 : bedrooms) : null);
  const propertyType = textValue(data.property_type) ?? categoryLabel(listing.category);

  return [
    {
      label: 'Bedrooms',
      value: bedrooms ? String(bedrooms) : listing.category === 'off_campus' ? 'Rooms' : 'Ask',
      icon: BedDouble,
    },
    {
      label: 'Bathrooms',
      value: bathrooms ? String(bathrooms) : 'Ask',
      icon: Bath,
    },
    {
      label: 'Parking',
      value: hasAmenity(listing, 'parking') ? 'Available' : 'Ask',
      icon: Car,
    },
    {
      label: 'Property type',
      value: titleCase(propertyType),
      icon: Building2,
    },
  ];
}

function highlightLabels(listing: PublicListingDetail): { label: string; icon: LucideIcon }[] {
  const labels: { label: string; icon: LucideIcon }[] = [];
  if (hasAmenity(listing, 'power')) labels.push({ label: '24/7 Power', icon: Sparkles });
  if (hasAmenity(listing, 'security')) labels.push({ label: 'Secure Estate', icon: Users });
  if (hasAmenity(listing, 'internet')) {
    labels.push({ label: 'Fibre Ready', icon: SquareDashedMousePointer });
  }
  labels.push({ label: categoryLabel(listing.category), icon: Building2 });
  return labels.slice(0, 4);
}

function hasAmenity(listing: PublicListingDetail, group: string): boolean {
  const items = listing.amenities?.[group];
  if (!items) return false;
  return Object.values(items).some((item) => Boolean(item?.present));
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function titleCase(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
