'use client';

/**
 * Per-dashboard notifications inbox panel. Shows the latest 10 in-app rows
 * with mark-read affordances. The seeker/landlord overview tiles separately
 * carry the unread count badge.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { notifications, type NotificationView } from '@/lib/notifications';

const FRIENDLY_EVENT: Record<string, string> = {
  'badge.issued': 'Badge issued',
  'listing.queried': 'Action needed',
  'listing.rejected': 'Listing rejected',
  'offer.received': 'New offer received',
  'otp.requested': 'Verification code sent',
};

export function NotificationsInbox() {
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await notifications.list({ page_size: 10 });
      setItems(res.items);
      setUnread(res.unread_count);
    } catch {
      setError('Could not load notifications.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markAll() {
    setBusy(true);
    try {
      await notifications.markAllRead();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    await notifications.markRead(id);
    await load();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
          {unread > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-caption font-medium text-slate-900">
              {unread} unread
            </span>
          )}
        </div>
        {unread > 0 && (
          <Button variant="ghost" disabled={busy} onClick={() => void markAll()}>
            Mark all read
          </Button>
        )}
      </header>
      <div>
        {error && <p className="p-4 text-sm text-red-600">{error}</p>}
        {items === null ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li
                key={n.id}
                className={'px-4 py-3 ' + (n.read_at ? '' : 'bg-brand/5')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {FRIENDLY_EVENT[n.event_type] ?? n.event_type}
                    </div>
                    <NotificationBody event={n.event_type} payload={n.payload} />
                    <div className="mt-1 text-xs text-slate-500">
                      {new Date(n.created_at).toLocaleString('en-NG')}
                    </div>
                  </div>
                  {!n.read_at && (
                    <button
                      type="button"
                      onClick={() => void markOne(n.id)}
                      className="text-xs text-brand hover:underline"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function NotificationBody({
  event,
  payload,
}: {
  event: string;
  payload: Record<string, unknown>;
}) {
  const title = String(payload.listing_title ?? '');
  const note = String(payload.note ?? '');
  switch (event) {
    case 'badge.issued':
      return (
        <p className="text-sm text-slate-700">
          The {String(payload.badge_type ?? 'document')} badge was issued for{' '}
          <strong>{title}</strong>.
        </p>
      );
    case 'listing.queried':
      return (
        <p className="text-sm text-slate-700">
          We need a small change on <strong>{title}</strong>: {note}
        </p>
      );
    case 'listing.rejected':
      return (
        <p className="text-sm text-slate-700">
          <strong>{title}</strong> couldn&apos;t be verified: {note}
        </p>
      );
    case 'offer.received':
      return (
        <p className="text-sm text-slate-700">
          New offer on <strong>{title}</strong>{' '}
          {payload.offer_amount != null && (
            <>at ₦{Number(payload.offer_amount).toLocaleString('en-NG')}</>
          )}
        </p>
      );
    default:
      return null;
  }
}
