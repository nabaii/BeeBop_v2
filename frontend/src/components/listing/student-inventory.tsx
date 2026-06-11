'use client';

/**
 * Student accommodation inventory editor — unit types and rooms. Gender tag
 * hidden on self-contain units per product brief §8.3.
 */

import { useEffect, useState } from 'react';
import { LayoutGrid, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
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
  const [price, setPrice] = useState('');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [amenities, setAmenities] = useState('');
  const [adding, setAdding] = useState(false);

  const isSelfContain = kind === 'self_contain';

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  // Make beds responsive to selected kind
  useEffect(() => {
    if (kind === 'single_room' || kind === 'self_contain') {
      setBedsPerRoom('1');
    } else if (kind === 'two_in_a_room') {
      setBedsPerRoom('2');
    } else if (kind === 'three_in_a_room') {
      setBedsPerRoom('3');
    }
  }, [kind]);

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
      const amenitiesList = amenities
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      await addUnitType(listingId, {
        name: name.trim(),
        kind,
        beds_per_room: Number(bedsPerRoom),
        total_units: Number(totalUnits),
        price: Number(price),
        gender_tag: isSelfContain ? 'any' : gender,
        amenities: amenitiesList,
      });
      setName('');
      setPrice('');
      setKind('single_room');
      setBedsPerRoom('1');
      setTotalUnits('1');
      setGender('female');
      setAmenities('');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Could not add unit type.');
      } else {
        setError('Could not add unit type.');
      }
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
    <section className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/40 space-y-6">
      <header className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="rounded-xl bg-rose-50 p-2.5 text-rose-600 shrink-0">
          <LayoutGrid className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Inventory</h2>
          <p className="text-xs text-slate-500">Define room unit types and add room instances</p>
        </div>
      </header>
      
      <form onSubmit={onAdd} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Add Unit Type</div>
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
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 cursor-pointer"
          >
            <option value="single_room">Single room</option>
            <option value="two_in_a_room">2-in-a-room</option>
            <option value="three_in_a_room">3-in-a-room</option>
            <option value="self_contain">Self-contain</option>
            <option value="custom">Custom</option>
          </select>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-500 ml-1">Beds per room</label>
            <Input
              inputMode="numeric"
              placeholder="Beds per room"
              value={bedsPerRoom}
              disabled={kind !== 'custom'}
              onChange={(e) => setBedsPerRoom(e.target.value.replace(/[^0-9]/g, ''))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-500 ml-1">Total units</label>
            <Input
              inputMode="numeric"
              placeholder="Total units"
              value={totalUnits}
              onChange={(e) => setTotalUnits(e.target.value.replace(/[^0-9]/g, ''))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-slate-500 ml-1">Price (₦)</label>
            <Input
              inputMode="numeric"
              placeholder="Price (per unit in Naira)"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-500 ml-1">Sex</label>
            {!isSelfContain ? (
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'female' | 'male')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 cursor-pointer"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm italic text-slate-400">
                Self-contain (Any)
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-500 ml-1">Amenities</label>
            <Input
              placeholder="e.g. Private Bathroom, TV, AC"
              value={amenities}
              onChange={(e) => setAmenities(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        <Button type="submit" disabled={adding || !name.trim()} className="w-full sm:w-auto">
          {adding ? 'Adding…' : 'Add unit type'}
        </Button>
      </form>
      
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-4 justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span className="text-xs">Loading inventory...</span>
        </div>
      ) : (
        <ul className="space-y-4">
          {units.map((u) => (
            <UnitTypeCard key={u.id} listingId={listingId} unit={u} onChange={refresh} onDelete={onDelete} />
          ))}
          {units.length === 0 && (
            <li className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50/20 rounded-xl p-6 text-center text-slate-400">
              <LayoutGrid className="h-5 w-5 mb-2" />
              <span className="text-xs font-semibold">No unit types yet.</span>
              <span className="text-[10px]">Add your first unit type above.</span>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addOne() {
    if (!roomName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addRoom(listingId, unit.id, {
        name: roomName.trim(),
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
    <li className="rounded-xl border border-slate-200 bg-slate-50/30 p-4 sm:p-5 hover:border-brand/40 transition-colors">
      <header className="flex items-start justify-between border-b border-slate-100 pb-3">
        <div className="flex-1 min-w-0 pr-4">
          <div className="text-sm font-bold text-slate-900 flex justify-between items-center w-full">
            <span className="truncate flex items-center gap-2">
              {unit.name}
              <GenderBadge gender={unit.gender_tag} />
            </span>
            <span className="text-brand font-bold shrink-0 ml-2">₦{unit.price.toLocaleString()}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1 capitalize">
            {unit.kind.replaceAll('_', ' ')} · {unit.beds_per_room} bed(s)/room · {unit.total_units} units
          </div>
          {unit.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {unit.amenities.map((amenity, idx) => (
                <span
                  key={idx}
                  className="inline-block rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 border border-stone-200/60"
                >
                  {amenity}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void onDelete(unit.id)}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </header>
      
      <div className="mt-4 bg-white rounded-xl border border-slate-200 p-3.5 space-y-3">
        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Add Room Instance</div>
        <p className="text-[11px] text-slate-400">
          Sex and amenities are set on the unit type above and apply to every room here.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input
              placeholder="Room name (e.g. Block A Room 1)"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
          </div>
          <Button onClick={() => void addOne()} disabled={busy || !roomName.trim()} className="w-full">
            {busy ? 'Adding…' : 'Add room'}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      </div>

      {unit.rooms.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Room Instances</div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white overflow-hidden text-xs">
            {unit.rooms.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-3 text-slate-700 hover:bg-slate-50 transition-colors">
                <span className="font-semibold text-slate-900">{r.name}</span>
                <span className="font-bold text-slate-500">
                  {r.beds_available} of {r.beds_total} available
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function GenderBadge({ gender }: { gender: 'female' | 'male' | 'any' }) {
  return (
    <span
      className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
        gender === 'female'
          ? 'bg-rose-50 text-rose-600 border border-rose-100'
          : gender === 'male'
            ? 'bg-blue-50 text-blue-600 border border-blue-100'
            : 'bg-slate-100 text-slate-600 border border-slate-200'
      }`}
    >
      {gender}
    </span>
  );
}
