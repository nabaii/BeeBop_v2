'use client';

/**
 * Admin "all listings" page. Filters by status, category, and a search box.
 * Per-row actions: edit (inline subset), suspend, restore, soft-delete.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import {
  admin,
  type AdminListingRow,
  type AdminListingsResponse,
  type AreaScoreView,
} from '@/lib/admin';
import type { ListingCategory, ListingStatus } from '@/lib/listings';

const STATUSES: ListingStatus[] = [
  'draft',
  'under_doc_review',
  'live_unverified',
  'doc_verified',
  'fully_verified',
  'let_agreed',
  'sale_agreed',
  'suspended',
  'delisted',
];

const CATEGORIES: ListingCategory[] = ['off_campus', 'short_let', 'rent', 'sales'];

export default function AdminListingsPage() {
  const [data, setData] = useState<AdminListingsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<ListingStatus[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<ListingCategory[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scoreListing, setScoreListing] = useState<AdminListingRow | null>(null);

  const params = useMemo(
    () => ({
      status: statusFilter.length ? statusFilter : undefined,
      category: categoryFilter.length ? categoryFilter : undefined,
      q: q.trim() || undefined,
      page,
      page_size: 20,
    }),
    [statusFilter, categoryFilter, q, page],
  );

  async function load() {
    setRefreshing(true);
    setError(null);
    try {
      setData(await admin.listListings(params));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load listings.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
  }

  return (
    <div className="p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">All listings</h1>
        <div className="flex gap-2">
          <Input
            value={q}
            placeholder="Search title or district"
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="w-64"
          />
        </div>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FilterBlock
          label="Status"
          options={STATUSES}
          value={statusFilter}
          onToggle={(v) => {
            setStatusFilter((s) => toggle(s, v));
            setPage(1);
          }}
        />
        <FilterBlock
          label="Category"
          options={CATEGORIES}
          value={categoryFilter}
          onToggle={(v) => {
            setCategoryFilter((s) => toggle(s, v));
            setPage(1);
          }}
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {!data ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : data.items.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-500">No listings match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Listing</th>
                <th className="px-4 py-2">Landlord</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((row) => (
                <Row key={row.id} row={row} onChanged={load} onEditAreaScore={setScoreListing} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > data.page_size && (
        <nav className="mt-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Page {data.page} · {data.total} listings total
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={data.page <= 1 || refreshing}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={data.page * data.page_size >= data.total || refreshing}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
      )}

      {scoreListing && (
        <AreaScoreModal
          row={scoreListing}
          onClose={() => setScoreListing(null)}
          onSaved={async () => {
            setScoreListing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function FilterBlock<T extends string>({
  label,
  options,
  value,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  value: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={
                'rounded-full px-3 py-1 text-xs ' +
                (active ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
              }
            >
              {opt.replaceAll('_', ' ')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  row,
  onChanged,
  onEditAreaScore,
}: {
  row: AdminListingRow;
  onChanged: () => Promise<void>;
  onEditAreaScore: (row: AdminListingRow) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function suspend() {
    const reason = window.prompt('Suspension reason?');
    if (!reason || !reason.trim()) return;
    await run('suspend', () => admin.suspend(row.id, reason.trim()));
  }

  async function restore() {
    await run('restore', () => admin.restore(row.id));
  }

  async function softDelete() {
    if (!window.confirm('Soft-delete this listing? Data is retained.')) return;
    await run('delete', () => admin.softDelete(row.id));
  }

  async function run(label: string, op: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await op();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  const isSuspended = row.status === 'suspended';
  const isDeleted = row.status === 'delisted' || row.deleted_at !== null;

  return (
    <tr>
      <td className="px-4 py-3">
        <Link
          href={`/internal/admin/listings/${row.id}` as Route}
          className="font-medium text-slate-900 hover:text-brand hover:underline"
        >
          {row.title ?? 'Untitled'}
        </Link>
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {row.category.replace('_', ' ')}
        </div>
        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
      </td>
      <td className="px-4 py-3 text-slate-700">{row.landlord_name}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-700">
          {row.status.replaceAll('_', ' ')}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-600">
        {new Date(row.created_at).toLocaleDateString('en-NG')}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex gap-2">
          <Link
            href={`/internal/admin/listings/${row.id}` as Route}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
          >
            Open
          </Link>
          {!isDeleted && !isSuspended && (
            <Button variant="ghost" disabled={busy !== null} onClick={() => void suspend()}>
              {busy === 'suspend' ? 'Suspending…' : 'Suspend'}
            </Button>
          )}
          {!isDeleted && (
            <Button variant="secondary" disabled={busy !== null} onClick={() => onEditAreaScore(row)}>
              Area score
            </Button>
          )}
          {isSuspended && !isDeleted && (
            <Button variant="secondary" disabled={busy !== null} onClick={() => void restore()}>
              {busy === 'restore' ? 'Restoring…' : 'Restore'}
            </Button>
          )}
          {!isDeleted && (
            <Button variant="ghost" disabled={busy !== null} onClick={() => void softDelete()}>
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function AreaScoreModal({
  row,
  onClose,
  onSaved,
}: {
  row: AdminListingRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [score, setScore] = useState<AreaScoreView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    road_condition: '',
    electricity_supply_hours: '',
    security: '',
    proximity: '',
  });

  useEffect(() => {
    let cancelled = false;
    admin
      .getAreaScore(row.id)
      .then((res) => {
        if (cancelled) return;
        setScore(res);
        setForm({
          road_condition: res.road_condition != null ? String(res.road_condition) : '',
          electricity_supply_hours:
            res.electricity_supply_hours != null ? String(res.electricity_supply_hours) : '',
          security: res.security != null ? String(res.security) : '',
          proximity: res.proximity != null ? String(res.proximity) : '',
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load area scores.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await admin.updateAreaScore(row.id, {
        road_condition: form.road_condition ? Number(form.road_condition) : undefined,
        electricity_supply_hours: form.electricity_supply_hours
          ? Number(form.electricity_supply_hours)
          : undefined,
        security: form.security ? Number(form.security) : undefined,
        proximity: form.proximity ? Number(form.proximity) : undefined,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save area scores.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit area score</h2>
            <p className="text-sm text-slate-500">{row.title ?? 'Untitled'}</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
            ×
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {score?.last_assessed_at && (
            <p className="text-xs text-slate-500">
              Last updated {new Date(score.last_assessed_at).toLocaleString('en-NG')}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-700">Road</span>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.road_condition}
                onChange={(e) => setForm((s) => ({ ...s, road_condition: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-700">Electricity</span>
              <Input
                type="number"
                min={0}
                max={24}
                value={form.electricity_supply_hours}
                onChange={(e) =>
                  setForm((s) => ({ ...s, electricity_supply_hours: e.target.value }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-700">Security</span>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.security}
                onChange={(e) => setForm((s) => ({ ...s, security: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-700">Proximity</span>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.proximity}
                onChange={(e) => setForm((s) => ({ ...s, proximity: e.target.value }))}
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save area score'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
