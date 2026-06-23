import { useState, useEffect, useCallback } from 'react';
import { openDB, type IDBPDatabase } from 'idb';
import type { QueuedTaskUpdate } from '@/types';

const DB_NAME    = 'solarops-offline';
const DB_VERSION = 1;
const STORE      = 'queue';
const CHANGE_EVENT = 'so-queue-changed';

function emitQueueChanged() {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

let _dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return _dbPromise;
}

export async function enqueueTaskUpdate(item: Omit<QueuedTaskUpdate, 'id'>): Promise<void> {
  const db = await getDB();
  await db.add(STORE, item);
  emitQueueChanged();
}

export async function getAllQueued(): Promise<QueuedTaskUpdate[]> {
  const db = await getDB();
  return db.getAll(STORE) as Promise<QueuedTaskUpdate[]>;
}

export async function dequeueTaskUpdate(id: number): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
  emitQueueChanged();
}

export async function updateQueueItem(id: number, updates: Partial<QueuedTaskUpdate>): Promise<void> {
  const db       = await getDB();
  const existing = await db.get(STORE, id) as QueuedTaskUpdate | undefined;
  if (existing) {
    await db.put(STORE, { ...existing, ...updates });
    emitQueueChanged();
  }
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE);
}

export function useTaskOfflineQueue() {
  const [queueCount, setQueueCount] = useState(0);

  const refresh = useCallback(async () => {
    const count = await getQueueCount();
    setQueueCount(count);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, [refresh]);

  return { queueCount };
}
