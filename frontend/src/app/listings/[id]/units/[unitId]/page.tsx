'use client';

/**
 * Unit-type sub-listing page. Seekers tap a unit type on the listing to see
 * its specifics: sex served, price, amenities, and aggregated bed
 * availability. Individual room names/numbers are an internal (landlord)
 * concern and are not surfaced here.
 */

import { use, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bath,
  Tv,
  Wind,
  Laptop,
  CheckCircle,
  Sparkles,
  BedDouble,
  Building2,
  Users,
  Layers,
  MapPin,
} from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@/components/ui/button';
import { LoadingScreen } from '@/components/ui/loading-screen';

import { ApiError } from '@/lib/api';
import { pricePeriodLabel } from '@/lib/listings';
import { getPublicListing, type PublicListingDetail, type PublicUnitType } from '@/lib/search';

// How many amenities to show before the seeker expands the full list.
const AMENITY_PREVIEW = 6;

export default function UnitTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id, unitId } = use(params);
  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [unit, setUnit] = useState<PublicUnitType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllAmenities, setShowAllAmenities] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicListing(id)
      .then((l) => {
        if (cancelled) return;
        setListing(l);
        const found = l.unit_types.find((u) => u.id === unitId) ?? null;
        if (found) {
          setUnit(found);
        } else {
          setError('Unit type not found.');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Property listing not found.'
            : 'Could not load unit details.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, unitId]);

  if (loading) {
    return <LoadingScreen message="Loading unit details…" />;
  }

  if (error || !listing || !unit) {
    return (
      <main className="mx-auto max-w-2xl p-8 min-h-screen bg-slate-50">
        <p className="text-sm text-red-600 font-semibold">{error || 'Failed to load page.'}</p>
        <Link href={`/listings/${id}` as Route} className="mt-4 inline-block text-sm text-brand underline font-medium">
          Back to property
        </Link>
      </main>
    );
  }

  const soldOut = unit.beds_available <= 0;

  // Icon mapper for amenities
  const getAmenityIcon = (amenity: string) => {
    const text = amenity.toLowerCase();
    if (text.includes('bathroom') || text.includes('bath') || text.includes('toilet') || text.includes('shower')) {
      return Bath;
    }
    if (text.includes('tv') || text.includes('television')) {
      return Tv;
    }
    if (text.includes('ac') || text.includes('aircon') || text.includes('air conditioner') || text.includes('cooling')) {
      return Wind;
    }
    if (text.includes('desk') || text.includes('workspace') || text.includes('table') || text.includes('study')) {
      return Laptop;
    }
    return CheckCircle;
  };

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-[480px] bg-slate-50 pb-32 shadow-xl sm:max-w-3xl">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-slate-100 bg-white px-6">
          <Link
            href={`/listings/${id}` as Route}
            aria-label="Back to listing"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit Type</span>
            <h1 className="text-sm font-bold text-slate-800">{unit.name}</h1>
          </div>
        </header>

        <div className="space-y-6 px-6 py-6">
          {/* Main Visual Title Card */}
          <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-brand-700 via-brand-800 to-amber-800 p-6 text-white shadow-lg">
            <div className="absolute top-0 right-0 h-40 w-40 translate-x-12 -translate-y-12 rounded-full bg-white/10 blur-xl" />
            <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-12 translate-y-12 rounded-full bg-white/10 blur-xl" />

            <div className="flex flex-wrap gap-2 items-center mb-4">
              <span className={`rounded-full px-2.5 py-0.5 text-caption font-bold uppercase tracking-wider ${
                unit.gender_tag === 'female'
                  ? 'bg-rose-500/30 text-rose-100 border border-rose-400/30'
                  : unit.gender_tag === 'male'
                    ? 'bg-blue-500/30 text-blue-100 border border-blue-400/30'
                    : 'bg-slate-500/30 text-slate-100 border border-slate-400/30'
              }`}>
                {unit.gender_tag === 'any' ? 'Any occupant' : `${unit.gender_tag} occupant only`}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-caption font-bold uppercase tracking-wider ${
                soldOut
                  ? 'bg-red-500/30 text-red-100 border border-red-400/30'
                  : 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/30'
              }`}>
                {soldOut ? 'Fully Occupied' : 'Beds Available'}
              </span>
            </div>

            <h2 className="text-3xl font-extrabold tracking-tight">{unit.name}</h2>
            <p className="mt-1 text-sm text-brand-100/90 capitalize">
              {unit.kind.replaceAll('_', ' ')}
            </p>

            <div className="mt-8 flex items-baseline justify-between border-t border-white/10 pt-4">
              <div>
                <p className="text-caption font-semibold uppercase tracking-wider text-brand-200">Price</p>
                <p className="text-3xl font-black">{formatPrice(unit.price)}</p>
              </div>
              <span className="text-xs font-medium text-brand-200">per {pricePeriodLabel(unit.price_period)}</span>
            </div>
          </section>

          {/* Quick Specification Tiles */}
          <section className="grid grid-cols-2 gap-4">
            <SpecTile
              icon={BedDouble}
              label="Beds Available"
              value={`${unit.beds_available} of ${unit.beds_total} free`}
            />
            <SpecTile
              icon={Users}
              label="Sex"
              value={unit.gender_tag === 'any' ? 'Any' : unit.gender_tag}
              capitalize
            />
            <SpecTile
              icon={BedDouble}
              label="Beds per room"
              value={String(unit.beds_per_room)}
            />
            <SpecTile
              icon={Layers}
              label="Total units"
              value={String(unit.total_units)}
            />
          </section>

          {/* Amenities Section */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-brand-600" />
              Unit Amenities
            </h3>

            {unit.amenities && unit.amenities.length > 0 ? (
              <>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(showAllAmenities ? unit.amenities : unit.amenities.slice(0, AMENITY_PREVIEW)).map(
                    (amenity, idx) => {
                      const Icon = getAmenityIcon(amenity);
                      return (
                        <li key={idx} className="flex items-center gap-3 rounded-xl border border-slate-50 bg-slate-50/50 px-4 py-3 text-slate-700">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-100 text-brand shadow-sm shrink-0">
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="text-xs font-semibold text-slate-800">{amenity}</span>
                        </li>
                      );
                    },
                  )}
                </ul>
                {unit.amenities.length > AMENITY_PREVIEW && (
                  <button
                    type="button"
                    onClick={() => setShowAllAmenities((v) => !v)}
                    className="mt-4 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50"
                  >
                    {showAllAmenities ? 'Show less' : `Show all ${unit.amenities.length} amenities`}
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <p className="text-xs font-semibold text-slate-500">No amenities listed for this unit type</p>
              </div>
            )}
          </section>

          {/* Parent Property Info */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Property Location & Details</h3>

            <div className="flex gap-4 items-start">
              <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200/50">
                <Building2 className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-800 text-sm truncate">{listing.title}</h4>
                {listing.district && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-stone-600 font-medium">
                    <MapPin className="h-3 w-3 text-orange-600" />
                    {listing.district}, Abuja
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">
                Want to book or view general property details?
              </div>
              <Link href={`/listings/${id}` as Route}>
                <Button variant="secondary" className="shrink-0 text-xs">
                  View Property
                </Button>
              </Link>
            </div>
          </section>

          {/* Main Booking Call To Action */}
          <section className="mt-8">
            <Link href={`/listings/${id}` as Route}>
              <button
                type="button"
                disabled={soldOut}
                className="w-full rounded-2xl bg-brand py-4 px-6 text-center text-sm font-extrabold text-slate-900 shadow-md hover:bg-brand-600 disabled:opacity-40 disabled:hover:bg-brand transition duration-300"
              >
                {soldOut ? 'Unit Fully Occupied' : 'Go to Booking Options'}
              </button>
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}

function SpecTile({
  icon: Icon,
  label,
  value,
  capitalize = false,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-[18px] bg-white px-4 py-5 text-center shadow-[0_4px_20px_rgba(15,23,42,0.04)] border border-slate-100">
      <Icon className="mx-auto h-6 w-6 text-brand-600" />
      <span className="mt-2 block text-caption font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`mt-1 block text-lg font-extrabold text-slate-900 ${capitalize ? 'capitalize' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function formatPrice(value: number | null): string {
  if (value == null) return 'Price on request';
  return `₦${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}
