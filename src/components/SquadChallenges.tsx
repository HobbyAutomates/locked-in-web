"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createChallenge } from "@/lib/actions";
import {
  CHALLENGE_LENGTHS,
  CHALLENGE_TEMPLATES,
  MAX_OPEN_CHALLENGES,
  PROTEIN_MAX,
  PROTEIN_MIN,
  challengeEmoji,
  challengeStatus,
  defaultProtein,
  defaultTarget,
  defaultTitle,
  progressLabel,
  ruleLabel,
  startOptions,
  timeLabel,
} from "@/lib/challenges";
import { addDays, shortDate } from "@/lib/dates";
import type { Challenge, ChallengeBoardRow, ChallengeKind } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ChevronDown, ChevronRight, Plus, Target } from "./icons";
import { BottomSheet, ErrorNote, PillButton, Ring } from "./ui";

/**
 * v2.7 Challenges tab: open (upcoming + active) challenges as cards with my progress ring, the time
 * left and who's leading; "Start a challenge" (max 3 open); a collapsed "Past" list with who
 * finished. Every squad member is in automatically — there's no join step.
 */
export function ChallengesTab({
  me,
  today,
  squadId,
  challenges,
  boards,
  proteinGoal,
  onCreated,
}: {
  me: string;
  today: string;
  squadId: string;
  challenges: Challenge[];
  boards: Record<string, ChallengeBoardRow[]>;
  proteinGoal: number | null;
  onCreated: () => void;
}) {
  const [sheet, setSheet] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const open = challenges.filter((c) => challengeStatus(c, today) !== "ended");
  const past = challenges.filter((c) => challengeStatus(c, today) === "ended");
  const full = open.length >= MAX_OPEN_CHALLENGES;

  return (
    <div className="flex flex-col gap-3 px-4 pb-10 pt-3">
      <div className="flex flex-col gap-1.5">
        <PillButton onClick={() => setSheet(true)} disabled={full}>
          <Plus size={18} />
          Start a challenge
        </PillButton>
        {full ? <p className="px-1 text-center text-[12px] muted">3 challenges already going. Start the next one when one wraps up.</p> : null}
      </div>

      {!open.length ? (
        <div className="flex flex-col items-center py-12 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
            <Target size={30} />
          </span>
          <p className="mt-3 text-[18px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
            No challenges yet
          </p>
          <p className="mt-1 max-w-[270px] text-[14px] muted">Pick one, set the target, and the whole squad&apos;s in. Your logs count on their own.</p>
        </div>
      ) : (
        open.map((c) => <ChallengeCard key={c.id} me={me} today={today} squadId={squadId} c={c} board={boards[c.id]} />)
      )}

      {past.length ? (
        <div className="flex flex-col gap-2 pt-1">
          <button type="button" className="press flex items-center gap-1.5 px-1 py-2 text-left text-[13px] font-bold muted" style={{ background: "none", border: 0 }} aria-expanded={pastOpen} onClick={() => setPastOpen((v) => !v)}>
            Past ({past.length})
            <span className="inline-flex" style={{ transform: pastOpen ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>
              <ChevronDown size={16} />
            </span>
          </button>
          {pastOpen ? past.map((c) => <PastRow key={c.id} squadId={squadId} c={c} board={boards[c.id]} />) : null}
        </div>
      ) : null}

      <CreateChallengeSheet
        open={sheet}
        today={today}
        squadId={squadId}
        proteinGoal={proteinGoal}
        onClose={() => setSheet(false)}
        onCreated={() => {
          setSheet(false);
          onCreated();
        }}
      />
    </div>
  );
}

function ChallengeCard({ me, today, squadId, c, board }: { me: string; today: string; squadId: string; c: Challenge; board?: ChallengeBoardRow[] }) {
  const status = challengeStatus(c, today);
  const done = c.my_progress >= c.target_days;
  const leader = board?.find((r) => r.user_id === c.leader_user_id) ?? board?.[0];
  const leaderIsMe = (c.leader_user_id ?? leader?.user_id) === me;
  return (
    <Link href={`/squad/${squadId}/challenge/${c.id}`} className="card press flex flex-col gap-3" style={{ padding: 14, color: "var(--ink)" }}>
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12px] font-semibold muted">
            {challengeEmoji(c.kind)} {status === "upcoming" ? "Upcoming" : "Live"} · {timeLabel(c, today)}
          </span>
          <span className="mt-0.5 text-[17px] font-extrabold leading-tight" style={{ letterSpacing: "-0.02em" }}>
            {c.title}
          </span>
          <span className="mt-1 text-[12px] muted">{ruleLabel(c.kind, c.protein_target)}</span>
        </span>
        <Ring fraction={c.target_days ? c.my_progress / c.target_days : 0} color={done ? "var(--flame)" : "var(--ink)"} size={78} stroke={8}>
          <span className="flex flex-col items-center leading-none">
            <span className="num text-[19px] font-extrabold">
              {c.my_progress}
              <span className="text-[12px] font-bold muted">/{c.target_days}</span>
            </span>
            <span className="mt-0.5 text-[10px] font-semibold muted">{done ? "done 🔥" : "days"}</span>
          </span>
        </Ring>
      </div>
      <div className="hair" />
      <div className="flex items-center gap-2 text-[13px]">
        {status === "active" && c.leader_progress > 0 && c.leader_name ? (
          <>
            <Avatar path={leader?.avatar_path ?? null} name={c.leader_name} size={26} />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-bold">{leaderIsMe ? "You" : c.leader_name}</span> <span className="muted">{leaderIsMe ? "lead" : "leads"} · {progressLabel(c.leader_progress, c.target_days)}</span>
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate muted">
            {status === "upcoming" ? `${c.participants} in · kicks off ${shortDate(c.starts_on)}` : "Board's wide open. First log takes the lead 👀"}
          </span>
        )}
        {c.completed_count ? <span className="shrink-0 text-[12px] font-semibold">🏆 {c.completed_count}</span> : null}
        <span className="muted inline-flex shrink-0">
          <ChevronRight size={16} />
        </span>
      </div>
    </Link>
  );
}

function PastRow({ squadId, c, board }: { squadId: string; c: Challenge; board?: ChallengeBoardRow[] }) {
  const finishers = (board ?? []).filter((r) => r.completed);
  const names = finishers.slice(0, 3).map((r) => r.name.split(" ")[0]);
  const more = finishers.length - names.length;
  const who = !board
    ? c.completed_count
      ? `🏆 ${c.completed_count} finished`
      : "Wrapped up"
    : finishers.length
      ? `🏆 ${names.join(", ")}${more > 0 ? ` +${more}` : ""}`
      : "No finishers this round";
  return (
    <Link href={`/squad/${squadId}/challenge/${c.id}`} className="card press flex items-center gap-3" style={{ padding: "12px 14px", color: "var(--ink)" }}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[18px]" style={{ background: "var(--card2)" }} aria-hidden="true">
        {challengeEmoji(c.kind)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-bold">{c.title}</span>
        <span className="truncate text-[12px] muted">{who}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold muted">
        <span className="num">{progressLabel(c.my_progress, c.target_days).replace(" 🔥", "")}</span>
        <ChevronRight size={14} />
      </span>
    </Link>
  );
}

/* ---------------- Create sheet ---------------- */

function Stepper({ value, min, max, step = 1, label, format, onChange }: { value: number; min: number; max: number; step?: number; label: string; format: (v: number) => string; onChange: (v: number) => void }) {
  const btn = "press grid h-9 w-9 place-items-center rounded-full text-[18px] font-bold";
  return (
    <span className="flex items-center gap-2">
      <button type="button" className={btn} style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="num min-w-[76px] text-center text-[15px] font-bold" aria-live="polite">
        {format(value)}
      </span>
      <button type="button" className={btn} style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </span>
  );
}

function SheetLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 mt-4 px-0.5 text-xs font-semibold muted first:mt-0">{children}</p>;
}

function CreateChallengeSheet({ open, today, squadId, proteinGoal, onClose, onCreated }: { open: boolean; today: string; squadId: string; proteinGoal: number | null; onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<ChallengeKind>("train_days");
  const [length, setLength] = useState<number>(14);
  const [start, setStart] = useState<"today" | "tomorrow">("today");
  const [target, setTarget] = useState(() => defaultTarget("train_days", 14));
  const [protein, setProtein] = useState(() => defaultProtein(proteinGoal));
  const [title, setTitle] = useState<string | null>(null); // null = follow the template
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const starts = startOptions(today);
  const startsOn = starts.find((s) => s.key === start)?.date ?? today;
  const endsOn = addDays(startsOn, length - 1);
  const autoTitle = useMemo(() => defaultTitle(kind, target, length, protein), [kind, target, length, protein]);
  const shownTitle = title ?? autoTitle;

  function pickKind(k: ChallengeKind) {
    setKind(k);
    setTarget(defaultTarget(k, length));
    setTitle(null);
  }
  function pickLength(n: number) {
    setLength(n);
    setTarget(defaultTarget(kind, n));
  }
  function reset() {
    setKind("train_days");
    setLength(14);
    setStart("today");
    setTarget(defaultTarget("train_days", 14));
    setProtein(defaultProtein(proteinGoal));
    setTitle(null);
    setError(null);
  }

  async function submit() {
    const t = shownTitle.trim();
    if (!t) {
      setError("Give it a name");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createChallenge({ groupId: squadId, kind, title: t, targetDays: target, proteinTarget: kind === "protein_days" ? protein : null, startsOn, endsOn });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    reset();
    onCreated();
  }

  return (
    <BottomSheet
      open={open}
      title="Start a challenge"
      subtitle="Everyone in the squad is in. Logs count on their own."
      onClose={() => {
        reset();
        onClose();
      }}
      primary={{ label: busy ? "Starting…" : "Start challenge 🏁", disabled: busy, onClick: () => void submit() }}
    >
      <SheetLabel>Challenge</SheetLabel>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Challenge type">
        {CHALLENGE_TEMPLATES.map((t) => (
          <button key={t.kind} type="button" role="radio" aria-checked={kind === t.kind} className="chip press" onClick={() => pickKind(t.kind)}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      <SheetLabel>Length</SheetLabel>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Length">
        {CHALLENGE_LENGTHS.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={length === n} className="chip press" onClick={() => pickLength(n)}>
            {n} days
          </button>
        ))}
      </div>

      <SheetLabel>Starts</SheetLabel>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Start date">
        {starts.map((s) => (
          <button key={s.key} type="button" role="radio" aria-checked={start === s.key} className="chip press" onClick={() => setStart(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 px-0.5 text-[12px] muted">
        {shortDate(startsOn)} → {shortDate(endsOn)}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-[15px] font-bold">Target</span>
          <span className="text-[12px] muted">{ruleLabel(kind, protein)}</span>
        </span>
        <Stepper value={target} min={1} max={length} label="days" format={(v) => `${v} of ${length}`} onChange={setTarget} />
      </div>

      {kind === "protein_days" ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-[15px] font-bold">Protein</span>
            <span className="text-[12px] muted">per day</span>
          </span>
          <Stepper value={protein} min={PROTEIN_MIN} max={PROTEIN_MAX} step={5} label="protein" format={(v) => `${v} g`} onChange={setProtein} />
        </div>
      ) : null}

      <SheetLabel>Name</SheetLabel>
      <input className="field" value={shownTitle} maxLength={60} aria-label="Challenge name" onChange={(e) => setTitle(e.target.value)} />

      {error ? (
        <div className="mt-3">
          <ErrorNote text={error} />
        </div>
      ) : null}
    </BottomSheet>
  );
}
