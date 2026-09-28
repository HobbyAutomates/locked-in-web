/**
 * v2.18 E1 offline logging: the queue maths (pure). The web stores the queue in IndexedDB
 * (lib/social/offlineStore.ts) and the service worker keeps the app shell loadable offline;
 * Android keeps it in DataStore (data/OfflineQueue.kt). Same rules on both:
 *
 *   - A log is queued when the device says it's offline, or the save failed with a network error
 *     (the request never reached the server). Server-side errors (validation, auth) are NOT queued:
 *     they'd fail again.
 *   - The queue replays oldest first when the app is back online / reopened. An item that keeps
 *     failing with a server error is dropped after MAX_TRIES and reported once.
 *   - The chip says "3 waiting to sync" while anything is queued.
 */
export type QueueKind = "meal" | "workout" | "exercise" | "water";
export type QueueItem = { id: string; kind: QueueKind; payload: unknown; created_at: string; tries: number; last_error?: string | null };

export const MAX_TRIES = 5;
export const QUEUE_LIMIT = 200;

let seq = 0;
export function newQueueId(now: Date = new Date()): string {
  seq = (seq + 1) % 1e6;
  return `q-${now.getTime().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Network failures look like this from fetch / server actions / OkHttp. */
export function isNetworkError(e: unknown): boolean {
  if (!e) return false;
  const name = (e as { name?: string }).name ?? "";
  const msg = String((e as { message?: string }).message ?? e);
  if (name === "AbortError") return false;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|the internet connection appears to be offline|unable to resolve host|failed to connect|timeout|timed out|connection (reset|refused|closed)/i.test(msg) || (name === "TypeError" && /fetch/i.test(msg));
}

/** Queue it? Offline, or the save failed before reaching the server. */
export function shouldQueue(online: boolean, error?: unknown): boolean {
  if (!online) return true;
  return error != null && isNetworkError(error);
}

export function enqueue(queue: QueueItem[], item: Omit<QueueItem, "tries" | "created_at" | "id"> & Partial<Pick<QueueItem, "id" | "created_at">>, now: Date = new Date()): QueueItem[] {
  const next: QueueItem = { id: item.id ?? newQueueId(now), kind: item.kind, payload: item.payload, created_at: item.created_at ?? now.toISOString(), tries: 0, last_error: null };
  const out = [...queue, next];
  return out.length > QUEUE_LIMIT ? out.slice(out.length - QUEUE_LIMIT) : out;
}

/** Oldest first. */
export function ordered(queue: QueueItem[]): QueueItem[] {
  return [...queue].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
}

export type ReplayOutcome = "ok" | "network" | "error";

/**
 * After one replay attempt: ok → removed; network → kept as is and the run stops (still offline);
 * error → tries + 1, dropped at MAX_TRIES.
 */
export function afterAttempt(queue: QueueItem[], id: string, outcome: ReplayOutcome, error?: string): { queue: QueueItem[]; dropped: QueueItem | null; stop: boolean } {
  if (outcome === "ok") return { queue: queue.filter((q) => q.id !== id), dropped: null, stop: false };
  if (outcome === "network") return { queue, dropped: null, stop: true };
  let dropped: QueueItem | null = null;
  const next: QueueItem[] = [];
  for (const q of queue) {
    if (q.id !== id) {
      next.push(q);
      continue;
    }
    const tries = q.tries + 1;
    if (tries >= MAX_TRIES) dropped = { ...q, tries, last_error: error ?? null };
    else next.push({ ...q, tries, last_error: error ?? null });
  }
  return { queue: next, dropped, stop: false };
}

/** "Dal chawal, 2 roti" for a queued meal; used in the sync sheet. */
export function queueItemLabel(q: QueueItem): string {
  const p = (q.payload ?? {}) as Record<string, unknown>;
  if (q.kind === "meal") return String(p.raw_text || "Meal").slice(0, 60);
  if (q.kind === "water") return `${Number(p.ml) || 250} ml water`;
  if (q.kind === "exercise") return String(p.name || "Activity");
  return "Workout";
}

/** IndexedDB / DataStore names. */
export const OFFLINE_DB = "li-offline";
export const OFFLINE_STORE = "queue";
export const OFFLINE_EVENT = "li-offline-queue";
