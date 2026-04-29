/**
 * Sync engine — drains the IndexedDB queue when the browser is online.
 *
 * Triggers:
 *   • online event
 *   • periodic interval (every 60s) as a safety net
 *   • explicit `flush()` call after a user action
 *
 * The user-visible status is exposed via `useSyncStatus()` so every page
 * can render the offline/syncing/up-to-date indicator.
 */

import { useEffect, useState } from 'react';

import { ApiError } from './api';
import { bumpAttempts, dequeue, listQueue, type QueuedMutation } from './idb';
import { inspector } from './inspector';

let flushing = false;
let listeners: Array<(s: SyncStatus) => void> = [];

export type SyncStatus =
  | { state: 'idle'; pending: number; isOnline: boolean }
  | { state: 'syncing'; pending: number; isOnline: boolean }
  | { state: 'error'; pending: number; isOnline: boolean; lastError: string };

let status: SyncStatus = { state: 'idle', pending: 0, isOnline: true };

function emit(next: SyncStatus): void {
  status = next;
  for (const listener of listeners) listener(status);
}

async function dispatchOne(mutation: QueuedMutation): Promise<void> {
  switch (mutation.kind) {
    case 'save_draft':
      await inspector.saveDraft(mutation.reportId, mutation.payload as Parameters<typeof inspector.saveDraft>[1]);
      return;
    case 'register_evidence':
      await inspector.registerEvidence(
        mutation.reportId,
        mutation.payload as Parameters<typeof inspector.registerEvidence>[1],
      );
      return;
    case 'score_area':
      await inspector.scoreArea(
        mutation.reportId,
        mutation.payload as Parameters<typeof inspector.scoreArea>[1],
      );
      return;
    case 'submit_report':
      await inspector.submit(mutation.reportId);
      return;
  }
}

const MAX_ATTEMPTS = 6;

export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    emit({ ...status, state: 'idle', isOnline: false });
    return;
  }
  flushing = true;
  try {
    const queue = await listQueue();
    if (queue.length === 0) {
      emit({ state: 'idle', pending: 0, isOnline: true });
      return;
    }
    emit({ state: 'syncing', pending: queue.length, isOnline: true });

    for (const m of queue) {
      try {
        await dispatchOne(m);
        if (m.id != null) await dequeue(m.id);
      } catch (err) {
        const reason = err instanceof ApiError ? err.message : String(err);
        if (m.id != null) {
          await bumpAttempts(m.id, m.attempts + 1);
          if (m.attempts + 1 >= MAX_ATTEMPTS) {
            // Drop after too many attempts so the queue doesn't lock up.
            await dequeue(m.id);
          }
        }
        emit({
          state: 'error',
          pending: queue.length,
          isOnline: true,
          lastError: reason,
        });
        // Stop on first error — try again on next trigger.
        return;
      }
    }
    emit({ state: 'idle', pending: 0, isOnline: true });
  } finally {
    flushing = false;
  }
}

export function startSyncLoop(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onOnline = () => {
    void flush();
  };
  const onOffline = () => emit({ ...status, state: 'idle', isOnline: false });
  const interval = window.setInterval(() => void flush(), 60_000);

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  void flush();

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.clearInterval(interval);
  };
}

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>(status);
  useEffect(() => {
    listeners.push(setS);
    return () => {
      listeners = listeners.filter((l) => l !== setS);
    };
  }, []);
  return s;
}
