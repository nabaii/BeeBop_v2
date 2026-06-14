'use client';

/**
 * Rolling availability calendar. Sprint 5 paints day cells with
 * availability + per-night rate. Booked / turnaround states arrive in
 * Sprint 11 once the Booking table is populated.
 */

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { ShortLetCalendarDay } from '@/lib/dashboards';

const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ShortLetCalendar({
  days,
  onWindowChange,
}: {
  days: ShortLetCalendarDay[];
  onWindowChange: (next: number) => void;
}) {
  const [window, setWindow] = useState(days.length);

  function pickWindow(n: number) {
    setWindow(n);
    onWindowChange(n);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Availability</h2>
        <div className="flex gap-1.5">
          {[14, 30, 60, 90].map((n) => (
            <Button
              key={n}
              variant={window === n ? 'primary' : 'secondary'}
              onClick={() => pickWindow(n)}
            >
              {n} days
            </Button>
          ))}
        </div>
      </header>
      <ul className="grid grid-cols-7 gap-1.5 text-xs">
        {days.map((d) => {
          const date = new Date(d.date);
          return (
            <li
              key={d.date}
              className={cn(
                'flex flex-col items-center rounded-lg border px-2 py-2 text-center',
                d.state === 'available' && 'border-emerald-200 bg-emerald-50',
                d.state === 'booked' && 'border-red-200 bg-red-50',
                d.state === 'turnaround' && 'border-amber-200 bg-amber-50',
              )}
              title={`${d.date} — ${d.state}`}
            >
              <span className="text-caption uppercase tracking-wide text-slate-500">
                {SHORT_DAY[date.getUTCDay()]}
              </span>
              <span className="text-sm font-semibold text-slate-900">{date.getUTCDate()}</span>
              {d.rate != null && (
                <span className="text-caption text-slate-500">
                  ₦{Math.round(d.rate / 1000)}k{d.is_weekend && '*'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex items-center gap-3 text-caption text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-emerald-300" /> Available
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-amber-300" /> Turnaround (Sprint 11)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-red-300" /> Booked (Sprint 11)
        </span>
        <span className="ml-auto">* weekend rate</span>
      </p>
    </div>
  );
}
