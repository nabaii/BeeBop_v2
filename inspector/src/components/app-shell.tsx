'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';

import { useSyncStatus, startSyncLoop } from '@/lib/sync';
import { useSession } from '@/stores/session';

export function AppShell({ children }: { children: ReactNode }) {
  const sync = useSyncStatus();
  const user = useSession((s) => s.user);

  useEffect(() => {
    const stop = startSyncLoop();
    return stop;
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <Link href="/" className="font-semibold text-brand">
          BeeBop · Inspector
        </Link>
        <SyncIndicator />
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
      {user && (
        <footer className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
          Signed in as {user.email}
        </footer>
      )}
    </div>
  );
}

function SyncIndicator() {
  const sync = useSyncStatus();

  if (!sync.isOnline) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Offline · {sync.pending} pending
      </span>
    );
  }
  if (sync.state === 'syncing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> Syncing… {sync.pending}
      </span>
    );
  }
  if (sync.state === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
        title={sync.lastError}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Sync failed · {sync.pending}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Up to date
    </span>
  );
}
