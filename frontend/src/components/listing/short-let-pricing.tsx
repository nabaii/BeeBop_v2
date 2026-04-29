'use client';

/**
 * Short-let pricing and availability. Sits in the creation wizard for
 * short-let listings — no effect on other categories.
 */

import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { setShortLetPricing, type ListingView } from '@/lib/listings';

interface Props {
  listing: ListingView;
  onSaved: (next: ListingView) => void;
}

const DEBOUNCE_MS = 600;

export function ShortLetPricing({ listing, onSaved }: Props) {
  const td = listing.type_data as Record<string, number | boolean | undefined>;
  const [baseRate, setBaseRate] = useState(String(td.base_rate ?? ''));
  const [weekendRate, setWeekendRate] = useState(String(td.weekend_rate ?? ''));
  const [minStay, setMinStay] = useState(String(td.min_stay_nights ?? '1'));
  const [turnaround, setTurnaround] = useState(String(td.turnaround_days ?? '0'));
  const [instant, setInstant] = useState(Boolean(td.instant_booking));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function schedule(next: Partial<{ base: string; weekend: string; min: string; turn: string; instant: boolean }>) {
    const baseRateValue = Number(next.base ?? baseRate);
    if (!baseRateValue || baseRateValue <= 0) return;
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const updated = await setShortLetPricing(listing.id, {
          base_rate: baseRateValue,
          weekend_rate: (next.weekend ?? weekendRate) ? Number(next.weekend ?? weekendRate) : undefined,
          min_stay_nights: Number(next.min ?? minStay) || 1,
          turnaround_days: Number(next.turn ?? turnaround) || 0,
          instant_booking: next.instant ?? instant,
        });
        onSaved(updated);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, DEBOUNCE_MS);
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Pricing &amp; availability</h2>
          <p className="text-xs text-slate-500">Set the nightly rate. Weekend uplift optional.</p>
        </div>
        <span className="text-xs text-slate-500">
          {status === 'saving' && 'Saving…'}
          {status === 'saved' && 'Saved'}
          {status === 'error' && <span className="text-red-600">Save failed</span>}
        </span>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Labelled label="Base nightly rate (₦)">
          <Input
            inputMode="numeric"
            value={baseRate}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setBaseRate(v);
              schedule({ base: v });
            }}
          />
        </Labelled>
        <Labelled label="Weekend rate (₦, optional)">
          <Input
            inputMode="numeric"
            value={weekendRate}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setWeekendRate(v);
              schedule({ weekend: v });
            }}
          />
        </Labelled>
        <Labelled label="Minimum stay (nights)">
          <Input
            inputMode="numeric"
            value={minStay}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setMinStay(v);
              schedule({ min: v });
            }}
          />
        </Labelled>
        <Labelled label="Turnaround window (days)">
          <Input
            inputMode="numeric"
            value={turnaround}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '');
              setTurnaround(v);
              schedule({ turn: v });
            }}
          />
        </Labelled>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={instant}
          onChange={(e) => {
            setInstant(e.target.checked);
            schedule({ instant: e.target.checked });
          }}
          className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
        />
        Allow instant booking (no host approval per booking)
      </label>
    </section>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
