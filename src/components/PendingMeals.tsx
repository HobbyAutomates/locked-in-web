"use client";

import { useSyncExternalStore } from "react";
import { saveMeal } from "@/lib/actions";
import type { MealItem } from "@/lib/types";

export type Pending = { id: number; text: string; date: string };

/** What a still-running parse or plate estimate hands back once it finishes. */
export type PlateJob = { items: MealItem[]; photo_path?: string | null; notes?: string[] };

type State = { pending: Pending[]; savedCount: number; error: string | null };

/**
 * Meals saved while a parse or photo estimate was still running. Add food closes straight away;
 * this module-level store (it survives the client-side navigation from /log back to Home) waits
 * for the jobs, appends their items to whatever was already on the plate, then saves.
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

/** Save the plate once every running job has finished; Home shows a pending row meanwhile. */
export function saveWhenReady(input: { label: string; date: string; raw_text: string; items: MealItem[]; photo_path: string | null; jobs: Promise<PlateJob>[] }) {
  const entry: Pending = { id: nextId++, text: input.label, date: input.date };
  set({ pending: [entry, ...state.pending], error: null });
  void (async () => {
    try {
      const settled = await Promise.allSettled(input.jobs);
      const items = [...input.items];
      let photo = input.photo_path;
      let failed = 0;
      for (const s of settled) {
        if (s.status === "fulfilled") {
          items.push(...s.value.items);
          photo = photo ?? s.value.photo_path ?? null;
        } else failed++;
      }
      if (!items.length) throw new Error(`Couldn't work out "${input.label}" — try again.`);
      await saveMeal({ date: input.date, raw_text: input.raw_text || input.label, items, photo_path: photo });
      set({ savedCount: state.savedCount + 1, error: failed ? `Saved "${input.label}", but part of it couldn't be worked out.` : null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Could not log that meal" });
    } finally {
      set({ pending: state.pending.filter((x) => x.id !== entry.id) });
    }
  })();
}
