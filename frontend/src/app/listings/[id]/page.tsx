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
  FileText,
  CircleCheck,
  MapPin,
  ScrollText,
  Share2,
  Sparkles,
  SquareDashedMousePointer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { use, useEffect, useState } from 'react';

import { BeebopLockup } from '@/components/brand/beebop-logo';
import { BookmarkButton } from '@/components/browse/bookmark-button';
import { AmenitiesDisplay } from '@/components/listing/amenities-display';
import { AreaScorePanel } from '@/components/listing/area-score-panel';
import { CtaBar } from '@/components/listing/cta-bar';
import { ListingGallery } from '@/components/listing/gallery';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { iconForAmenity, amenityLabel } from '@/lib/amenity-icons';
import { MAX_FEATURED_TILES } from '@/lib/featured';
import { houseRuleDef, houseRuleLabel } from '@/lib/house-rules';
import { ApiError } from '@/lib/api';
import { pricePeriodLabel } from '@/lib/listings';
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
    return <LoadingScreen message="Loading listing…" />;
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
                <p className="text-caption font-semibold uppercase tracking-[0.16em] text-stone-600">
                  {priceCaption(listing.category)}
                </p>
                <p className="mt-2 text-2xl font-bold leading-none text-slate-950">
                  {formatPrice(listing.price)}
                  {listing.category === 'off_campus' && listing.price_period && (
                    <span className="ml-1 text-sm font-medium text-stone-600">
                      {' / '}
                      {pricePeriodLabel(listing.price_period)}
                    </span>
                  )}
                </p>
                <GlanceStats listing={listing} />
              </div>
            </section>

            <FeaturedTiles listing={listing} />

            {listing.category === 'off_campus' ? (
              <UnitTypes listing={listing} />
            ) : (
              <section className="rounded-[24px] bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
                <p className="text-sm text-stone-600">{priceCaption(listing.category)}</p>
                <p className="mt-3 text-3xl font-bold leading-none text-slate-950">
                  {formatPrice(listing.price)}
                </p>
                <p className="mt-3 text-caption font-bold uppercase tracking-[0.08em] text-stone-600">
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

            {listing.category === 'off_campus' && <CampusDistances listing={listing} />}

            {listing.category === 'off_campus' && <HouseRules listing={listing} />}

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
        <BeebopLockup />
      </div>
      <div className="flex items-center gap-2">
        <BookmarkButton
          listingId={listing.id}
          initial={listing.is_bookmarked}
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

// Headline tiles. For student accommodation the leading tile is always the
// driving time to Nile (featured for every off-campus listing), followed by the
// landlord's starred house rules and amenities. Other categories show starred
// amenities, falling back to the first present ones so the row is never empty.
function FeaturedTiles({ listing }: { listing: PublicListingDetail }) {
  const tiles: { key: string; icon: LucideIcon; label: string }[] = [];

  if (listing.category === 'off_campus') {
    const nile = numberValue(listing.type_data?.drive_min_nile);
    if (nile != null) {
      tiles.push({ key: 'drive-nile', icon: Car, label: `${nile} min to Nile` });
    }
    for (const { key, label } of featuredHouseRules(listing)) {
      tiles.push({ key: `rule:${key}`, icon: houseRuleDef(key)?.icon ?? CircleCheck, label });
    }
  }

  const starredAmenities = featuredAmenities(listing);
  for (const { group, key } of starredAmenities) {
    tiles.push({ key: `${group}:${key}`, icon: iconForAmenity(group, key), label: amenityLabel(key) });
  }

  // Nothing the landlord starred? Keep the row from being empty by surfacing the
  // first present amenities (features-group first). Skipped once anything is
  // starred so injected tiles never dilute a curated set.
  if (tiles.length === 0) {
    for (const { group, key } of fallbackAmenities(listing)) {
      tiles.push({ key: `${group}:${key}`, icon: iconForAmenity(group, key), label: amenityLabel(key) });
    }
  }

  const shown = tiles.slice(0, MAX_FEATURED_TILES);
  if (shown.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {shown.map(({ key, icon: Icon, label }) => (
        <div
          key={key}
          className="rounded-[18px] bg-white px-4 py-5 text-center shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
        >
          <Icon className="mx-auto h-7 w-7 text-brand-600" aria-hidden />
          <dd className="mt-2.5 text-sm font-bold leading-tight text-slate-950">{label}</dd>
        </div>
      ))}
    </dl>
  );
}

// Present house rules the landlord starred, as { key, label } with the curfew
// time folded into the label (e.g. "Curfew · 11:00 PM").
function featuredHouseRules(listing: PublicListingDetail): { key: string; label: string }[] {
  return presentHouseRules(listing)
    .filter((r) => r.featured)
    .map((r) => ({ key: r.key, label: r.value ? `${r.label} · ${r.value}` : r.label }));
}

type HouseRuleRow = { key: string; label: string; value: string | null; featured: boolean };

function presentHouseRules(listing: PublicListingDetail): HouseRuleRow[] {
  const raw = (listing.type_data?.house_rules ?? {}) as Record<
    string,
    { present?: boolean; featured?: boolean; value?: string | null }
  >;
  return Object.entries(raw)
    .filter(([, m]) => m?.present)
    .map(([key, m]) => ({
      key,
      label: houseRuleLabel(key),
      value: typeof m?.value === 'string' && m.value ? m.value : null,
      featured: Boolean(m?.featured),
    }));
}

// Amenities the landlord explicitly starred to feature (their intent).
function featuredAmenities(listing: PublicListingDetail): { group: string; key: string }[] {
  return presentAmenities(listing)
    .filter((a) => a.featured)
    .slice(0, MAX_FEATURED_TILES)
    .map(({ group, key }) => ({ group, key }));
}

// Filler for when nothing is starred: present amenities, features-group first.
function fallbackAmenities(listing: PublicListingDetail): { group: string; key: string }[] {
  return [...presentAmenities(listing)]
    .sort((a, b) => Number(b.group === 'features') - Number(a.group === 'features'))
    .slice(0, MAX_FEATURED_TILES)
    .map(({ group, key }) => ({ group, key }));
}

function presentAmenities(
  listing: PublicListingDetail,
): { group: string; key: string; featured: boolean }[] {
  const present: { group: string; key: string; featured: boolean }[] = [];
  for (const [group, items] of Object.entries(listing.amenities ?? {})) {
    if (!items) continue;
    for (const [key, meta] of Object.entries(items)) {
      if (meta?.present) present.push({ group, key, featured: Boolean(meta?.featured) });
    }
  }
  return present;
}

// Glanceable specs under the price. Off-campus shows bed availability (when the
// landlord opted in); other categories show bedrooms / bathrooms. Hidden when
// no useful numbers exist (e.g. short-let, or availability turned off).
function GlanceStats({ listing }: { listing: PublicListingDetail }) {
  if (listing.category === 'off_campus') {
    if (listing.type_data?.show_availability === false) return null;
    const bedsAvailable = listing.unit_types.reduce((n, u) => n + u.beds_available, 0);
    const bedsTotal = listing.unit_types.reduce((n, u) => n + u.beds_total, 0);
    if (bedsTotal <= 0) return null;
    const typeCount = listing.unit_types.length;
    return (
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-700">
        <span className="inline-flex items-center gap-1.5">
          <BedDouble className="h-4 w-4 text-brand-600" aria-hidden />
          <span className="font-bold text-slate-950">{bedsAvailable}</span>
          of {bedsTotal} beds available
        </span>
        <span className="text-stone-500">
          · {typeCount} room type{typeCount === 1 ? '' : 's'}
        </span>
      </div>
    );
  }

  const td = listing.type_data ?? {};
  const bedrooms = numberValue(td.bedroom_count);
  const bathrooms = numberValue(td.bathroom_count);
  if (bedrooms == null && bathrooms == null) return null;
  return (
    <div className="mt-4 flex items-center gap-4 text-sm font-medium text-slate-700">
      {bedrooms != null && (
        <span className="inline-flex items-center gap-1.5">
          <BedDouble className="h-4 w-4 text-brand-600" aria-hidden />
          {bedrooms} bed{bedrooms === 1 ? '' : 's'}
        </span>
      )}
      {bathrooms != null && (
        <span className="inline-flex items-center gap-1.5">
          <Bath className="h-4 w-4 text-brand-600" aria-hidden />
          {bathrooms} bath{bathrooms === 1 ? '' : 's'}
        </span>
      )}
    </div>
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
        <p className="text-caption font-bold uppercase tracking-[0.08em] text-stone-600">
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
                          className="inline-block rounded-md bg-white px-2 py-0.5 text-caption font-medium text-stone-600 ring-1 ring-slate-200"
                        >
                          {a}
                        </span>
                      ))}
                      {u.amenities.length > 3 && (
                        <span className="inline-block rounded-md bg-brand-50 px-2 py-0.5 text-caption font-semibold text-brand-700 ring-1 ring-brand-100">
                          +{u.amenities.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold leading-none text-slate-950">{formatPrice(u.price)}</p>
                  <p className="mt-1 text-caption font-medium uppercase tracking-[0.08em] text-stone-500">
                    per {pricePeriodLabel(u.price_period)}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-caption font-bold uppercase tracking-[0.08em] text-stone-600">
        Secure transaction support available in Beebop
      </p>
    </section>
  );
}

function UnitGenderBadge({ gender }: { gender: 'female' | 'male' | 'any' }) {
  if (gender === 'any') return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-bold uppercase ${
        gender === 'female' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
      }`}
    >
      {gender}
    </span>
  );
}

// Manually-recorded driving time (minutes) to the campuses BeeBop serves.
// Rendered only when at least one figure exists. Values come straight from
// type_data (set by the landlord and/or an admin).
function CampusDistances({ listing }: { listing: PublicListingDetail }) {
  const td = listing.type_data ?? {};
  const campuses: { name: string; minutes: number | null }[] = [
    { name: 'Nile University', minutes: numberValue(td.drive_min_nile) },
    { name: 'Baze University', minutes: numberValue(td.drive_min_baze) },
  ];
  const present = campuses.filter((c) => c.minutes != null);
  if (present.length === 0) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold text-slate-950">Distance to campus</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">Approximate driving time.</p>
      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {present.map((c) => (
          <div
            key={c.name}
            className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
          >
            <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600">
              <Car className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-950">{c.name}</dt>
              <dd className="text-xs font-medium text-stone-600">
                {c.minutes} min drive
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

// House rules: the landlord's checkable rules (curfew time inline) plus an
// optional uploaded code-of-conduct PDF. Renders nothing when neither exists.
function HouseRules({ listing }: { listing: PublicListingDetail }) {
  const td = listing.type_data ?? {};
  const rules = presentHouseRules(listing);
  const url = typeof td.rules_doc_url === 'string' ? td.rules_doc_url : null;
  const name =
    typeof td.rules_doc_name === 'string' && td.rules_doc_name
      ? td.rules_doc_name
      : 'House rules (PDF)';
  if (rules.length === 0 && !url) return null;

  return (
    <section>
      <div className="flex items-center gap-2">
        <ScrollText className="h-6 w-6 text-brand-600" aria-hidden />
        <h2 className="text-2xl font-bold text-slate-950">House rules</h2>
      </div>

      {rules.length > 0 && (
        <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {rules.map((r) => {
            const Icon = houseRuleDef(r.key)?.icon ?? CircleCheck;
            return (
              <li key={r.key} className="flex items-center gap-3 text-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-slate-800">
                  {r.label}
                  {r.value && <span className="font-semibold text-slate-950"> · {r.value}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition hover:shadow-md"
        >
          <div className="rounded-xl bg-slate-100 p-2.5 text-slate-500">
            <FileText className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{name}</p>
            <p className="text-xs font-medium text-stone-600">
              Tap to view the landlord&apos;s full code of conduct
            </p>
          </div>
          <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-slate-400" aria-hidden />
        </a>
      )}
    </section>
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

function cleanTitle(title: string): string {
  return title.replace(/^\[seed\]\s*/i, '');
}

function formatPrice(value: number | null): string {
  if (value == null) return 'Price on request';
  return `\u20a6${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
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

// Coerce a type_data field to a finite number, accepting numeric strings.
// Mirrors the backend's `_as_int`/`_as_float` (search/service.py) so the detail
// page renders the same drive-time tile and campus distances as the cards — a
// `drive_min_nile` stored as "10" must not silently vanish here.
function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
