'use client';

/**
 * Student accommodation inventory editor — unit types and rooms. Gender tag
 * hidden on self-contain units per product brief §8.3.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addRoom,
  addUnitType,
  deleteUnitType,
  listUnitTypes,
  type UnitTypeView,
} from '@/lib/listings';

interface Props {
  listingId: string;
}

export function StudentInventory({ listingId }: Props) {
  const [units, setUnits] = useState<UnitTypeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-unit-type form state
  const [name, setName] = useState('');
  const [kind, setKind] = useState<UnitTypeView['kind']>('single_room');
  const [bedsPerRoom, setBedsPerRoom] = useState('1');
  const [totalUnits, setTotalUnits] = useState('1');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  async function refresh() {
    setLoading(true);
    try {
      setUnits(await listUnitTypes(listingId));
    } finally {
      setLoading(false);
    }
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addUnitType(listingId, {
        name: name.trim(),
        kind,
        beds_per_room: Number(bedsPerRoom),
        total_units: Number(totalUnits),
      });
      setName('');
      setBedsPerRoom('1');
      setTotalUnits('1');
      await refresh();
    } catch {
      setError('Could not add unit type.');
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteUnitType(listingId, id);
      await refresh();
    } catch {
      setError('Could not delete this unit type (occupants may exist).');
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-slate-900">Inventory</h2>
      <form onSubmit={onAdd} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs text-slate-500">Add a unit type, then add rooms below.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            placeholder="Unit name (e.g. 2-in-a-room)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as UnitTypeView['kind'])}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="single_room">Single room</option>
            <option value="two_in_a_room">2-in-a-room</option>
            <option value="three_in_a_room">3-in-a-room</option>
            <option value="self_contain">Self-contain</option>
            <option value="custom">Custom</option>
          </select>
          <Input
            inputMode="numeric"
            placeholder="Beds per room"
            value={bedsPerRoom}
            onChange={(e) => setBedsPerRoom(e.target.value.replace(/[^0-9]/g, ''))}
            required
          />
          <Input
            inputMode="numeric"
            placeholder="Total units"
            value={totalUnits}
            onChange={(e) => setTotalUnits(e.target.value.replace(/[^0-9]/g, ''))}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={adding || !name.trim()}>
          {adding ? 'Adding…' : 'Add unit type'}
        </Button>
      </form>
      {loading ? (
        <p className="text-sm text-slate-500">Loading inventory…</p>
      ) : (
        <ul className="space-y-3">
          {units.map((u) => (
            <UnitTypeCard key={u.id} listingId={listingId} unit={u} onChange={refresh} onDelete={onDelete} />
          ))}
          {units.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No unit types yet.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function UnitTypeCard({
  listingId,
  unit,
  onChange,
  onDelete,
}: {
  listingId: string;
  unit: UnitTypeView;
  onChange: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [roomName, setRoomName] = useState('');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelfContain = unit.kind === 'self_contain';

  async function addOne() {
    if (!roomName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addRoom(listingId, unit.id, {
        name: roomName.trim(),
        gender_tag: isSelfContain ? 'any' : gender,
        beds_total: unit.beds_per_room,
      });
      setRoomName('');
      await onChange();
    } catch {
      setError('Could not add room.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{unit.name}</div>
          <div className="text-xs text-slate-500">
            {unit.kind.replaceAll('_', ' ')} · {unit.beds_per_room} bed(s) per room · {unit.total_units} units
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onDelete(unit.id)}
          className="text-xs text-slate-500 hover:text-red-600"
        >
          Delete unit type
        </button>
      </header>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          placeholder="Room name (e.g. Block A Room 1)"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
        />
        {!isSelfContain && (
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as 'female' | 'male')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        )}
        <Button onClick={() => void addOne()} disabled={busy || !roomName.trim()}>
          {busy ? 'Adding…' : 'Add room'}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {unit.rooms.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {unit.rooms.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-slate-700">
              <span>
                {r.name}
                <span className="ml-2 text-xs text-slate-500">({r.gender_tag})</span>
              </span>
              <span className="text-xs text-slate-500">
                {r.beds_available} of {r.beds_total} available
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
