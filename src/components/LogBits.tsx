"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Refresh } from "./icons";

/**
 * v2.8 logging building blocks shared by the Log activity forms, the Water page, Weight history
 * and the FAB: one "More options" toggle, one "Same as last time" chip, the intensity chips,
 * the in-editor Delete (v2.7 undo) and the undo snackbar. Same wording everywhere.
 */

export const SAME_AS_LAST = "Same as last time";

/** "More options" — everything past the common case, collapsed by default. */
export function MoreOptions({ open, onToggle, hint, children }: { open: boolean; onToggle: () => void; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" aria-expanded={open} className="press flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-[14px] font-semibold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)", minHeight: 44 }} onClick={onToggle}>
        More options
        <span className="inline-flex min-w-0 items-center gap-1 pl-2 text-xs font-medium muted">
          <span className="truncate">{hint}</span>
          <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: "hidden" }}>
            <div className="pt-1">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** The single "Same as last time" chip (black until it has been applied). */
export function SameAsLastChip({ applied, onClick, detail }: { applied: boolean; onClick: () => void; detail?: string }) {
  return (
    <button
      type="button"
      aria-pressed={applied}
      title={detail}
      aria-label={detail ? `${SAME_AS_LAST}: ${detail}` : SAME_AS_LAST}
      className="chip press gap-1.5 whitespace-nowrap"
      style={{ height: 36, ...(applied ? {} : { background: "var(--btn)", color: "var(--btn-ink)" }) }}
      onClick={onClick}
    >
      <Refresh size={14} />
      {SAME_AS_LAST}
    </button>
  );
}

/** Easy · Moderate · Hard: the slider's bands as three taps (15 / 40 / 70 %). */
export const INTENSITY_CHIPS: { label: string; pct: number }[] = [
  { label: "Easy", pct: 15 },
  { label: "Moderate", pct: 40 },
  { label: "Hard", pct: 70 },
];

export function intensityChipFor(pct: number) {
  return pct < 25 ? 0 : pct < 55 ? 1 : 2;
}

export function IntensityChips({ pct, onChange }: { pct: number; onChange: (pct: number) => void }) {
  const sel = intensityChipFor(pct);
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Intensity">
      {INTENSITY_CHIPS.map((c, i) => (
        <button key={c.label} type="button" role="radio" aria-checked={i === sel} className="chip press justify-center" style={{ height: 36 }} onClick={() => i !== sel && onChange(c.pct)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Delete inside an editor, with the v2.7 undo: the button turns into "Deleted · Undo" for ~5 s,
 * then the real delete runs and `onDone` closes the editor. Leaving early still deletes.
 */
export function useEditorDelete(action: () => Promise<void>, onDone: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ action, onDone });
  useEffect(() => {
    live.current = { action, onDone };
  });
  useEffect(
    () => () => {
      // Unmounted inside the undo window: finish the delete rather than silently dropping it.
      if (timer.current) {
        clearTimeout(timer.current);
        void live.current.action().catch((e) => console.error("[useEditorDelete] delete failed:", e));
      }
    },
    [],
  );
  function start() {
    setError(null);
    setPending(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      live.current
        .action()
        .then(() => live.current.onDone())
        .catch((e) => {
          setPending(false);
          setError(e instanceof Error ? e.message : "Could not delete");
        });
    }, 5000);
  }
  function undo() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(false);
  }
  return { pending, start, undo, error };
}

export function EditorDelete({ label, del, disabled }: { label: string; del: ReturnType<typeof useEditorDelete>; disabled?: boolean }) {
  return del.pending ? (
    <div className="flex min-h-[44px] items-center justify-between gap-2 py-1">
      <span className="text-[15px] font-semibold muted">Deleted</span>
      <button type="button" onClick={del.undo} className="hit press text-[15px] font-bold" style={{ color: "var(--btn)", background: "none", border: 0 }}>
        Undo
      </button>
    </div>
  ) : (
    <button type="button" onClick={del.start} disabled={disabled} className="press min-h-[44px] py-2 text-[15px] font-semibold" style={{ color: "var(--red)", background: "none", border: 0 }}>
      {label}
    </button>
  );
}

/** A row that has just been deleted from a list: "Deleted" with Undo, for ~5 s. */
export function DeletedRow({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 py-1.5">
      <span className="text-[14px] font-semibold muted">Deleted</span>
      <button type="button" className="hit press text-[13px] font-bold" style={{ color: "var(--btn)", background: "none", border: 0 }} onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}

/**
 * List-level undoable deletes (Water page, Weight history): `start(id)` hides the row behind a
 * DeletedRow; after ~5 s `action(id)` runs unless `undo(id)` came first. Pending deletes still run
 * if the page unmounts.
 */
export function usePendingDeletes(action: (id: string) => Promise<void>, onDone?: (id: string) => void, onError?: (msg: string) => void) {
  const [pending, setPending] = useState<string[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const live = useRef({ action, onDone, onError });
  useEffect(() => {
    live.current = { action, onDone, onError };
  });
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const [id, t] of map) {
        clearTimeout(t);
        void live.current.action(id).catch((e) => console.error("[usePendingDeletes] delete failed:", e));
      }
      map.clear();
    };
  }, []);
  function start(id: string) {
    setPending((p) => [...p, id]);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        live.current
          .action(id)
          .then(() => live.current.onDone?.(id))
          .catch((e) => {
            setPending((p) => p.filter((x) => x !== id));
            live.current.onError?.(e instanceof Error ? e.message : "Could not delete");
          });
      }, 5000),
    );
  }
  function undo(id: string) {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setPending((p) => p.filter((x) => x !== id));
  }
  return { isPending: (id: string) => pending.includes(id), start, undo };
}

/** Bottom snackbar with an optional Undo, above the tab bar. */
export function UndoSnackbar({ text, onUndo, undoDisabled }: { text: string | null; onUndo?: () => void; undoDisabled?: boolean }) {
  return (
    <AnimatePresence>
      {text ? (
        <motion.div
          key="snack"
          role="status"
          className="fixed inset-x-0 z-50 mx-auto flex w-[calc(100%-32px)] max-w-[448px] items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[14px] font-semibold"
          style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))", background: "var(--btn)", color: "var(--btn-ink)", boxShadow: "var(--shadow-lg)" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
        >
          <span className="min-w-0 truncate">{text}</span>
          {onUndo ? (
            <button type="button" className="hit press shrink-0 font-bold underline" style={{ background: "none", border: 0, color: "inherit", opacity: undoDisabled ? 0.5 : 1 }} disabled={undoDisabled} onClick={onUndo}>
              Undo
            </button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
