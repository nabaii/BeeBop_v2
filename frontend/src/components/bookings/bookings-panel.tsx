'use client';

/**
 * Reusable bookings panel — variant by viewer role.
 *
 *   seeker view:  upcoming + access details (when released) + cancel
 *   host view:    requests with Accept/Decline + upcoming with check-in
 *                 confirmation + access-details editor
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { bookings, type BookingView } from '@/lib/bookings';

interface Props {
  viewerRole: 'seeker' | 'host';
}

export function BookingsPanel({ viewerRole }: Props) {
  const [items, setItems] = useState<BookingView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list =
        viewerRole === 'seeker'
          ? await bookings.myBookings()
          : await bookings.hostBookings();
      setItems(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load bookings.');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRole]);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">
        {viewerRole === 'seeker' ? 'Stays' : 'Bookings'}
      </h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          {viewerRole === 'seeker' ? 'No bookings yet.' : 'No bookings on your listings yet.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((b) => (
            <li key={b.id}>
              <BookingCard booking={b} viewerRole={viewerRole} onChanged={refresh} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BookingCard({
  booking,
  viewerRole,
  onChanged,
}: {
  booking: BookingView;
  viewerRole: 'seeker' | 'host';
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'accept' | 'decline' | 'cancel' | 'check-in' | 'access' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessDraft, setAccessDraft] = useState(booking.access_details ?? '');

  async function run<T>(label: typeof busy, fn: () => Promise<T>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <header className="flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{booking.listing_title}</div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {booking.check_in} → {booking.check_out} · {booking.guest_count} guest(s)
          </div>
        </div>
        <StatusPill booking={booking} />
      </header>

      <dl className="grid grid-cols-1 gap-2 text-xs text-slate-600 min-[380px]:grid-cols-2">
        <div>
          <dt>Total</dt>
          <dd className="font-medium text-slate-900">
            ₦{Math.round(booking.grand_total).toLocaleString('en-NG')}
          </dd>
        </div>
        <div>
          <dt>{viewerRole === 'host' ? 'Payout' : 'Service fee'}</dt>
          <dd className="font-medium text-slate-900">
            ₦
            {viewerRole === 'host'
              ? Math.round(booking.base_total - booking.host_fee).toLocaleString('en-NG')
              : Math.round(booking.seeker_fee).toLocaleString('en-NG')}
          </dd>
        </div>
      </dl>

      {viewerRole === 'seeker' && booking.status === 'confirmed' && booking.access_details_visible && (
        <pre className="whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
          {booking.access_details}
        </pre>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {viewerRole === 'host' && booking.status === 'requested' && !booking.instant_booking && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy !== null}
            onClick={() => run('accept', () => bookings.accept(booking.id))}
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() => {
              const reason = window.prompt('Decline reason?');
              if (!reason || !reason.trim()) return;
              void run('decline', () => bookings.decline(booking.id, reason.trim()));
            }}
          >
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </Button>
        </div>
      )}

      {viewerRole === 'host' && booking.status === 'confirmed' && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">
              Access details (sent to seeker on check-in day)
            </span>
            <textarea
              value={accessDraft}
              onChange={(e) => setAccessDraft(e.target.value)}
              rows={3}
              maxLength={4000}
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy !== null || !accessDraft.trim()}
              onClick={() =>
                run('access', () => bookings.setAccessDetails(booking.id, accessDraft.trim()))
              }
            >
              {busy === 'access' ? 'Saving…' : 'Save access details'}
            </Button>
            <Button
              disabled={busy !== null}
              onClick={() => run('check-in', () => bookings.confirmCheckIn(booking.id))}
            >
              {busy === 'check-in' ? 'Confirming…' : 'Confirm check-in (triggers payout)'}
            </Button>
          </div>
        </div>
      )}

      {(booking.status === 'requested' || booking.status === 'confirmed') && (
        <button
          type="button"
          disabled={busy !== null}
          className="text-xs text-red-600 hover:underline"
          onClick={() => {
            const reason = window.prompt('Cancellation reason?');
            if (!reason || !reason.trim()) return;
            void run('cancel', () => bookings.cancel(booking.id, reason.trim()));
          }}
        >
          {busy === 'cancel' ? 'Cancelling…' : 'Cancel booking'}
        </button>
      )}

      {booking.status === 'completed' && booking.payout_amount && viewerRole === 'host' && (
        <p className="text-xs text-slate-600">
          Payout sent: ₦{Math.round(booking.payout_amount).toLocaleString('en-NG')}
        </p>
      )}
    </article>
  );
}

function StatusPill({ booking }: { booking: BookingView }) {
  const map: Record<string, { label: string; colour: string }> = {
    requested: {
      label: booking.instant_booking ? 'Awaiting payment' : 'Awaiting host',
      colour: 'bg-amber-100 text-amber-800',
    },
    confirmed: { label: 'Confirmed', colour: 'bg-emerald-100 text-emerald-800' },
    cancelled: { label: 'Cancelled', colour: 'bg-red-100 text-red-800' },
    completed: { label: 'Completed', colour: 'bg-slate-200 text-slate-700' },
  };
  const meta = map[booking.status] ?? {
    label: booking.status,
    colour: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.colour}`}>
      {meta.label}
    </span>
  );
}
