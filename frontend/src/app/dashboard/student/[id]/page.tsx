'use client';

/**
 * Per-listing student PMS view. Unit-type panels with F × N / M × N
 * breakdown, room grid, gender lock indicator, available-bed count.
 */

import type { Route } from 'next';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';

import { EmptyPanel } from '@/components/dashboard/empty-panel';
import { StatTile } from '@/components/dashboard/stat-tile';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { dashboards, type StudentPMS } from '@/lib/dashboards';
import { listUnitTypes, type UnitTypeView } from '@/lib/listings';

export default function StudentPMSPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [pms, setPms] = useState<StudentPMS | null>(null);
  const [units, setUnits] = useState<UnitTypeView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([dashboards.studentPMS(id), listUnitTypes(id)])
      .then(([p, u]) => {
        if (cancelled) return;
        setPms(p);
        setUnits(u);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load this PMS view.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6 sm:p-10">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/dashboard/student" className="mt-3 inline-block text-sm text-brand underline">
          Back to PMS index
        </Link>
      </main>
    );
  }
  if (!pms) {
    return <main className="p-8 text-sm text-slate-500">Loading…</main>;
  }

  const overall = pms.overall;
  const totalBeds =
    overall.female_total + overall.male_total + overall.any_total;
  const availableBeds =
    overall.female_available + overall.male_available + overall.any_available;
  const occupancyPct = totalBeds === 0 ? 0 : Math.round(((totalBeds - availableBeds) / totalBeds) * 100);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 sm:p-10">
      <header>
        <Link href="/dashboard/student" className="text-xs text-slate-500 hover:underline">
          ← All student listings
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {pms.listing_title ?? 'Untitled'}
        </h1>
        <p className="text-sm text-slate-500">Inventory and occupancy</p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Total beds" value={totalBeds} />
        <StatTile label="Available" value={availableBeds} />
        <StatTile label="Occupied" value={totalBeds - availableBeds} />
        <StatTile label="Occupancy" value={`${occupancyPct}%`} emphasis={occupancyPct > 80} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Gender breakdown</h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BreakdownTile label="Female" total={overall.female_total} avail={overall.female_available} />
          <BreakdownTile label="Male" total={overall.male_total} avail={overall.male_available} />
          <BreakdownTile label="Self-contain" total={overall.any_total} avail={overall.any_available} />
        </ul>
      </section>

      <section>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Units & rooms</h2>
          <Link href={`/listings/edit/${id}` as Route}>
            <Button variant="secondary">Edit inventory</Button>
          </Link>
        </header>
        {units && units.length > 0 ? (
          <ul className="space-y-3">
            {units.map((u) => (
              <li key={u.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <header className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-500">
                      {u.kind.replaceAll('_', ' ')} · {u.beds_per_room} bed(s) per room ·{' '}
                      {u.total_units} units
                    </div>
                  </div>
                </header>
                {u.rooms.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">No rooms added yet.</p>
                ) : (
                  <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {u.rooms.map((r) => {
                      const occupied = r.beds_total - r.beds_available;
                      const status =
                        r.beds_available === 0
                          ? { label: 'Occupied', color: 'bg-red-100 text-red-700' }
                          : occupied > 0
                            ? { label: 'Vacating', color: 'bg-amber-100 text-amber-800' }
                            : { label: 'Available', color: 'bg-emerald-100 text-emerald-700' };
                      return (
                        <li
                          key={r.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{r.name}</div>
                            <div className="text-xs text-slate-500">
                              {r.gender_tag === 'any'
                                ? 'self-contain'
                                : `${r.gender_tag} · gender locked when occupied`}
                              {' · '}
                              {r.beds_available} of {r.beds_total} available
                            </div>
                          </div>
                          <span
                            className={
                              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                              status.color
                            }
                          >
                            {status.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No unit types yet.</p>
        )}
      </section>

      <EmptyPanel
        title="Waitlist"
        hint="Per-unit-type waitlist with gender breakdown. Wires up when seekers can express interest in unavailable beds."
        comingIn="Sprint 8"
      />
    </main>
  );
}

function BreakdownTile({
  label,
  total,
  avail,
}: {
  label: string;
  total: number;
  avail: number;
}) {
  const occupied = total - avail;
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">
        {avail} / {total}
      </div>
      <div className="text-xs text-slate-500">{occupied} occupied</div>
    </li>
  );
}
