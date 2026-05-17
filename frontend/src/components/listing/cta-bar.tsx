'use client';

/**
 * Fixed bottom CTA bar on the listing page. Variant per category per
 * product brief §6.2.
 *
 *   • short_let  — date picker + dynamic price
 *   • off_campus — institution + semester selector (from seeker profile)
 *   • rent       — rent duration (years) + Make offer
 *   • sales      — Make offer (no selector)
 *
 * Unauthenticated users see a "Sign in to continue" button that preserves
 * the return URL.
 */

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';

import { BookingModal } from '@/components/bookings/booking-modal';
import { OfferModal } from '@/components/offers/offer-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PublicListingDetail } from '@/lib/search';
import { useSession } from '@/stores/session';

interface Props {
  listing: PublicListingDetail;
}

export function CtaBar({ listing }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);

  const loggedOutCta = (
    <Link
      href={`/login?return_to=${encodeURIComponent(pathname ?? '/')}`}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white sm:w-auto"
    >
      Sign in to continue
    </Link>
  );

  const openOffer = () => setOfferModalOpen(true);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto max-w-[480px] px-4 safe-pb sm:max-w-5xl">
          <div className="pointer-events-auto flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_42px_rgba(15,23,42,0.16)] sm:flex-row sm:items-center sm:justify-between sm:p-4">
            {listing.category === 'short_let' && (
              <ShortLetCta listing={listing} disabled={!user} onBook={() => setBookingModalOpen(true)}>
                {loggedOutCta}
              </ShortLetCta>
            )}
            {listing.category === 'off_campus' && (
              <OffCampusCta listing={listing} disabled={!user} onMakeOffer={openOffer}>
                {loggedOutCta}
              </OffCampusCta>
            )}
            {listing.category === 'rent' && (
              <RentCta listing={listing} disabled={!user} onMakeOffer={openOffer}>
                {loggedOutCta}
              </RentCta>
            )}
            {listing.category === 'sales' && (
              <SalesCta listing={listing} disabled={!user} onMakeOffer={openOffer}>
                {loggedOutCta}
              </SalesCta>
            )}
          </div>
        </div>
      </div>
      {offerModalOpen && (
        <OfferModal
          listing={listing}
          onClose={() => setOfferModalOpen(false)}
          onSubmitted={() => {
            setOfferModalOpen(false);
            router.push('/dashboard/seeker');
          }}
        />
      )}
      {bookingModalOpen && (
        <BookingModal
          listing={listing}
          onClose={() => setBookingModalOpen(false)}
          onCreated={(authUrl) => {
            setBookingModalOpen(false);
            if (authUrl && !authUrl.startsWith('https://stub.local/')) {
              window.location.href = authUrl;
            } else {
              router.push('/dashboard/seeker');
            }
          }}
        />
      )}
    </>
  );
}

function ShortLetCta({
  listing,
  disabled,
  children,
  onBook,
}: {
  listing: PublicListingDetail;
  disabled: boolean;
  children: React.ReactNode;
  onBook: () => void;
}) {
  const td = listing.type_data as { base_rate?: number; weekend_rate?: number; min_stay_nights?: number };
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');

  const quote = useMemo(() => {
    if (!checkIn || !checkOut) return null;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const ms = end.getTime() - start.getTime();
    if (Number.isNaN(ms) || ms <= 0) return null;
    const nights = Math.round(ms / (1000 * 60 * 60 * 24));
    let subtotal = 0;
    const cursor = new Date(start);
    for (let i = 0; i < nights; i++) {
      const isWeekend = cursor.getDay() === 5 || cursor.getDay() === 6;
      subtotal += isWeekend && td.weekend_rate ? td.weekend_rate : td.base_rate ?? 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    return { nights, subtotal };
  }, [checkIn, checkOut, td]);

  return (
    <>
      <div className="w-full space-y-2 text-sm sm:w-auto">
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="w-full"
          />
          <Input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="text-xs text-slate-500">
          {quote ? (
            <>
              <span className="font-semibold text-slate-900">
                {formatPrice(quote.subtotal)}
              </span>{' '}
              for {quote.nights} night{quote.nights === 1 ? '' : 's'}
            </>
          ) : (
            <>Select dates to see total</>
          )}
        </div>
      </div>
      {disabled ? children : <Button onClick={onBook} className="w-full sm:w-auto">Book</Button>}
    </>
  );
}

function OffCampusCta({
  listing,
  disabled,
  children,
  onMakeOffer,
}: {
  listing: PublicListingDetail;
  disabled: boolean;
  children: React.ReactNode;
  onMakeOffer: () => void;
}) {
  return (
    <>
      <div className="text-sm text-slate-600">
        <span className="font-semibold text-slate-900">
          {formatPrice(listing.price)}
        </span>
        <span className="ml-2 text-xs text-slate-500">starting rate</span>
      </div>
      {disabled ? children : <Button onClick={onMakeOffer} className="w-full sm:w-auto">Enquire</Button>}
    </>
  );
}

function RentCta({
  listing,
  disabled,
  children,
  onMakeOffer,
}: {
  listing: PublicListingDetail;
  disabled: boolean;
  children: React.ReactNode;
  onMakeOffer: () => void;
}) {
  const [years, setYears] = useState('1');
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="text-xs text-slate-500">
          <span className="mr-2">Duration</span>
          <select
            value={years}
            onChange={(e) => setYears(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="1">1 year</option>
            <option value="2">2 years</option>
          </select>
        </label>
        <div className="text-xs text-slate-500">
          <span className="font-semibold text-slate-900">
            {formatPrice(listing.price)}
          </span>{' '}
          per year
        </div>
      </div>
      {disabled ? children : <Button onClick={onMakeOffer} className="w-full sm:w-auto">Make offer</Button>}
    </>
  );
}

function SalesCta({
  listing,
  disabled,
  children,
  onMakeOffer,
}: {
  listing: PublicListingDetail;
  disabled: boolean;
  children: React.ReactNode;
  onMakeOffer: () => void;
}) {
  return (
    <>
      <div className="text-sm">
        <span className="font-semibold text-slate-900">
          {formatPrice(listing.price)}
        </span>
      </div>
      {disabled ? children : <Button onClick={onMakeOffer} className="w-full sm:w-auto">Make offer</Button>}
    </>
  );
}

function formatPrice(value: number | null): string {
  if (value == null) return '—';
  return `₦${value.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}
