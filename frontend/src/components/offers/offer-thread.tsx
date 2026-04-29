'use client';

/**
 * Shared rendering of a single offer thread — used by both the seeker and
 * landlord dashboards. The action set differs based on `viewerRole`.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { MAX_OFFER_ROUNDS, offers, type OfferThreadView } from '@/lib/offers';

interface Props {
  thread: OfferThreadView;
  viewerRole: 'seeker' | 'landlord';
  onChanged: () => Promise<void>;
}

export function OfferThreadCard({ thread, viewerRole, onChanged }: Props) {
  const [counterMode, setCounterMode] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');
  const [busy, setBusy] = useState<'accept' | 'counter' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remaining = useCountdown(thread.expires_at);

  // It's "your turn" when:
  //  • landlord viewer + the thread is awaiting landlord response
  //  • seeker viewer  + the thread is NOT awaiting landlord response
  const yourTurn =
    thread.status === 'pending' &&
    ((viewerRole === 'landlord' && thread.awaiting_landlord_response) ||
      (viewerRole === 'seeker' && !thread.awaiting_landlord_response));

  const latestRound = thread.rounds[thread.rounds.length - 1];
  const hitRoundCap = latestRound.round_number >= MAX_OFFER_ROUNDS;

  async function run(label: 'accept' | 'counter' | 'reject') {
    setBusy(label);
    setError(null);
    try {
      if (label === 'accept') await offers.accept(thread.current_offer_id);
      else if (label === 'reject') await offers.reject(thread.current_offer_id);
      else
        await offers.counter(thread.current_offer_id, {
          price: Number(counterPrice),
        });
      setCounterMode(false);
      setCounterPrice('');
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/listings/${thread.listing_id}`}
            className="text-sm font-semibold text-slate-900 hover:underline"
          >
            {thread.listing_title}
          </Link>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            {thread.listing_category.replace('_', ' ')}
            {' · '}
            {viewerRole === 'landlord'
              ? `from ${thread.seeker_name}`
              : `to ${thread.landlord_name}`}
          </div>
        </div>
        <StatusBadge thread={thread} remaining={remaining} yourTurn={yourTurn} />
      </header>

      <ol className="mt-3 space-y-2">
        {thread.rounds.map((r) => (
          <li
            key={r.id}
            className={
              'flex items-center justify-between rounded-lg border px-3 py-2 text-sm ' +
              (r.id === thread.current_offer_id
                ? 'border-brand/40 bg-brand/5'
                : 'border-slate-200 bg-slate-50')
            }
          >
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Round {r.round_number}
              </span>
              <span className="ml-2 capitalize text-slate-600">
                ({r.submitted_by})
              </span>
              {r.conditions && (
                <p className="mt-0.5 text-xs text-slate-500">{r.conditions}</p>
              )}
            </div>
            <span className="font-semibold text-slate-900">
              ₦{Number(r.price).toLocaleString('en-NG')}
            </span>
          </li>
        ))}
      </ol>

      {thread.requires_visit_before_acceptance &&
        thread.visit_id &&
        thread.status === 'accepted' && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠ Visit pending agent assignment. Agreement signing unlocks after the
            visit report is approved.
          </p>
        )}

      {thread.status === 'pending' && yourTurn && (
        <footer className="mt-3 space-y-2">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {counterMode ? (
            <div className="space-y-2">
              <Input
                inputMode="numeric"
                value={counterPrice}
                onChange={(e) => setCounterPrice(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Your counter (₦)"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => void run('counter')}
                  disabled={busy !== null || !counterPrice}
                >
                  {busy === 'counter' ? 'Sending…' : 'Send counter'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCounterMode(false);
                    setCounterPrice('');
                  }}
                  disabled={busy !== null}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button onClick={() => void run('accept')} disabled={busy !== null}>
                {busy === 'accept' ? 'Accepting…' : 'Accept'}
              </Button>
              {!hitRoundCap && (
                <Button
                  variant="secondary"
                  onClick={() => setCounterMode(true)}
                  disabled={busy !== null}
                >
                  Counter
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => void run('reject')}
                disabled={busy !== null}
              >
                {busy === 'reject' ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          )}
          {hitRoundCap && !counterMode && (
            <p className="text-xs text-amber-700">
              Round {MAX_OFFER_ROUNDS} reached — this offer must be accepted or rejected.
            </p>
          )}
        </footer>
      )}
    </article>
  );
}

function StatusBadge({
  thread,
  remaining,
  yourTurn,
}: {
  thread: OfferThreadView;
  remaining: string;
  yourTurn: boolean;
}) {
  const colour =
    thread.status === 'accepted'
      ? 'bg-emerald-100 text-emerald-800'
      : thread.status === 'rejected'
        ? 'bg-red-100 text-red-800'
        : thread.status === 'expired'
          ? 'bg-slate-200 text-slate-700'
          : yourTurn
            ? 'bg-brand text-white'
            : 'bg-amber-100 text-amber-800';

  let text: string;
  if (thread.status === 'accepted') text = 'Accepted';
  else if (thread.status === 'rejected') text = 'Rejected';
  else if (thread.status === 'expired') text = 'Expired';
  else if (yourTurn) text = `Your turn · ${remaining}`;
  else text = `Awaiting other side · ${remaining}`;

  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${colour}`}>
      {text}
    </span>
  );
}

function useCountdown(iso: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return '0h';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
