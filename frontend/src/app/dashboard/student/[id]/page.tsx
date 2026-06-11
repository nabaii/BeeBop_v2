'use client';

/**
 * Per-listing student PMS view. Unit-type panels with F × N / M × N
 * breakdown, room grid, gender lock indicator, and editable available-bed
 * counts. Occupancy figures are derived live from the room inventory so they
 * stay in sync as beds are freed / occupied here.
 */

import type { Route } from 'next';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

import { EmptyPanel } from '@/components/dashboard/empty-panel';
import { StatTile } from '@/components/dashboard/stat-tile';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { dashboards, type StudentPMS } from '@/lib/dashboards';
import { listUnitTypes, updateRoom, type RoomView, type UnitTypeView } from '@/lib/listings';

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

  // Persist a new available-bed count for a room, optimistically updating local
  // state. Throws on failure so the row can surface the error and roll back.
  async function setBedsAvailable(unitId: string, room: RoomView, next: number) {
    const clamped = Math.max(0, Math.min(room.beds_total, next));
    if (clamped === room.beds_available) return;
    setUnits((prev) =>
      prev?.map((u) =>
        u.id === unitId
          ? { ...u, rooms: u.rooms.map((r) => (r.id === room.id ? { ...r, beds_available: clamped } : r)) }
          : u,
      ) ?? prev,
    );
    try {
      await updateRoom(id, unitId, room.id, { beds_available: clamped });
    } catch (err) {
      // Roll back the optimistic change.
      setUnits((prev) =>
        prev?.map((u) =>
          u.id === unitId
            ? {
                ...u,
                rooms: u.rooms.map((r) =>
                  r.id === room.id ? { ...r, beds_available: room.beds_available } : r,
                ),
              }
            : u,
        ) ?? prev,
      );
      throw err;
    }
  }

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
  if (!pms || !units) {
    return <main className="p-8 text-sm text-slate-500">Loading…</main>;
  }

  const tally = tallyBeds(units);
  const totalBeds = tally.female_total + tally.male_total + tally.any_total;
  const availableBeds = tally.female_available + tally.male_available + tally.any_available;
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
          <BreakdownTile label="Female" total={tally.female_total} avail={tally.female_available} />
          <BreakdownTile label="Male" total={tally.male_total} avail={tally.male_available} />
          <BreakdownTile label="Self-contain" total={tally.any_total} avail={tally.any_available} />
        </ul>
      </section>

      <section>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Units & rooms</h2>
          <Link href={`/listings/edit/${id}` as Route}>
            <Button variant="secondary">Edit inventory</Button>
          </Link>
        </header>
        {units.length > 0 ? (
          <ul className="space-y-3">
            {units.map((u) => (
              <li key={u.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <header className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-500">
                      {u.kind.replaceAll('_', ' ')} · {u.beds_per_room} bed(s) per room ·{' '}
                      {u.total_units} units · {u.gender_tag} · ₦{u.price.toLocaleString()}
                    </div>
                  </div>
                </header>
                {u.rooms.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">No rooms added yet.</p>
                ) : (
                  <ul className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {u.rooms.map((r) => (
                      <RoomCard
                        key={r.id}
                        room={r}
                        onSetBeds={(next) => setBedsAvailable(u.id, r, next)}
                      />
                    ))}
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

function RoomCard({
  room,
  onSetBeds,
}: {
  room: RoomView;
  onSetBeds: (next: number) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const occupied = room.beds_total - room.beds_available;
  const status =
    room.beds_available === 0
      ? { label: 'Occupied', color: 'bg-red-100 text-red-700' }
      : occupied > 0
        ? { label: 'Vacating', color: 'bg-amber-100 text-amber-800' }
        : { label: 'Available', color: 'bg-emerald-100 text-emerald-700' };

  async function step(delta: number) {
    setSaving(true);
    setError(null);
    try {
      await onSetBeds(room.beds_available + delta);
    } catch {
      setError('Could not update beds.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{room.name}</div>
        </div>
        <span className={'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ' + status.color}>
          {status.label}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">Available beds</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Reduce available beds"
            disabled={saving || room.beds_available <= 0}
            onClick={() => void step(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-slate-900">
            {room.beds_available} / {room.beds_total}
          </span>
          <button
            type="button"
            aria-label="Increase available beds"
            disabled={saving || room.beds_available >= room.beds_total}
            onClick={() => void step(1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </li>
  );
}

interface BedTally {
  female_total: number;
  female_available: number;
  male_total: number;
  male_available: number;
  any_total: number;
  any_available: number;
}

function tallyBeds(units: UnitTypeView[]): BedTally {
  const t: BedTally = {
    female_total: 0,
    female_available: 0,
    male_total: 0,
    male_available: 0,
    any_total: 0,
    any_available: 0,
  };
  for (const u of units) {
    let total = 0;
    let available = 0;
    for (const r of u.rooms) {
      total += r.beds_total;
      available += r.beds_available;
    }
    if (u.gender_tag === 'female') {
      t.female_total += total;
      t.female_available += available;
    } else if (u.gender_tag === 'male') {
      t.male_total += total;
      t.male_available += available;
    } else {
      t.any_total += total;
      t.any_available += available;
    }
  }
  return t;
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
