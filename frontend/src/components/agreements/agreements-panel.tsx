'use client';

/** Reusable agreements panel for the seeker + landlord dashboards. */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ApiError } from '@/lib/api';
import { agreements, type AgreementView } from '@/lib/agreements';

export function AgreementsPanel({ viewerRole }: { viewerRole: 'seeker' | 'landlord' }) {
  const [items, setItems] = useState<AgreementView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    agreements
      .listMine()
      .then((rows) => !cancelled && setItems(rows))
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load agreements.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Agreements</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          {viewerRole === 'seeker'
            ? 'No agreements yet — accepted offers appear here for signing.'
            : 'No agreements on your listings yet.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <Link href={`/agreements/${a.id}` as `/agreements/${string}`} className="block">
                <header className="flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {a.listing_title}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      {a.type === 'tenancy' ? 'Tenancy' : 'Sale memorandum'}
                      {' · '}
                      {viewerRole === 'seeker' ? `with ${a.landlord_name}` : `with ${a.seeker_name}`}
                    </div>
                  </div>
                  <StatusBadge status={a.status} signaturesNeeded={signaturesRemaining(a, viewerRole)} />
                </header>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-sm min-[380px]:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">Price</dt>
                    <dd className="font-medium text-slate-900">
                      ₦{Math.round(a.price).toLocaleString('en-NG')}
                    </dd>
                  </div>
                  {a.end_date && (
                    <div>
                      <dt className="text-xs text-slate-500">Term ends</dt>
                      <dd className="text-slate-800">{a.end_date}</dd>
                    </div>
                  )}
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function signaturesRemaining(
  a: AgreementView,
  viewerRole: 'seeker' | 'landlord',
): boolean {
  return (
    (a.status === 'draft' || a.status === 'partial_signed') &&
    !a.signatures.some((s) => s.party === viewerRole)
  );
}

function StatusBadge({
  status,
  signaturesNeeded,
}: {
  status: AgreementView['status'];
  signaturesNeeded: boolean;
}) {
  if (signaturesNeeded) {
    return (
      <span className="rounded-full bg-brand px-2 py-0.5 text-caption font-medium text-slate-900">
        Sign now
      </span>
    );
  }
  const label =
    status === 'pending_payment'
      ? 'Awaiting payment'
      : status === 'signed'
        ? 'Signed'
        : status === 'active'
          ? 'Active'
          : status.replaceAll('_', ' ');
  const colour =
    status === 'signed' || status === 'active'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'pending_payment'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-caption font-medium capitalize ${colour}`}>
      {label}
    </span>
  );
}
