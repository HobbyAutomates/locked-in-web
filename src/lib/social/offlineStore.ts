"use client";

/**
 * v2.18 E1 offline logging, browser side: the queue lives in IndexedDB (`li-offline` / `queue`),
 * with a localStorage mirror of the count so the chip can paint before IndexedDB opens. Call sites
 * wrap their save in withQueue(): offline (or a network failure) → the payload is queued and the
 * call resolves to null, which the form treats as "saved". SyncChip (components/social/SyncChip)
 * replays the queue when the browser comes back online or the app opens. Rules: offlineQueue.ts.
 */
import { OFFLINE_DB, OFFLINE_EVENT, OFFLINE_STORE, afterAttempt, enqueue, isNetworkError, ordered, shouldQueue, type QueueItem, type QueueKind, type ReplayOutcome } from "./offlineQueue";

const COUNT_KEY = "li-offline-count";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(OFFLINE_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(OFFLINE_STORE)) req.result.createObjectStore(OFFLINE_STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** In-memory fallback when IndexedDB isn't available (private windows on some browsers). */
let memory: QueueItem[] = [];

export async function readQueue(): Promise<QueueItem[]> {
  const db = await openDb();
  if (!db) return memory;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(OFFLINE_STORE, "readonly").objectStore(OFFLINE_STORE).getAll();
      req.onsuccess = () => resolve(ordered((req.result ?? []) as QueueItem[]));
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function writeQueue(items: QueueItem[]): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory = items;
  } else {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(OFFLINE_STORE, "readwrite");
        const store = tx.objectStore(OFFLINE_STORE);
        store.clear();
        for (const it of items) store.put(it);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  try {
    localStorage.setItem(COUNT_KEY, String(items.length));
  } catch {
    // Count mirror only.
  }
  try {
    window.dispatchEvent(new CustomEvent(OFFLINE_EVENT, { detail: { count: items.length } }));
  } catch {
    // No window (tests).
  }
}

export function cachedCount(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(COUNT_KEY) ?? 0) || 0);
  } catch {
    return 0;
  }
}

export async function queueLog(kind: QueueKind, payload: unknown): Promise<void> {
  const q = await readQueue();
  await writeQueue(enqueue(q, { kind, payload }));
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

/**
 * Runs `fn(payload)`; when offline or the request fails on the network, queues the payload and
 * resolves to null instead. Any other error is re-thrown (the form shows it as before).
 */
export async function withQueue<P, T>(kind: QueueKind, payload: P, fn: (p: P) => Promise<T>): Promise<T | null> {
  if (!online()) {
    await queueLog(kind, payload);
    return null;
  }
  try {
    return await fn(payload);
  } catch (e) {
    if (shouldQueue(online(), e)) {
      await queueLog(kind, payload);
      return null;
    }
    throw e;
  }
}

export type Replayer = (item: QueueItem) => Promise<void>;

let flushing = false;

/** Replays the queue oldest first. Returns how many were synced and any dropped after MAX_TRIES. */
export async function flushQueue(replay: Replayer): Promise<{ synced: number; dropped: QueueItem[]; left: number }> {
  if (flushing || !online()) return { synced: 0, dropped: [], left: (await readQueue()).length };
  flushing = true;
  let synced = 0;
  const dropped: QueueItem[] = [];
  try {
    let q = await readQueue();
    for (const item of ordered(q)) {
      let outcome: ReplayOutcome = "ok";
      let err: string | undefined;
      try {
        await replay(item);
      } catch (e) {
        outcome = isNetworkError(e) || !online() ? "network" : "error";
        err = e instanceof Error ? e.message : String(e);
      }
      const r = afterAttempt(q, item.id, outcome, err);
      q = r.queue;
      if (outcome === "ok") synced++;
      if (r.dropped) dropped.push(r.dropped);
      await writeQueue(q);
      if (r.stop) break;
    }
    return { synced, dropped, left: q.length };
  } finally {
    flushing = false;
  }
}
