'use client';

/**
 * Per-visit page — combines the briefing pack, the confirm/cancel actions,
 * and the post-visit report form. Sections collapse based on status.
 */

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { ApiError } from '@/lib/api';
import {
  agents,
  type AgentBriefingPack,
  type AgentVisitRow,
  type AmenityObservation,
} from '@/lib/agents';

export default function AgentVisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [briefing, setBriefing] = useState<AgentBriefingPack | null>(null);
  const [row, setRow] = useState<AgentVisitRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [b, list] = await Promise.all([agents.briefing(id), agents.myVisits()]);
      setBriefing(b);
      setRow(list.find((r) => r.visit_id === id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load visit.');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <main className="p-6 text-sm text-red-600">{error}</main>;
  if (!briefing || !row) return <LoadingScreen />;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Link href="/internal/agent" className="text-xs text-slate-500 hover:underline">
        ← All visits
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{briefing.listing_title}</h1>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
          {briefing.listing_category.replace('_', ' ')} · {briefing.district ?? 'Abuja'}
        </p>
      </header>

      <BriefingCard briefing={briefing} />

      {row.status === 'agent_assigned' && (
        <ConfirmCard visitId={id} onChanged={refresh} />
      )}

      {(row.status === 'scheduled' || row.status === 'report_queried') && (
        <PostVisitFormCard
          visitId={id}
          briefing={briefing}
          onChanged={refresh}
        />
      )}

      {row.status === 'report_pending' && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Report submitted. Awaiting admin review.
        </section>
      )}

      {(row.status === 'scheduled' || row.status === 'agent_assigned') && (
        <CancelButton visitId={id} onChanged={refresh} />
      )}
    </main>
  );
}

function BriefingCard({ briefing }: { briefing: AgentBriefingPack }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Briefing pack</h2>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">Address</dt>
          <dd className="text-slate-800">{briefing.address_line ?? '(approx.)'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">GPS</dt>
          <dd className="text-slate-800">
            {briefing.listing_gps_lat != null && briefing.listing_gps_lng != null ? (
              <a
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
                href={`https://maps.google.com/?q=${briefing.listing_gps_lat},${briefing.listing_gps_lng}`}
              >
                {briefing.listing_gps_lat.toFixed(5)}, {briefing.listing_gps_lng.toFixed(5)}
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Seeker</dt>
          <dd className="text-slate-800">{briefing.seeker_first_name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Verification</dt>
          <dd className="capitalize text-slate-800">
            {briefing.verification_status.replaceAll('_', ' ')}
          </dd>
        </div>
      </dl>
      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">
          Conduct reminders
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {briefing.conduct_reminders.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      {briefing.listing_photos.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-900">
            Listing photos ({briefing.listing_photos.length})
          </summary>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {briefing.listing_photos.map((p) => (
              <img
                key={p.id}
                src={p.url}
                alt={p.room_label ?? 'Listing photo'}
                className="h-32 w-44 shrink-0 rounded-lg object-cover"
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function ConfirmCard({
  visitId,
  onChanged,
}: {
  visitId: string;
  onChanged: () => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(true);
  const [scheduled, setScheduled] = useState('');
  const [conflict, setConflict] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await agents.confirm(visitId, {
        confirmed,
        scheduled_at: confirmed ? new Date(scheduled).toISOString() : undefined,
        conflict_reason: confirmed ? undefined : conflict,
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Confirm assignment</h2>
      <div className="flex gap-2">
        <Button
          variant={confirmed ? 'primary' : 'secondary'}
          onClick={() => setConfirmed(true)}
        >
          I&apos;ll handle this visit
        </Button>
        <Button
          variant={!confirmed ? 'primary' : 'secondary'}
          onClick={() => setConfirmed(false)}
        >
          Conflict
        </Button>
      </div>
      {confirmed ? (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">Scheduled date and time</span>
          <Input
            type="datetime-local"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
        </label>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-700">Conflict reason</span>
          <textarea
            value={conflict}
            onChange={(e) => setConflict(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button
        onClick={() => void submit()}
        disabled={
          busy ||
          (confirmed ? !scheduled : !conflict.trim())
        }
      >
        {busy ? 'Saving…' : confirmed ? 'Confirm' : 'Flag conflict'}
      </Button>
    </section>
  );
}

function PostVisitFormCard({
  visitId,
  briefing,
  onChanged,
}: {
  visitId: string;
  briefing: AgentBriefingPack;
  onChanged: () => Promise<void>;
}) {
  const [visitOccurred, setVisitOccurred] = useState(true);
  const [accessIssues, setAccessIssues] = useState(false);
  const [accessNotes, setAccessNotes] = useState('');
  const [conductIssues, setConductIssues] = useState(false);
  const [conductNotes, setConductNotes] = useState('');
  const [discrepancies, setDiscrepancies] = useState('');
  const [freeText, setFreeText] = useState('');
  const [observations, setObservations] = useState<Record<string, AmenityObservation>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build amenity matrix from listed amenities.
  const amenityRows = Object.entries(briefing.listed_amenities ?? {}).flatMap(([group, items]) => {
    if (!items) return [] as { group: string; key: string; listed: 'present' | 'absent' }[];
    return Object.entries(items).map(([key, meta]) => ({
      group,
      key,
      listed: meta?.present ? ('present' as const) : ('absent' as const),
    }));
  });

  function setObserved(
    group: string,
    key: string,
    listed: 'present' | 'absent',
    observed: AmenityObservation['observed'],
  ) {
    setObservations((prev) => ({
      ...prev,
      [`${group}:${key}`]: { key: `${group}:${key}`, listed, observed },
    }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await agents.submitReport(visitId, {
        visit_occurred: visitOccurred,
        access_issues: accessIssues,
        access_notes: accessNotes.trim() || undefined,
        conduct_issues: conductIssues,
        conduct_notes: conductNotes.trim() || undefined,
        amenity_observations: Object.values(observations),
        discrepancies: discrepancies.trim() || undefined,
        free_text_observations: freeText.trim() || undefined,
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">Post-visit report</h2>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={visitOccurred}
            onChange={(e) => setVisitOccurred(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          The visit took place
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={accessIssues}
            onChange={(e) => setAccessIssues(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          Access issues
        </label>
        {accessIssues && (
          <textarea
            value={accessNotes}
            onChange={(e) => setAccessNotes(e.target.value)}
            placeholder="Describe the access issue"
            maxLength={1000}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={conductIssues}
            onChange={(e) => setConductIssues(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          Conduct issues
        </label>
        {conductIssues && (
          <textarea
            value={conductNotes}
            onChange={(e) => setConductNotes(e.target.value)}
            placeholder="Describe the conduct issue"
            maxLength={1000}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        )}
      </div>

      {amenityRows.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Amenity observations
          </h3>
          <ul className="space-y-1 text-sm">
            {amenityRows.map(({ group, key, listed }) => {
              const value = observations[`${group}:${key}`]?.observed ?? '';
              return (
                <li
                  key={`${group}:${key}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium capitalize text-slate-800">
                      {key.replaceAll('_', ' ')}
                    </div>
                    <div className="text-xs text-slate-500">
                      Listed as <strong>{listed}</strong>
                    </div>
                  </div>
                  <select
                    value={value}
                    onChange={(e) =>
                      setObserved(
                        group,
                        key,
                        listed,
                        e.target.value as AmenityObservation['observed'],
                      )
                    }
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">No observation</option>
                    <option value="present">Present</option>
                    <option value="not_confirmed">Not confirmed</option>
                    <option value="absent">Absent</option>
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-slate-700">Discrepancies (optional)</span>
        <textarea
          value={discrepancies}
          onChange={(e) => setDiscrepancies(e.target.value)}
          maxLength={2000}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-700">Free-text observations (optional)</span>
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          maxLength={4000}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={() => void submit()} disabled={busy}>
        {busy ? 'Submitting…' : 'Submit report'}
      </Button>
    </section>
  );
}

function CancelButton({
  visitId,
  onChanged,
}: {
  visitId: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="mb-3">If you can&apos;t make this visit any more, cancel it now.</p>
      {error && <p className="mb-2 text-xs text-red-700">{error}</p>}
      <Button
        variant="danger"
        disabled={busy}
        onClick={async () => {
          const reason = window.prompt('Cancellation reason?');
          if (!reason || !reason.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await agents.cancelAsAgent(visitId, reason.trim());
            await onChanged();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Cancel failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Cancelling…' : 'Cancel visit'}
      </Button>
    </section>
  );
}
