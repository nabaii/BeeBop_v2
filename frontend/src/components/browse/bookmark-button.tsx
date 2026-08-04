'use client';

/**
 * Bookmark (save) toggle. Stops link navigation when rendered inside a card.
 * Anonymous visitors are routed to /login; the return URL is the current page.
 */

import { Bookmark } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { saveListing, unsaveListing } from '@/lib/bookmarks';
import { cn } from '@/lib/cn';
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
      className={cn(
        // Sits over a photo, so it keeps its soft shadow (the palette's one
        // sanctioned exception to hairlines-over-shadows).
        'inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink-muted shadow-sm transition hover:bg-white hover:text-ink disabled:opacity-70',
        saved && 'text-brand-600',
        className,
      )}
    >
      <Bookmark
        className={cn('h-4 w-4', saved ? 'fill-current' : 'fill-none')}
        strokeWidth={1.8}
        aria-hidden
      />
    </button>
  );
}
