/**
 * IndexedDB stores used by the inspector PWA.
 *
 * Stores:
 *   drafts      — keyed by reportId; in-progress assessment fields not yet
 *                 confirmed sent to the server.
 *   sync_queue  — FIFO of pending mutations (draft saves, evidence registers,
 *                 area scores, submits) awaiting network. Drained by the
 *                 background-sync loop in `sync.ts`.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'beebop-inspector';
const DB_VERSION = 2;

export interface QueuedMutation {
  id?: number;
  kind: 'save_draft' | 'register_evidence' | 'submit_report' | 'score_area';
  reportId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  lastAttemptAt?: number;
  attempts: number;
}

export interface DraftRecord {
  reportId: string;
  assessment: Record<string, unknown>;
  inspector_note?: string;
  visit_gps_lat?: number;
  visit_gps_lng?: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('drafts')) {
          db.createObjectStore('drafts', { keyPath: 'reportId' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        }
        // v2 dropped the legacy 'assessments' and 'uploads' stores; cleanup if upgrading.
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains('assessments')) db.deleteObjectStore('assessments');
          if (db.objectStoreNames.contains('uploads')) db.deleteObjectStore('uploads');
        }
      },
    });
  }
  return dbPromise;
}

export async function readDraft(reportId: string): Promise<DraftRecord | undefined> {
  const db = await getDb();
  return (await db.get('drafts', reportId)) as DraftRecord | undefined;
}

export async function writeDraft(record: DraftRecord): Promise<void> {
  const db = await getDb();
  await db.put('drafts', record);
}

export async function deleteDraft(reportId: string): Promise<void> {
  const db = await getDb();
  await db.delete('drafts', reportId);
}

export async function enqueue(mutation: Omit<QueuedMutation, 'id' | 'attempts' | 'createdAt'>): Promise<number> {
  const db = await getDb();
  const id = (await db.add('sync_queue', {
    ...mutation,
    createdAt: Date.now(),
    attempts: 0,
  })) as number;
  return id;
}

export async function listQueue(): Promise<QueuedMutation[]> {
  const db = await getDb();
  return (await db.getAll('sync_queue')) as QueuedMutation[];
}

export async function dequeue(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('sync_queue', id);
}

export async function bumpAttempts(id: number, attempts: number): Promise<void> {
  const db = await getDb();
  const existing = (await db.get('sync_queue', id)) as QueuedMutation | undefined;
  if (!existing) return;
  await db.put('sync_queue', {
    ...existing,
    attempts,
    lastAttemptAt: Date.now(),
  });
}
