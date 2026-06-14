'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  admin,
  type InspectionReviewDetail,
  type InspectionReviewQueueRow,
} from '@/lib/admin';

type ActionKind = 'approve' | 'query' | 'reject';
type AmenityStatus = 'present' | 'not_confirmed' | 'absent';

interface ChecklistAssessment {
  existence?: string;
  existenceNote?: string;
  accuracy?: string;
  accuracyNote?: string;
  amenities?: Record<string, Record<string, AmenityStatus>>;
  structuralCondition?: number;
  structuralNote?: string;
}

export default function InspectionReviewPage() {
  const [items, setItems] = useState<InspectionReviewQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<InspectionReviewQueueRow | null>(null);

  async function refresh() {
    try {
      const res = await admin.inspectionReviewQueue();
      setItems(res.items);
    } catch {
      setError('Could not load the inspection queue.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="p-6 sm:p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inspection review</h1>
          <p className="mt-1 text-sm text-slate-500">Submitted reports awaiting admin review.</p>
        </div>
        {items && (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
            {items.length} pending
          </span>
        )}
      </header>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items === null ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-500">No pending inspection reports.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Property</th>
                <th className="px-4 py-2">Inspector</th>
                <th className="px-4 py-2">Landlord</th>
                <th className="px-4 py-2">Submitted</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row) => (
                <tr key={row.report_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.listing_title}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      {row.category.replaceAll('_', ' ')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.inspector_name}</td>
                  <td className="px-4 py-3 text-slate-700">{row.landlord_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.submitted_at
                      ? new Date(row.submitted_at).toLocaleString('en-NG')
                      : 'Not submitted'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" onClick={() => setActive(row)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {active && (
        <ReviewDrawer
          row={active}
          onClose={() => setActive(null)}
          onResolved={async () => {
            setActive(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function ReviewDrawer({
  row,
  onClose,
  onResolved,
}: {
  row: InspectionReviewQueueRow;
  onClose: () => void;
  onResolved: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<InspectionReviewDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    admin
      .inspectionReport(row.report_id)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load this inspection report.');
      });
    return () => {
      cancelled = true;
    };
  }, [row.report_id]);

  async function run(action: ActionKind) {
    if (action !== 'approve' && !note.trim()) {
      setActionError('A note is required to query or reject.');
      return;
    }
    setBusy(action);
    setActionError(null);
    try {
      if (action === 'approve') await admin.approveInspection(row.report_id, note.trim() || undefined);
      else if (action === 'query') await admin.queryInspection(row.report_id, note.trim());
      else await admin.rejectInspection(row.report_id, note.trim());
      await onResolved();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  const checklist = useMemo(() => {
    const payload = (detail?.assessment ?? {}) as { checklist?: ChecklistAssessment };
    return payload.checklist ?? {};
  }, [detail]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{row.listing_title}</div>
            <div className="text-xs text-slate-500">
              {row.inspector_name} · {row.landlord_name}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loadError && <p className="text-sm text-red-600">{loadError}</p>}
          {!detail && !loadError && <p className="text-sm text-slate-500">Loading…</p>}
          {detail && (
            <div className="space-y-6">
              <section className="grid gap-3 sm:grid-cols-4">
                <StatCard label="Status" value={detail.status.replaceAll('_', ' ')} />
                <StatCard
                  label="Submitted"
                  value={
                    detail.submitted_at
                      ? new Date(detail.submitted_at).toLocaleString('en-NG')
                      : 'Not submitted'
                  }
                />
                <StatCard label="Inspector" value={detail.inspector_name} />
                <StatCard label="Area" value={detail.district ?? 'Unknown'} />
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Assessment summary</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <SummaryRow label="Identity & existence" value={formatLabel(checklist.existence)} />
                  <SummaryRow label="Listing accuracy" value={formatLabel(checklist.accuracy)} />
                  <SummaryRow
                    label="Structural condition"
                    value={
                      checklist.structuralCondition != null
                        ? `${checklist.structuralCondition} / 5`
                        : 'Not provided'
                    }
                  />
                </dl>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <NoteCard title="Existence note" text={checklist.existenceNote} />
                  <NoteCard title="Accuracy note" text={checklist.accuracyNote} />
                </div>
                <div className="mt-4">
                  <NoteCard title="Inspector note" text={detail.inspector_note} />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Amenity confirmation</h3>
                <div className="mt-3 grid gap-2">
                  {Object.entries(checklist.amenities ?? {}).length === 0 ? (
                    <p className="text-sm text-slate-500">No amenity checks were submitted.</p>
                  ) : (
                    Object.entries(checklist.amenities ?? {}).map(([group, items]) => (
                      <div key={group} className="rounded-lg border border-slate-200 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {group.replaceAll('_', ' ')}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(items).map(([name, status]) => (
                            <span
                              key={`${group}:${name}`}
                              className={`rounded-full px-2 py-1 text-xs ${statusClass(status)}`}
                            >
                              {name.replaceAll('_', ' ')} · {status.replaceAll('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Evidence</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {detail.evidence.length === 0 ? (
                      <p className="text-sm text-slate-500">No photos or videos were attached.</p>
                    ) : (
                      detail.evidence.map((item) => (
                        <EvidenceCard key={`${item.filename}-${item.captured_at}`} item={item} />
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <section className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Area score</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Shared infrastructure data for this GPS cell.
                        </p>
                      </div>
                      {detail.area_score?.last_assessed_at && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-caption text-slate-600">
                          {new Date(detail.area_score.last_assessed_at).toLocaleDateString('en-NG')}
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2">
                      <ScoreTile label="Road" value={detail.area_score?.road_condition ?? null} />
                      <ScoreTile
                        label="Electricity"
                        value={detail.area_score?.electricity_supply_hours ?? null}
                      />
                      <ScoreTile label="Security" value={detail.area_score?.security ?? null} />
                      <ScoreTile label="Proximity" value={detail.area_score?.proximity ?? null} />
                    </dl>
                  </section>

                  <section className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">GPS map</h3>
                    {detail.visit_gps_lat != null && detail.visit_gps_lng != null ? (
                      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                        <iframe
                          title="Inspection GPS map"
                          src={`https://www.google.com/maps?q=${detail.visit_gps_lat},${detail.visit_gps_lng}&z=15&output=embed`}
                          className="h-64 w-full"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">No GPS pin was submitted.</p>
                    )}
                  </section>
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="space-y-3 border-t border-slate-200 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Reviewer note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void run('approve')} disabled={busy !== null}>
              {busy === 'approve' ? 'Approving…' : 'Approve & issue physical badge'}
            </Button>
            <Button variant="secondary" onClick={() => void run('query')} disabled={busy !== null}>
              {busy === 'query' ? 'Sending…' : 'Query'}
            </Button>
            <Button variant="ghost" onClick={() => void run('reject')} disabled={busy !== null}>
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-caption font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-caption font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function NoteCard({ title, text }: { title: string; text: string | null | undefined }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-caption font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <p className="mt-1 text-sm text-slate-700">{text?.trim() ? text : 'No note provided.'}</p>
    </div>
  );
}

function EvidenceCard({ item }: { item: InspectionReviewDetail['evidence'][number] }) {
  const showPreview = item.url && !item.url.includes('stub.local');

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="aspect-[4/3] bg-slate-100">
        {showPreview && item.content_type.startsWith('image/') ? (
          <img src={item.url ?? ''} alt={item.filename} className="h-full w-full object-cover" />
        ) : showPreview && item.content_type.startsWith('video/') ? (
          <video src={item.url ?? ''} controls className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">
            Preview unavailable in local stub mode.
          </div>
        )}
      </div>
      <div className="space-y-1 p-3 text-sm">
        <div className="font-medium text-slate-900">{item.filename}</div>
        <div className="text-xs text-slate-500">
          {new Date(item.captured_at).toLocaleString('en-NG')}
        </div>
        {item.note && <div className="text-xs text-slate-600">{item.note}</div>}
      </div>
    </div>
  );
}

function ScoreTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-caption font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">
        {value != null ? `${value} / 5` : 'Not scored'}
      </div>
    </div>
  );
}

function formatLabel(value: string | undefined) {
  if (!value) return 'Not provided';
  return value.replaceAll('_', ' ');
}

function statusClass(status: AmenityStatus) {
  if (status === 'present') return 'bg-emerald-50 text-emerald-700';
  if (status === 'absent') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
}
