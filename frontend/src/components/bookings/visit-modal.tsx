'use client';

/**
 * Off-campus "Visit" modal. The seeker picks at least two preferred dates;
 * the request drops into the admin queue and a Beebop trusted agent is
 * assigned to show them the property.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import type { PublicListingDetail } from '@/lib/search';
import { visits } from '@/lib/visits';

interface Props {
  listing: PublicListingDetail;
  onClose: () => void;
  onRequested: () => void;
}

const MIN_DATES = 2;
const MAX_DATES = 5;
const todayIso = () => new Date().toISOString().slice(0, 10);

export function VisitModal({ listing, onClose, onRequested }: Props) {
  // Start with two empty slots — at least two dates are required.
  const [dates, setDates] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setDate = (i: number, value: string) =>
    setDates((prev) => prev.map((d, idx) => (idx === i ? value : d)));
  const addDate = () =>
    setDates((prev) => (prev.length < MAX_DATES ? [...prev, ''] : prev));
  const removeDate = (i: number) =>
    setDates((prev) => prev.filter((_, idx) => idx !== i));

  async function submit() {
    const chosen = Array.from(new Set(dates.filter(Boolean)));
    if (chosen.length < MIN_DATES) {
      setError('Pick at least two different dates.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await visits.request(listing.id, chosen);
      onRequested();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not request a visit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <header className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Organise a visit</h2>
            <p className="mt-1 text-sm text-slate-500">{listing.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="text-sm text-slate-600">
            Pick at least two dates that work for you. A Beebop trusted agent
            will confirm one of them and show you around.
          </p>

          <div className="space-y-2">
            {dates.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Preferred date {i + 1}
                    {i < MIN_DATES ? '' : ' (optional)'}
                  </span>
                  <Input
                    type="date"
                    min={todayIso()}
                    aria-label={`Preferred date ${i + 1}`}
                    value={value}
                    onChange={(e) => setDate(i, e.target.value)}
                    className="w-full"
                  />
                </label>
                {dates.length > MIN_DATES && (
                  <button
                    type="button"
                    onClick={() => removeDate(i)}
                    className="mt-5 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label={`Remove date ${i + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {dates.length < MAX_DATES && (
            <button
              type="button"
              onClick={addDate}
              className="text-sm font-medium text-brand hover:underline"
            >
              + Add another date
            </button>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Requesting…' : 'Request visit'}
          </Button>
        </form>
      </div>
    </div>
  );
}
