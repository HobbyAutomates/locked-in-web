"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "../Avatar";
import { BottomSheet } from "../ui";
import { cheer, loadBlocks, loadLive, loadStamps, reportContent, setBlocked, setStamp } from "@/lib/social/actions";
import { loadSquadExtras, type SquadExtras } from "@/lib/social/squadActions";
import { EMPTY_STAMPS, STAMP_LABEL, stampVerdict, stampable, toggleStamp, type Stamp, type StampState } from "@/lib/social/stamps";
import { liveElapsed, liveLine, type LiveRow } from "@/lib/social/live";
import { BLOCKS_KEY, REPORT_REASONS, type ReportReason } from "@/lib/social/safety";

/**
 * v2.18 squad additions, dropped into SquadRoom with one line each:
 *   D3 VerifiedTick · D6 StampsProvider / StampMark / StampRow · D7 + D8 SquadSocialTop (who's live,
 *   cheer / join, pledges peek, "Get verified" for owners) · E5 useBlocked / SafetyMenu / MemberSafety.
 * Every piece hides itself when its schema_v44 / v45 table isn't there.
 */

type PostLike = { id: string; kind: string; photo_path: string | null; user_id: string; body?: string | null; author_name?: string | null; created_at?: string };

/* ---------------- E5 blocks ---------------- */

function readLocalBlocks(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(BLOCKS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeLocalBlocks(ids: string[]) {
  try {
    localStorage.setItem(BLOCKS_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(BLOCKS_KEY));
  } catch {
    // Device copy only.
  }
}

/** The people I blocked (server list when schema_v45 exists, merged with the device list). */
export function useBlocked(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(readLocalBlocks());
    void loadBlocks()
      .then((r) => {
        if (r.ok) {
          const merged = [...new Set([...readLocalBlocks(), ...r.data])];
          writeLocalBlocks(merged);
          setIds(merged);
        }
      })
      .catch(() => undefined);
    const on = () => setIds(readLocalBlocks());
    window.addEventListener(BLOCKS_KEY, on);
    return () => window.removeEventListener(BLOCKS_KEY, on);
  }, []);
  return ids;
}

async function block(userId: string, on: boolean): Promise<string | null> {
  const cur = readLocalBlocks();
  writeLocalBlocks(on ? [...new Set([...cur, userId])] : cur.filter((x) => x !== userId));
  const r = await setBlocked(userId, on);
  return r.ok || r.missing ? null : r.error;
}

function ReportSheet({ open, onClose, target }: { open: boolean; onClose: () => void; target: { userId: string; name: string; groupId: string; post?: PostLike | null } }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "later">("idle");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    if (!reason) return;
    setState("busy");
    setError(null);
    const r = await reportContent({ reason, note, postId: target.post?.id ?? null, groupId: target.groupId, userId: target.userId, post: target.post ? { kind: target.post.kind, body: target.post.body ?? "", author_name: target.post.author_name ?? target.name, created_at: target.post.created_at } : undefined });
    if (alsoBlock) await block(target.userId, true);
    if (r.ok) setState("sent");
    else if (r.missing) setState("later");
    else {
      setState("idle");
      setError(r.error);
    }
  }
  return (
    <BottomSheet
      open={open}
      onClose={() => {
        onClose();
        setState("idle");
        setReason(null);
        setNote("");
      }}
      title={state === "sent" ? "Thanks for telling us" : `Report ${target.post ? "this post" : target.name}`}
      subtitle={state === "sent" ? "We'll look at it. They won't know it was you." : state === "later" ? "Reports open with the next server update. If it's urgent, email sohumai.team@gmail.com." : "Only the Locked In team sees reports."}
    >
      {state === "sent" || state === "later" ? null : (
        <div className="flex flex-col gap-2">
          {REPORT_REASONS.map((r) => (
            <button key={r.key} type="button" role="radio" aria-checked={reason === r.key} onClick={() => setReason(r.key)} className="press flex min-h-12 items-center justify-between rounded-2xl px-4 text-left text-[14.5px] font-semibold" style={{ background: reason === r.key ? "var(--ink)" : "var(--card2)", color: reason === r.key ? "var(--bg)" : "var(--ink)", border: 0 }}>
              {r.label}
            </button>
          ))}
          <textarea aria-label="Anything else (optional)" placeholder="Anything else (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="min-h-20 rounded-2xl px-3.5 py-3 text-[14px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
          <label className="flex items-center gap-2 px-1 text-[13.5px]">
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
            Also block {target.name.split(" ")[0]}
          </label>
          {error ? <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>{error}</p> : null}
          <button type="button" disabled={!reason || state === "busy"} onClick={() => void send()} className="press h-12 rounded-2xl text-[15px] font-bold" style={{ background: "var(--danger)", color: "#fff", border: 0, opacity: reason ? 1 : 0.5 }}>
            {state === "busy" ? "Sending…" : "Send report"}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

/** "⋯" on someone else's post: Report, Block. */
export function SafetyMenu({ post, squadId }: { post: PostLike; squadId: string }) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const name = post.author_name || "them";
  return (
    <div ref={ref} className="relative shrink-0 self-center">
      <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={open} className="hit press grid h-8 w-8 place-items-center rounded-full text-[18px] font-bold leading-none muted" style={{ background: "none", border: 0 }} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 min-w-[150px] rounded-2xl py-1" style={{ background: "var(--card)", boxShadow: "var(--shadow-lg)" }}>
          <button type="button" role="menuitem" className="press flex min-h-[44px] w-full items-center px-3.5 text-[14px] font-semibold" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => { setOpen(false); setReport(true); }}>
            Report post
          </button>
          <button type="button" role="menuitem" className="press flex min-h-[44px] w-full items-center px-3.5 text-[14px] font-semibold" style={{ background: "none", border: 0, color: "var(--danger)" }} onClick={() => { setOpen(false); void block(post.user_id, true); }}>
            Block {name.split(" ")[0]}
          </button>
        </div>
      ) : null}
      <ReportSheet open={report} onClose={() => setReport(false)} target={{ userId: post.user_id, name, groupId: squadId, post }} />
    </div>
  );
}

/** Report / Block buttons on the member sheet. */
export function MemberSafety({ userId, name, squadId, me }: { userId: string; name: string; squadId: string; me: string }) {
  const blocked = useBlocked();
  const [report, setReport] = useState(false);
  if (userId === me) return null;
  const isBlocked = blocked.includes(userId);
  return (
    <div className="mt-3 flex w-full gap-2">
      <button type="button" onClick={() => setReport(true)} className="press h-11 flex-1 rounded-2xl text-[14px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }}>
        Report
      </button>
      <button type="button" onClick={() => void block(userId, !isBlocked)} className="press h-11 flex-1 rounded-2xl text-[14px] font-semibold" style={{ background: "var(--card2)", color: isBlocked ? "var(--ink)" : "var(--danger)", border: 0 }}>
        {isBlocked ? "Unblock" : "Block"}
      </button>
      <ReportSheet open={report} onClose={() => setReport(false)} target={{ userId, name, groupId: squadId }} />
    </div>
  );
}

/* ---------------- D6 stamps ---------------- */

type StampsCtx = { get: (id: string) => StampState; tap: (id: string, s: Stamp) => void; on: boolean };
const Ctx = createContext<StampsCtx>({ get: () => EMPTY_STAMPS, tap: () => undefined, on: false });

export function StampsProvider({ posts, children }: { posts: PostLike[]; children: React.ReactNode }) {
  const [map, setMap] = useState<Record<string, StampState>>({});
  const [on, setOn] = useState(true);
  const ids = posts.filter(stampable).map((p) => p.id).filter((id) => !id.startsWith("temp-"));
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let dead = false;
    void loadStamps(key.split(",")).then((r) => {
      if (dead) return;
      if (r.ok) setMap((m) => ({ ...m, ...r.data }));
      else if (r.missing) setOn(false);
    });
    return () => {
      dead = true;
    };
  }, [key]);
  const get = useCallback((id: string) => map[id] ?? EMPTY_STAMPS, [map]);
  const tap = useCallback(
    (id: string, s: Stamp) => {
      const before = map[id] ?? EMPTY_STAMPS;
      const next = toggleStamp(before, s);
      setMap((m) => ({ ...m, [id]: next.state }));
      void setStamp(id, next.save).then((r) => {
        if (!r.ok) setMap((m) => ({ ...m, [id]: before }));
        if (!r.ok && r.missing) setOn(false);
      });
    },
    [map],
  );
  return <Ctx.Provider value={{ get, tap, on }}>{children}</Ctx.Provider>;
}

/** The big rubber stamp over a meal photo once the squad has a majority. */
export function StampMark({ post }: { post: PostLike }) {
  const c = useContext(Ctx);
  if (!c.on || !stampable(post)) return null;
  const v = stampVerdict(c.get(post.id));
  if (!v) return null;
  const clean = v === "clean";
  return (
    <span aria-label={`Squad verdict: ${STAMP_LABEL[v]}`} className="m-pop pointer-events-none absolute right-3 top-3 rounded-lg px-2.5 py-1 text-[15px] font-black" style={{ transform: "rotate(-9deg)", border: `2.5px solid ${clean ? "#1fae6f" : "#FF5B1F"}`, color: clean ? "#1fae6f" : "#FF5B1F", background: "rgba(11,11,12,0.55)", letterSpacing: "0.12em", backdropFilter: "blur(2px)" }}>
      {STAMP_LABEL[v]}
    </span>
  );
}

/** Clean / Cheat buttons with counts under a meal photo. */
export function StampRow({ post }: { post: PostLike }) {
  const c = useContext(Ctx);
  if (!c.on || !stampable(post)) return null;
  const s = c.get(post.id);
  const btn = (k: Stamp, tint: string) => (
    <button type="button" aria-pressed={s.mine === k} onClick={() => c.tap(post.id, k)} className="press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-extrabold" style={{ letterSpacing: "0.08em", background: s.mine === k ? tint : "var(--card2)", color: s.mine === k ? "#0B0B0C" : "var(--ink)", border: 0 }}>
      {STAMP_LABEL[k]}
      {s[k] ? <span className="num" style={{ opacity: 0.7 }}>{s[k]}</span> : null}
    </button>
  );
  return (
    <div className="mt-2 flex items-center gap-1.5" aria-label="Stamp this meal">
      {btn("clean", "#5fd49b")}
      {btn("cheat", "#FF8B5E")}
    </div>
  );
}

/* ---------------- D3 verified tick ---------------- */

const extrasCache = new Map<string, Promise<SquadExtras | null>>();
function useExtras(squadId: string): SquadExtras | null {
  const [x, setX] = useState<SquadExtras | null>(null);
  useEffect(() => {
    let dead = false;
    let p = extrasCache.get(squadId);
    if (!p) {
      p = loadSquadExtras(squadId).catch(() => null);
      extrasCache.set(squadId, p);
    }
    void p.then((v) => {
      if (!dead) setX(v);
    });
    return () => {
      dead = true;
    };
  }, [squadId]);
  return x;
}

export function VerifiedTick({ squadId }: { squadId: string }) {
  const x = useExtras(squadId);
  if (!x?.verified) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-1 align-[1px]" title={x.org_name ? `Verified ${x.org_kind ?? "squad"}: ${x.org_name}` : "Verified squad"}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-label="Verified squad" role="img">
        <path d="M12 1.5l2.6 2 3.2-.4 1.2 3 3 1.2-.4 3.2 2 2.6-2 2.6.4 3.2-3 1.2-1.2 3-3.2-.4-2.6 2-2.6-2-3.2.4-1.2-3-3-1.2.4-3.2-2-2.6 2-2.6-.4-3.2 3-1.2 1.2-3 3.2.4z" fill="#D9B872" />
        <path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#0B0B0C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {x.org_name ? <span className="max-w-[120px] truncate text-[11px] font-semibold" style={{ color: "#9c7a35" }}>{x.org_name}</span> : null}
    </span>
  );
}

/* ---------------- D7 live + D8 pledges peek ---------------- */

const POLL_MS = 60_000;

export function SquadSocialTop({ squadId, isOwner }: { squadId: string; isOwner: boolean }) {
  const x = useExtras(squadId);
  const [live, setLive] = useState<LiveRow[] | null>(null);
  const [cheered, setCheered] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const r = await loadLive(squadId).catch(() => null);
      if (dead) return;
      if (r?.ok) setLive(r.data);
      else if (r && !r.ok && r.missing) return;
      if (document.visibilityState === "visible") timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
    };
  }, [squadId]);
  async function doCheer(u: string) {
    setCheered((c) => ({ ...c, [u]: true }));
    const r = await cheer(u);
    if (!r.ok) setCheered((c) => ({ ...c, [u]: false }));
  }
  const pledges = x?.activePledges ?? 0;
  const showVerify = isOwner && x && x.verifiedColumns && !x.verified;
  if (!live?.length && !pledges && !showVerify) return null;
  return (
    <div className="flex flex-col gap-2">
      {live?.map((l) => (
        <div key={l.user_id} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: "linear-gradient(135deg, #0B0B0C, #1c1410)", color: "#F4F1EA", boxShadow: "var(--shadow-sm)" }}>
          <span className="relative">
            <Avatar path={l.avatar_path} name={l.name} size={36} />
            <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full" style={{ background: "#FF5B1F", boxShadow: "0 0 0 2px #0B0B0C, 0 0 10px #FF5B1F" }} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-semibold">{liveLine(l.name, l.label)}</span>
            <span className="text-[11.5px]" style={{ opacity: 0.65 }}>
              {liveElapsed(l.started_at)}
              {l.cheers ? ` · ${l.cheers} ${l.cheers === 1 ? "cheer" : "cheers"}` : ""}
            </span>
          </span>
          <button type="button" disabled={cheered[l.user_id]} onClick={() => void doCheer(l.user_id)} className="press h-9 rounded-full px-3 text-[12.5px] font-bold" style={{ background: cheered[l.user_id] ? "rgba(244,241,234,.12)" : "#FF5B1F", color: cheered[l.user_id] ? "#F4F1EA" : "#0B0B0C", border: 0 }}>
            {cheered[l.user_id] ? "Cheered" : "Cheer"}
          </button>
          <Link href="/train/session" className="press grid h-9 place-items-center rounded-full px-3 text-[12.5px] font-bold" style={{ background: "rgba(244,241,234,.12)", color: "#F4F1EA" }}>
            Join
          </Link>
        </div>
      ))}
      {pledges || showVerify ? (
        <div className="flex gap-2">
          {pledges ? (
            <Link href={`/pledges?squad=${squadId}`} className="press flex flex-1 items-center justify-between rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold" style={{ background: "var(--card)", color: "var(--ink)", boxShadow: "var(--pcard-ring)" }}>
              <span>
                {pledges} active {pledges === 1 ? "pledge" : "pledges"}
              </span>
              <span className="muted">See</span>
            </Link>
          ) : null}
          {showVerify ? (
            <Link href={`/squad/${squadId}/verify`} className="press flex items-center rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold" style={{ background: "var(--card)", color: "#9c7a35", boxShadow: "var(--pcard-ring)" }}>
              {x?.pending ? "Verification pending" : "Get verified"}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
