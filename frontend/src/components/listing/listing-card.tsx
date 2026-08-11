/**
 * Listing card — used on browse grids, search results, and the landlord
 * dashboard. Variants by category per dev plan §7.2:
 *   • Sales cards hide the rating row (one-time transactions).
 *   • Price unit changes per category (annual / per term / nightly / total).
 *   • Unverified state is visually distinct from verified tiers.
 */

import {
  Bath,
  BadgeCheck,
  BedDouble,
  Building2,
  Car,
  GraduationCap,
  House,
  Play,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import { BookmarkButton } from '@/components/browse/bookmark-button';
import { cn } from '@/lib/cn';
import { pricePeriodLabel } from '@/lib/listings';
import type { ListingCategory, ListingStatus, PhotoView } from '@/lib/listings';
import { Price } from '@/components/ui/price';

export interface ListingCardData {
  id: string;
  title: string | null;
  category: ListingCategory;
  status: ListingStatus;
  price: number | null;
  district: string | null;
  cover_photo?: PhotoView | null;
  secondary_url?: string | null; // first non-cover photo; enables hover crossfade
  has_video?: boolean;           // shows the tour chip; playback lives on the listing page
  rating?: number | null;        // short-let / rent / student
  review_count?: number | null;
  bedroom_count?: number | null; // real specs from type_data; null = omit
  bathroom_count?: number | null;
  price_period?: string | null;  // off-campus billing period (year/semester)
  drive_min_nile?: number | null; // off-campus: featured drive time to Nile
  // Off-campus bed inventory. null = don't show (landlord opted out, or no
  // rooms recorded); 0 = genuinely full. The two must not be conflated.
  beds_available?: number | null;
  beds_total?: number | null;
  href?: string;                 // defaults to /listings/[id]
}

export function ListingCard({
  data,
  showSave = false,
}: {
  data: ListingCardData;
  // Renders the on-card save control top-right of the photo. Off by default so
  // compact/chat usages stay clean; discovery surfaces (browse, carousel) opt in.
  showSave?: boolean;
}) {
  const href = data.href ?? `/listings/${data.id}`;
  const tier = verificationTier(data.status);

  return (
    // Wrapper owns the hover `group` and hosts the save control as a sibling of
    // the Link — a <button> may never nest inside an <a>.
    <div className="group relative h-full">
      <Link
        href={href as Route}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-hairline bg-white transition-[transform,border-color] duration-200 group-hover:border-ink-soft/50 motion-safe:group-hover:-translate-y-0.5"
      >
        <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-hairline">
          {data.cover_photo?.url ? (
            <>
              <img
                src={data.cover_photo.url}
                alt={data.title ?? 'Listing'}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {data.secondary_url && (
                // Crossfade to the second photo on hover — doubles photo exposure
                // without a click. Static (never shown) under reduced motion.
                <img
                  src={data.secondary_url}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-0 motion-safe:transition-opacity motion-safe:duration-300 motion-safe:group-hover:opacity-100"
                />
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-caption text-ink-soft">
              No photo
            </div>
          )}
          <div className="absolute left-2 top-2">
            <VerificationBadge tier={tier} />
          </div>
          {/* Grouped bottom-left so the video chip can't collide with the
              off-campus drive-time chip that owns bottom-right. */}
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
            <CategoryBadge category={data.category} />
            {data.has_video && <VideoChip />}
          </div>
          {data.category === 'off_campus' && data.drive_min_nile != null && (
            // Featured on every student-accommodation card: driving time to Nile.
            <div className="absolute bottom-2 right-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/90 px-2 py-0.5 text-caption font-semibold text-slate-900 shadow-sm">
                <Car className="h-3.5 w-3.5" aria-hidden />
                {data.drive_min_nile} min to Nile
              </span>
            </div>
          )}
        </div>
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-display text-title font-semibold text-ink">
                {data.title ?? 'Untitled listing'}
              </div>
              {data.district && (
                <div className="truncate text-caption text-ink-muted">{data.district}</div>
              )}
            </div>
            {/* Price anchors the card — the strongest element in the body. */}
            <div className="shrink-0 text-right">
              <Price value={data.price} className="block text-title font-bold text-ink" />
              <div className="text-caption text-ink-muted">{priceUnit(data)}</div>
            </div>
          </div>
          {(data.bedroom_count != null || data.bathroom_count != null) && (
            <div className="mt-2.5 flex items-center gap-3 text-caption text-ink-muted">
              {data.bedroom_count != null && (
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="h-3.5 w-3.5" aria-hidden />
                  {data.bedroom_count} bed{data.bedroom_count === 1 ? '' : 's'}
                </span>
              )}
              {data.bathroom_count != null && (
                <span className="inline-flex items-center gap-1">
                  <Bath className="h-3.5 w-3.5" aria-hidden />
                  {data.bathroom_count} bath{data.bathroom_count === 1 ? '' : 's'}
                </span>
              )}
            </div>
          )}
          {data.beds_available != null && (
            // The stat students judge a place on, so it sits high — in the slot
            // the bed/bath specs use on other categories, which is always empty
            // here (student listings record inventory per unit type, not per
            // property). Same dot-and-count treatment as the unit rows on the
            // listing page, so availability reads identically on both surfaces.
            <div className="mt-2.5 text-caption font-semibold">
              {data.beds_available > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-growth">
                  <span className="h-1.5 w-1.5 rounded-full bg-growth" aria-hidden />
                  {data.beds_available} bed{data.beds_available === 1 ? '' : 's'} available
                </span>
              ) : (
                <span className="text-ink-muted">Fully booked</span>
              )}
            </div>
          )}
          {data.category !== 'sales' && typeof data.rating === 'number' && (
            <div className="mt-2 flex items-center gap-1 text-caption text-ink-muted">
              <Star />
              <span className="font-medium text-ink">{data.rating.toFixed(1)}</span>
              {typeof data.review_count === 'number' && (
                <span className="text-ink-muted">({data.review_count})</span>
              )}
            </div>
          )}
        </div>
      </Link>
      {showSave && (
        <BookmarkButton listingId={data.id} className="absolute right-2 top-2" />
      )}
    </div>
  );
}

// Per-vertical identity. Differentiation is carried by icon + label, not colour —
// the palette reserves blue/green/Honey for verification, availability, and
// actions, so category never introduces a competing colour axis. Icons mirror
// the main sidebar's vocabulary for one consistent language across the app.
const CATEGORY_META: Record<ListingCategory, { label: string; icon: LucideIcon }> = {
  off_campus: { label: 'Off-campus', icon: GraduationCap },
  short_let: { label: 'Short-let', icon: Waves },
  rent: { label: 'Rent', icon: House },
  sales: { label: 'For Sale', icon: Building2 },
};

function CategoryBadge({ category }: { category: ListingCategory }) {
  // Neutral glass chip, matching the overlay-badge language already used on the
  // photo, so the vertical reads at a glance without fighting the verification
  // badge for colour.
  const { label, icon: Icon } = CATEGORY_META[category];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-caption font-medium text-ink shadow-sm">
      <Icon className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
      {label}
    </span>
  );
}

function VideoChip() {
  // Inverted against the neutral glass CategoryBadge beside it — this is the
  // one chip meant to pull the eye, since a tour is the reason to click
  // through. Mirrors the "Watch tour" pill on the listing hero.
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/85 px-2 py-0.5 text-caption font-medium text-paper shadow-sm backdrop-blur">
      <Play className="h-3 w-3 fill-current" aria-hidden />
      Video
    </span>
  );
}

export type VerificationTier = 'fully_verified' | 'doc_verified' | 'unverified';

function verificationTier(status: ListingStatus): VerificationTier {
  if (status === 'fully_verified' || status === 'let_agreed' || status === 'sale_agreed') {
    return 'fully_verified';
  }
  if (status === 'doc_verified') return 'doc_verified';
  return 'unverified';
}

function VerificationBadge({ tier }: { tier: VerificationTier }) {
  // One language across tiers. Verified tiers are celebrated as a compact
  // coloured check chip (faster to parse over a photo, brand-consistent);
  // unverified is deliberately understated — a quiet neutral pill, not a loud
  // dark banner — so verified states carry the emphasis.
  if (tier === 'unverified') {
    return (
      <span className="rounded-full bg-white/90 px-2 py-0.5 text-caption font-medium text-ink-muted shadow-sm">
        Unverified
      </span>
    );
  }
  const fully = tier === 'fully_verified';
  return (
    <span
      role="img"
      aria-label={fully ? 'AGIS verified' : 'Document verified'}
      title={fully ? 'AGIS verified' : 'Document verified'}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm',
        fully ? 'bg-verification-fully' : 'bg-verification-doc',
      )}
    >
      <BadgeCheck className="h-4 w-4" aria-hidden />
    </span>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-amber-400" aria-hidden="true">
      <path d="M10 1.5l2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8L4.7 18.2l1-6L1.3 7.9l6-.9L10 1.5z" />
    </svg>
  );
}

function priceUnit(data: ListingCardData): string {
  switch (data.category) {
    case 'rent':
      return 'per year';
    case 'sales':
      return 'total';
    case 'short_let':
      return 'per night';
    case 'off_campus':
      return data.price_period ? `from / ${pricePeriodLabel(data.price_period)}` : 'starting from';
  }
}
