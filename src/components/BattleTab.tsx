"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { loadBattleBoard, postBattleSnap, saveMeal } from "@/lib/actions";
import { pointsToLead, scoreRow, type ScoredBattleRow } from "@/lib/battle";
import { toJpegBase64 } from "@/lib/image";
import { mealItemFromPlate } from "@/lib/quantity";
import type { BattleBoardRow, BattleWinner, PlateEstimate, PlateItem, Squad } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Camera, Spinner, Trash } from "./icons";
import { BottomSheet, Card, ErrorNote } from "./ui";

const GOAL_LABEL: Record<string, string> = { gain: "Bulk", lose: "Cut", maintain: "Maintain" };
const GOAL_TINT: Record<string, string> = { gain: "var(--purple)", lose: "var(--red)", maintain: "var(--blue)" };

type Row = BattleBoardRow & { tieBreakTime?: string | null };

function toScored(rows: Row[]): (ScoredBattleRow & { tieBreakTime?: string | null })[] {
  return rows.map((r) => ({
    ...scoreRow({ userId: r.user_id, name: r.name, avatarPath: r.avatar_path, goalType: r.goal_type, eaten: r.eaten, target: r.target, meals: r.meals, private: r.private }),
    tieBreakTime: r.tieBreakTime ?? null,
  }));
}

/**
 * Squad Food Battle: the live board + yesterday's graffiti crown + the Snap button. See
 * docs/food-battle-spec.md. Framing is progress against each member's own goal band, never
 * ranking-shame — everyone sees their own bar against their own band.
 */
export function BattleTab({ me, squad, date, crown, onError }: { me: string; squad: Squad; date: string; crown: BattleWinner; onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapFile, setSnapFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const board = await loadBattleBoard(squad.id, date);
      setRows(board);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't load the battle board");
    } finally {
      setLoading(false);
    }
  }, [squad.id, date, onError]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  if (!squad.battle_enabled) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 pt-16 text-center">
        <span className="text-[40px]">👑</span>
        <p className="text-[17px] font-extrabold">Food Battle is off</p>
        <p className="max-w-[280px] text-[13px] muted">The squad owner can turn it on from Edit squad in Members. Everyone snaps their meals; whoever&apos;s closest to their own goal wins the crown.</p>
      </div>
    );
  }

  const scored = rows ? toScored(rows) : [];
  const leaderId = scored.filter((r) => r.canWin).sort((a, b) => b.score - a.score)[0]?.userId;

  return (
    <div className="flex flex-col gap-3 px-4 pb-28 pt-3">
      {crown ? <CrownCard crown={crown} /> : null}

      <button type="button" className="card press flex items-center gap-3 text-left" style={{ padding: "12px 14px", color: "var(--ink)" }} onClick={() => fileRef.current?.click()}>
        <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--orange-bg)", color: "var(--orange)" }}>
          <Camera size={20} />
        </span>
        <span className="flex flex-col">
          <span className="text-[15px] font-bold">Snap what you&apos;re eating</span>
          <span className="text-xs muted">AI estimates it, then it posts to this squad</span>
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (f) setSnapFile(f);
        }}
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size={22} />
        </div>
      ) : (
        scored.map((r) => <BoardRow key={r.userId} row={r} me={me} isLeader={r.userId === leaderId} gap={pointsToLead(r, scored)} />)
      )}
      <p className="px-1 pt-1 text-center text-[12px] leading-snug muted">Score is how close you are to your own goal band today — not a ranking against anyone else. 👑 = today&apos;s leader.</p>

      <SnapSheet
        open={!!snapFile}
        file={snapFile}
        squadId={squad.id}
        onClose={() => setSnapFile(null)}
        onSaved={() => {
          setSnapFile(null);
          void refresh();
        }}
      />
    </div>
  );
}

function CrownCard({ crown }: { crown: NonNullable<BattleWinner> }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="graffiti-card">
      <p className="graffiti-tag text-[11px] uppercase tracking-wide" style={{ color: "#ffd23c", opacity: 0.9 }}>
        Yesterday&apos;s crown
      </p>
      <p className="graffiti-name mt-1">
        {crown.name}
        <span className="graffiti-drip" aria-hidden="true" />
        👑
      </p>
      <p className="mt-1 text-[13px] font-semibold" style={{ color: "#fff", opacity: 0.85 }}>
        {Math.round(crown.score)} pts · {GOAL_LABEL[crown.goal_type] ?? crown.goal_type}
      </p>
    </motion.div>
  );
}

function BoardRow({ row, me, isLeader, gap }: { row: ScoredBattleRow; me: string; isLeader: boolean; gap: number | null }) {
  const [lo, hi] = row.goalType === "gain" ? [1.0, 1.1] : row.goalType === "lose" ? [0.9, 1.0] : [0.95, 1.05];
  const pct = row.target > 0 ? Math.min(1.3, row.r) / 1.3 : 0;
  const bandLo = lo / 1.3;
  const bandHi = hi / 1.3;
  const isMe = row.userId === me;
  return (
    <Card style={{ padding: "12px 14px", outline: isMe ? "2px solid var(--ink)" : "none" }}>
      <div className="flex items-center gap-3">
        <Avatar path={row.avatarPath} name={row.name} size={40} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 truncate text-[14px] font-bold">
            {row.name}
            {isMe ? <span className="font-medium muted"> · you</span> : null}
            {isLeader && row.canWin ? <span aria-label="Leader">👑</span> : null}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] muted">
            <span className="chip" style={{ height: 18, padding: "0 8px", fontSize: 10, fontWeight: 700, background: GOAL_TINT[row.goalType], color: "#fff" }}>
              {GOAL_LABEL[row.goalType] ?? row.goalType}
            </span>
            {row.private ? "Private" : `${Math.round(row.eaten)} / ${Math.round(row.target)} kcal`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="num text-[17px] font-extrabold">{row.private ? "—" : row.eligible ? Math.round(row.score) : "–"}</span>
          <span className="text-[10px] muted">{row.meals} meal{row.meals === 1 ? "" : "s"}</span>
        </span>
      </div>
      {!row.private ? (
        <div className="relative mt-2.5 h-2 rounded-full" style={{ background: "var(--card2)" }}>
          <div className="absolute inset-y-0 rounded-full" style={{ left: `${bandLo * 100}%`, width: `${Math.max(0, bandHi - bandLo) * 100}%`, background: "var(--green-bg)" }} />
          <div className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full" style={{ left: `calc(${Math.min(99, pct * 100)}% - 6px)`, background: row.underFuelled ? "var(--red)" : "var(--ink)" }} />
        </div>
      ) : null}
      {row.underFuelled ? <p className="mt-1.5 text-[11px] font-semibold" style={{ color: "var(--red)" }}>Under-fuelled — eat more, not less</p> : !row.eligible ? <p className="mt-1.5 text-[11px] muted">Log one more meal to be eligible today</p> : gap ? <p className="mt-1.5 text-[11px] muted">{gap} pts to lead</p> : null}
    </Card>
  );
}

/** Snap → estimate → confirm → save + enrich the squad post. Reuses /api/photo-meal (plateFlow); no reimplementation of the vision or nutrition logic. */
function SnapSheet({ open, squadId, file, onClose, onSaved }: { open: boolean; squadId: string; file: File | null; onClose: () => void; onSaved: () => void }) {
  const [plate, setPlate] = useState<PlateEstimate | null>(null);
  const [items, setItems] = useState<PlateItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !file) return;
    (async () => {
      setPlate(null);
      setItems([]);
      setError(null);
      setBusy(true);
      try {
        const { base64 } = await toJpegBase64(file, 1280, 0.82);
        const res = await fetch("/api/photo-meal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: base64, media_type: "image/jpeg" }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Couldn't read that photo");
        const est = data as PlateEstimate;
        setPlate(est);
        setItems(est.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't read that photo");
      } finally {
        setBusy(false);
      }
    })();
  }, [open, file]);

  const kcal = items.reduce((a, i) => a + i.calories, 0);
  const low = kcal * 0.85;
  const high = kcal * 1.15;

  async function confirm() {
    if (!plate || !items.length) return;
    setBusy(true);
    setError(null);
    try {
      const dateIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      const { id: mealId } = await saveMeal({ date: dateIso, raw_text: plate.plate_note || items.map((i) => i.name).join(", "), photo_path: plate.photo_path ?? null, items: items.map(mealItemFromPlate) });
      const summary = items.slice(0, 3).map((i) => i.name).join(" + ") + (items.length > 3 ? ` + ${items.length - 3} more` : "");
      const res = await postBattleSnap({ groupId: squadId, mealId: String(mealId ?? ""), photoPath: plate.photo_path ?? null, itemsSummary: summary, kcal, kcalLow: low, kcalHigh: high });
      if (!("ok" in res) || !res.ok) throw new Error("ok" in res && !res.ok ? res.error : "Couldn't post that");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that meal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      title="Snap check"
      subtitle={`~${Math.round(kcal)} kcal (${Math.round(low)}–${Math.round(high)})`}
      onClose={onClose}
      primary={{ label: busy ? <Spinner size={18} /> : "Save & post", onClick: () => void confirm(), disabled: busy || !items.length }}
    >
      {busy && !items.length ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <Spinner size={22} />
          <p className="text-[13px] muted">Reading your plate…</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{it.name}</span>
              <span className="text-xs muted">{Math.round(it.calories)} kcal</span>
              <button type="button" aria-label={`Remove ${it.name}`} className="hit press grid h-7 w-7 place-items-center rounded-full" style={{ color: "var(--muted)" }} onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                <Trash size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error ? (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      ) : null}
    </BottomSheet>
  );
}
