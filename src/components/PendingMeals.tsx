"use client";

import { useSyncExternalStore } from "react";
import { saveMeal } from "@/lib/actions";
import type { ParseResult } from "@/lib/types";

export type Pending = { id: number; text: string; date: string };

type State = { pending: Pending[]; savedCount: number; error: string | null };

/**
 * "Log now, review later" meals, held in a module-level store so they survive the client-side
 * navigation from /log back to Home (each route tree gets its own React state, this does not).
 */
let state: State = { pending: [], savedCount: 0, error: null };
const listeners = new Set<() => void>();
let nextId = 1;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_STATE: State = { pending: [], savedCount: 0, error: null };

export function usePendingMeals(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

/** Parses and saves in the background; the caller returns Home straight away. */
export function quickLogMeal(text: string, date: string) {
  const entry: Pending = { id: nextId++, text, date };
  set({ pending: [entry, ...state.pending], error: null });
  void (async () => {
    try {
      const res = await fetch("/api/parse-meal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Parse failed (${res.status})`);
      const parsed = (await res.json()) as ParseResult;
      await saveMeal({ date, raw_text: text, items: parsed.items });
      set({ savedCount: state.savedCount + 1 });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Could not log that meal" });
    } finally {
      set({ pending: state.pending.filter((x) => x.id !== entry.id) });
    }
  })();
}
