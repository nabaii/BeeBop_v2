'use client';

/**
 * Bookmark (save) toggle. Stops link navigation when rendered inside a card.
 * Anonymous visitors are routed to /login; the return URL is the current page.
 */

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { saveListing, unsaveListing } from '@/lib/bookmarks';
import { useSession } from '@/stores/session';

interface Props {
  listingId: string;
  initial?: boolean;
  className?: string;
}

export function BookmarkButton({ listingId, initial = false, className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSession((s) => s.user);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      const returnTo = encodeURIComponent(pathname ?? '/');
      router.push(`/login?return_to=${returnTo}`);
      return;
    }
    setBusy(true);
    const next = !saved;
    setSaved(next);
    try {
      if (next) await saveListing(listingId);
      else await unsaveListing(listingId);
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => void toggle(e)}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? 'Remove bookmark' : 'Save listing'}
      className={
        'inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm hover:bg-white ' +
        (className ?? '')
      }
    >
      <svg viewBox="0 0 20 20" className={`h-4 w-4 ${saved ? 'fill-brand' : 'fill-none'}`} stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M5 3.5A1.5 1.5 0 016.5 2h7A1.5 1.5 0 0115 3.5V17l-5-3-5 3V3.5z" />
      </svg>
    </button>
  );
}
