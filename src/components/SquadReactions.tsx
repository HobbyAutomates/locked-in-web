"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { loadPostReactors } from "@/lib/actions";
import { postStamp } from "@/lib/display";
import { REACTIONS, reactionChips, type ReactionState, type ReadRow, type SeenState } from "@/lib/reactions";
import type { PostReactor } from "@/lib/types";
import { Avatar } from "./Avatar";
import { BottomSheet, ErrorNote } from "./ui";

/**
 * v2.11 squad reactions + read receipts (web). The same six emojis, rules and wording as Android
 * (ui/squad/SquadReactions.kt): one reaction per person per post, tap another emoji to swap, the
 * same one to remove. Pure rules live in src/lib/reactions.ts.
 */

const LONG_PRESS_MS = 450;

/**
 * Long-press for touch and pen (a mouse gets hover + the "+😊" button instead). Cancels on move
 * or lift; swallows the context menu the browser would open for the same press.
 */
export function useLongPress(onLongPress: () => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  if (!enabled) return {};
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => {
      if (fired.current || timer.current) e.preventDefault();
    },
  };
}

/** The pop-up bar of six emojis, above its anchor (the anchor must be `position: relative`). Mine is ringed. */
export function ReactionBar({ open, mine, align, onPick, onClose, below = false }: { open: boolean; mine: string | null; align: "left" | "right"; onPick: (emoji: string) => void; onClose: () => void; below?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Next tick, so the press that opened the bar doesn't close it.
    const t = setTimeout(() => document.addEventListener("pointerdown", close), 0);
    document.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label="React"
      initial={{ opacity: 0, scale: 0.85, y: below ? -4 : 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className="absolute z-40 flex items-center gap-0.5 rounded-full px-1.5 py-1"
      style={{ [align]: 0, ...(below ? { top: "calc(100% + 6px)" } : { bottom: "calc(100% + 6px)" }), background: "var(--card)", boxShadow: "var(--shadow-lg)", transformOrigin: `${align} ${below ? "top" : "bottom"}` }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          role="menuitemradio"
          aria-checked={mine === e}
          aria-label={mine === e ? `Remove ${e}` : `React ${e}`}
          className="press grid h-10 w-10 place-items-center rounded-full text-[24px] leading-none"
          style={{ background: mine === e ? "var(--card2)" : "none", border: 0 }}
          onClick={() => {
            onClose();
            onPick(e);
          }}
        >
          {e}
        </button>
      ))}
    </motion.div>
  );
}

/** The small "+😊" that opens the bar (always shown on Feed posts; on hover next to chat bubbles). */
export function AddReactionButton({ onClick, className = "", label = "Add a reaction" }: { onClick: () => void; className?: string; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`hit press inline-flex h-7 shrink-0 items-center gap-0.5 rounded-full px-2 text-[12px] font-bold muted ${className}`}
      style={{ background: "var(--card2)", border: 0 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      +<span className="text-[14px] leading-none">😊</span>
    </button>
  );
}

/** "❤️ 3  🔥 2" under a post; mine is highlighted. Tapping opens who reacted. */
export function ReactionChips({ state, onOpen, align = "left", children }: { state: ReactionState; onOpen: () => void; align?: "left" | "right"; children?: React.ReactNode }) {
  const chips = reactionChips(state);
  if (!chips.length && !children) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
      {chips.map((c) => (
        <button
          key={c.emoji}
          type="button"
          className="press inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-bold"
          style={{ background: c.mine ? "var(--blue-bg)" : "var(--card2)", color: c.mine ? "var(--blue)" : "var(--ink)", border: c.mine ? "1.5px solid var(--blue)" : "1.5px solid transparent" }}
          aria-label={`${c.emoji} ${c.count}${c.mine ? ", including you" : ""}. See who reacted`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <span className="text-[14px] leading-none">{c.emoji}</span>
          <span className="num">{c.count}</span>
        </button>
      ))}
      {children}
    </div>
  );
}

/** Who reacted with what (post_reactors). Your own row can be tapped to remove your reaction. */
export function ReactorsSheet({ postId, me, today, onClose, onRemoveMine }: { postId: string | null; me: string; today: string; onClose: () => void; onRemoveMine: () => void }) {
  const [rows, setRows] = useState<PostReactor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  useEffect(() => {
    if (!postId) return;
    let live = true;
    loadPostReactors(postId).then(
      (r) => live && setRows(r),
      (e) => live && setError(e instanceof Error ? e.message : "Couldn't load reactions"),
    );
    return () => {
      live = false;
      setRows(null);
      setError(null);
      setFilter(null);
    };
  }, [postId]);
  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  const shown = (rows ?? []).filter((r) => !filter || r.emoji === filter).sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : 0));
  return (
    <BottomSheet open={!!postId} title="Reactions" onClose={onClose}>
      {rows && rows.length ? (
        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" className="chip press shrink-0" aria-pressed={!filter} style={{ height: 32 }} onClick={() => setFilter(null)}>
            All {rows.length}
          </button>
          {REACTIONS.filter((e) => counts.get(e)).map((e) => (
            <button key={e} type="button" className="chip press shrink-0 gap-1" aria-pressed={filter === e} style={{ height: 32 }} onClick={() => setFilter(e)}>
              {e} <span className="num">{counts.get(e)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {error ? <ErrorNote text={error} /> : null}
      {!rows && !error ? <p className="py-6 text-center text-[13px] muted">Loading…</p> : null}
      {rows && !rows.length ? <p className="py-6 text-center text-[13px] muted">No reactions yet</p> : null}
      <div className="flex flex-col">
        {shown.map((r) => {
          const mine = r.user_id === me;
          const body = (
            <>
              <Avatar path={r.avatar_path} name={r.name} size={40} />
              <span className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-[15px] font-bold">{mine ? "You" : r.name}</span>
                <span className="truncate text-[12px] muted">{mine ? "Tap to remove" : r.username ? `@${r.username}` : postStamp(r.created_at, today)}</span>
              </span>
              <span className="text-[24px] leading-none">{r.emoji}</span>
            </>
          );
          return mine ? (
            <button
              key={r.user_id}
              type="button"
              className="press flex min-h-[56px] items-center gap-3 py-1.5"
              style={{ background: "none", border: 0, color: "var(--ink)" }}
              onClick={() => {
                onRemoveMine();
                onClose();
              }}
            >
              {body}
            </button>
          ) : (
            <div key={r.user_id} className="flex min-h-[56px] items-center gap-3 py-1.5">
              {body}
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}

/** Single grey ✓ (sent) or blue ✓✓ (seen by some / everyone). */
export function Ticks({ state, size = 13 }: { state: SeenState; size?: number }) {
  const color = state === "sent" ? "var(--muted)" : "var(--blue)";
  const double = state !== "sent";
  return (
    <svg width={double ? (size * 19) / 16 : size} height={size} viewBox={double ? "0 0 19 16" : "0 0 16 16"} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1.5 8.5 5 12l7.5-8" />
      {double ? <path d="M8.5 11l1 1 7.5-8" /> : null}
    </svg>
  );
}

/** Who has seen my latest message (with their read time) and who hasn't yet. */
export function SeenSheet({ open, seen, unseen, today, onClose }: { open: boolean; seen: ReadRow[]; unseen: ReadRow[]; today: string; onClose: () => void }) {
  return (
    <BottomSheet open={open} title="Message info" onClose={onClose}>
      <p className="mb-1 flex items-center gap-1.5 text-[13px] font-bold muted">
        <Ticks state={seen.length ? "all" : "sent"} /> Seen by {seen.length}
      </p>
      {seen.length ? (
        seen.map((r) => (
          <div key={r.user_id} className="flex min-h-[52px] items-center gap-3 py-1">
            <Avatar path={r.avatar_path} name={r.name} size={36} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{r.name}</span>
            <span className="shrink-0 text-[12px] muted">{r.last_read_at ? postStamp(r.last_read_at, today) : ""}</span>
          </div>
        ))
      ) : (
        <p className="py-2 text-[13px] muted">Nobody yet</p>
      )}
      {unseen.length ? (
        <>
          <p className="mb-1 mt-3 text-[13px] font-bold muted">Not seen yet</p>
          {unseen.map((r) => (
            <div key={r.user_id} className="flex min-h-[52px] items-center gap-3 py-1" style={{ opacity: 0.7 }}>
              <Avatar path={r.avatar_path} name={r.name} size={36} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{r.name}</span>
            </div>
          ))}
        </>
      ) : null}
    </BottomSheet>
  );
}
