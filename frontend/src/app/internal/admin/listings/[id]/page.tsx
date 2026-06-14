'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { DocumentViewer } from '@/components/admin/doc-viewer';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { admin, type AdminListingDetail } from '@/lib/admin';

type ActionKind =
  | 'publish'
  | 'document-badge'
  | 'physical-badge'
  | 'suspend'
  | 'restore'
  | 'delete';

export default function AdminListingDetailPage() {
  const params = useParams<{ id: string }>();
  const listingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [detail, setDetail] = useState<AdminListingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [viewing, setViewing] = useState<AdminListingDetail['documents'][number] | null>(null);
  const router = useRouter();

  async function load() {
    setError(null);
    try {
      setDetail(await admin.listingDetail(listingId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this listing.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    admin
      .listingDetail(listingId)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load this listing.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  async function run(kind: ActionKind, op: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await op();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  async function suspend() {
    const reason = window.prompt('Suspension reason?');
    if (!reason?.trim()) return;
    await run('suspend', () => admin.suspend(listingId, reason.trim()));
  }

  async function restore() {
    await run('restore', () => admin.restore(listingId));
  }

  async function softDelete() {
    if (!window.confirm('Soft-delete this listing? Data is retained.')) return;
    await run('delete', () => admin.softDelete(listingId));
    router.push('/internal/admin/listings');
  }

  const flags = useMemo(() => {
    if (!detail) {
      return {
        isDeleted: false,
        isSuspended: false,
        canAwardDocumentBadge: false,
        canAwardPhysicalBadge: false,
      };
    }
    const isDeleted = detail.status === 'delisted' || detail.deleted_at !== null;
    const isSuspended = detail.status === 'suspended';
    const canAwardDocumentBadge =
      !isDeleted &&
      !detail.document_badge &&
      (detail.category === 'off_campus' || detail.documents.length > 0);
    const canAwardPhysicalBadge =
      !isDeleted &&
      !detail.physical_badge &&
      !!detail.latest_inspection &&
      ['pending', 'approved'].includes(detail.latest_inspection.status) &&
      (detail.category === 'off_campus' || !!detail.document_badge);
    return { isDeleted, isSuspended, canAwardDocumentBadge, canAwardPhysicalBadge };
  }, [detail]);

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={'/internal/admin/listings' as Route}
            className="text-sm font-medium text-brand hover:underline"
          >
            ← Back to all listings
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {detail?.title ?? 'Listing detail'}
          </h1>
          {detail && (
            <p className="mt-1 text-sm text-slate-500">
              {detail.landlord_name} · {detail.landlord_email}
            </p>
          )}
        </div>
        {detail?.is_publicly_visible && (
          <Link
            href={`/listings/${listingId}` as Route}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
          >
            View public page
          </Link>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {!detail && !error && <p className="text-sm text-slate-500">Loading…</p>}

      {detail && (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Category" value={formatLabel(detail.category)} />
            <StatCard label="Status" value={formatLabel(detail.status)} />
            <StatCard
              label="Visible to seekers"
              value={detail.is_publicly_visible ? 'Yes' : 'No'}
              tone={detail.is_publicly_visible ? 'green' : 'slate'}
            />
            <StatCard
              label="Created"
              value={new Date(detail.created_at).toLocaleString('en-NG')}
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Admin actions</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Publish the listing for seekers or award verification badges from here.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={flags.isDeleted || busy !== null}
                  onClick={() => void run('publish', () => admin.publishListing(listingId))}
                >
                  {busy === 'publish'
                    ? 'Updating…'
                    : detail.is_publicly_visible
                      ? 'Refresh live status'
                      : 'Make live'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!flags.canAwardDocumentBadge || busy !== null}
                  onClick={() =>
                    void run('document-badge', () => admin.awardDocumentBadge(listingId))
                  }
                >
                  {busy === 'document-badge'
                    ? 'Issuing…'
                    : detail.document_badge
                      ? 'Document badge issued'
                      : 'Award document badge'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!flags.canAwardPhysicalBadge || busy !== null}
                  onClick={() =>
                    void run('physical-badge', () => admin.awardPhysicalBadge(listingId))
                  }
                >
                  {busy === 'physical-badge'
                    ? 'Issuing…'
                    : detail.physical_badge
                      ? 'Physical badge issued'
                      : 'Award physical badge'}
                </Button>
                {!flags.isDeleted && !flags.isSuspended && (
                  <Button variant="ghost" disabled={busy !== null} onClick={() => void suspend()}>
                    {busy === 'suspend' ? 'Suspending…' : 'Suspend'}
                  </Button>
                )}
                {flags.isSuspended && !flags.isDeleted && (
                  <Button variant="ghost" disabled={busy !== null} onClick={() => void restore()}>
                    {busy === 'restore' ? 'Restoring…' : 'Restore'}
                  </Button>
                )}
                {!flags.isDeleted && (
                  <Button variant="ghost" disabled={busy !== null} onClick={() => void softDelete()}>
                    {busy === 'delete' ? 'Deleting…' : 'Delete'}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <InfoCard
                title="Document badge"
                body={
                  detail.document_badge
                    ? `Issued ${new Date(detail.document_badge.issued_at).toLocaleDateString('en-NG')}`
                    : detail.documents.length === 0 && detail.category !== 'off_campus'
                      ? 'Needs at least one uploaded document.'
                      : 'Ready when admin decides the document review is complete.'
                }
              />
              <InfoCard
                title="Physical badge"
                body={
                  detail.physical_badge
                    ? `Issued ${new Date(detail.physical_badge.issued_at).toLocaleDateString('en-NG')}`
                    : detail.latest_inspection
                      ? `Latest inspection is ${formatLabel(detail.latest_inspection.status)}.`
                      : 'No inspection report is available for badge issuance yet.'
                }
              />
              <InfoCard
                title="Notes"
                body={
                  detail.suspension_reason
                    ? `Suspension reason: ${detail.suspension_reason}`
                    : detail.review_note || 'No admin note recorded on this listing.'
                }
              />
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <MetaRow label="Price" value={formatPrice(detail.price)} />
                  <MetaRow label="District" value={detail.district ?? 'Unknown'} />
                  <MetaRow label="Address" value={detail.address_line ?? 'Not provided'} />
                  <MetaRow
                    label="Coordinates"
                    value={
                      detail.gps_lat != null && detail.gps_lng != null
                        ? `${detail.gps_lat}, ${detail.gps_lng}`
                        : 'Not provided'
                    }
                  />
                </dl>
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-slate-900">Description</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {detail.description?.trim() || 'No description provided.'}
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Documents ({detail.documents.length})
                  </h2>
                </div>
                {detail.documents.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No documents uploaded.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {detail.documents.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 p-3"
                      >
                        <div>
                          <div className="font-medium text-slate-900">{doc.filename}</div>
                          <div className="text-xs text-slate-500">
                            {formatLabel(doc.doc_type)} · {doc.content_type}
                          </div>
                        </div>
                        <Button variant="secondary" onClick={() => setViewing(doc)}>
                          View
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  Photos ({detail.photos.length})
                </h2>
                {detail.photos.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No photos uploaded.</p>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {detail.photos.map((photo) => (
                      <div key={photo.id} className="overflow-hidden rounded-xl border border-slate-200">
                        <div className="aspect-[4/3] bg-slate-100">
                          <img
                            src={photo.url}
                            alt={photo.room_label ?? 'Listing photo'}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-600">
                          <span>{photo.room_label ?? 'Listing photo'}</span>
                          {photo.is_cover && (
                            <span className="rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand">
                              Cover
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">Inspection context</h2>
                {!detail.latest_inspection ? (
                  <p className="mt-3 text-sm text-slate-500">
                    No inspection report is attached to this listing yet.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    <MetaRow
                      label="Inspector"
                      value={detail.latest_inspection.inspector_name}
                    />
                    <MetaRow
                      label="Status"
                      value={formatLabel(detail.latest_inspection.status)}
                    />
                    <MetaRow
                      label="Submitted"
                      value={
                        detail.latest_inspection.submitted_at
                          ? new Date(detail.latest_inspection.submitted_at).toLocaleString('en-NG')
                          : 'Not submitted'
                      }
                    />
                    <Link
                      href={'/internal/admin/inspections' as Route}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
                    >
                      Open inspection review
                    </Link>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">Amenity snapshot</h2>
                <div className="mt-4 space-y-3">
                  {Object.entries(detail.amenities).length === 0 ? (
                    <p className="text-sm text-slate-500">No amenities recorded.</p>
                  ) : (
                    Object.entries(detail.amenities).map(([group, items]) => (
                      <div key={group} className="rounded-xl border border-slate-200 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {formatLabel(group)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(items ?? {}).map(([name, meta]) => (
                            <span
                              key={`${group}:${name}`}
                              className={
                                'rounded-full px-2 py-1 text-xs ' +
                                (meta?.confirmed
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : meta?.present
                                    ? 'bg-slate-100 text-slate-700'
                                    : 'bg-red-50 text-red-700')
                              }
                            >
                              {formatLabel(name)}
                              {meta?.confirmed ? ' · confirmed' : meta?.present ? ' · present' : ' · absent'}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-slate-900">Type data</h2>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
                  {JSON.stringify(detail.type_data, null, 2)}
                </pre>
              </section>
            </div>
          </section>
        </div>
      )}

      {viewing && (
        <DocumentViewer
          listingId={listingId}
          document={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'green';
}) {
  return (
    <div
      className={
        'rounded-2xl border p-4 ' +
        (tone === 'green'
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-slate-200 bg-white')
      }
    >
      <div className="text-caption font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function formatPrice(value: number | null) {
  if (value == null) return '—';
  return `₦${value.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}
