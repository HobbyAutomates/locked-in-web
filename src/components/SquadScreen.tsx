"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSquad, joinSquad, leaveSquad, nudgeMember, renameSquad } from "@/lib/actions";
import { addDays, weekStart } from "@/lib/dates";
import type { Squad, SquadMember } from "@/lib/types";
import { Check, Close, Copy, Fist, Pencil, Plus, Share } from "./icons";
import { BreathingFlame, Card, ChipRow, ErrorNote, PillButton, Rise } from "./ui";

const APK_URL = "https://evizkfvltacrfngsgbuu.supabase.co/storage/v1/object/public/app/LockedIn-12.apk";
const WEB_URL = "https://web-production-ff1cf.up.railway.app";

export function inviteText(code: string) {
  return `Join my Locked In squad: code ${code} — Android ${APK_URL} · iPhone ${WEB_URL}`;
}

type Props = {
  me: string;
  today: string;
  squads: Squad[];
  selectedId: string | null;
  board: SquadMember[];
  sentNudges: string[];
  shareStats: boolean;
};

/**
 * The Squad tab: the board — who's locked in today, this week's dots, streaks, protein & calories
 * for members who share them, and a nudge pill for anyone who hasn't trained yet. Create / join
 * lives behind the "+" in the header once you're in a squad.
 */
export default function SquadScreen({ me, today, squads, selectedId, board, sentNudges, shareStats }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const selected = squads.find((s) => s.id === selectedId) ?? null;
  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <div className="flex items-center justify-between">
          <h1 className="screen-title">Squad</h1>
          {squads.length ? (
            <button
              type="button"
              aria-label={adding ? "Close create or join" : "Create or join a squad"}
              aria-expanded={adding}
              className="press grid h-11 w-11 place-items-center rounded-full"
              style={{ background: adding ? "var(--card2)" : "var(--btn)", color: adding ? "var(--ink)" : "var(--btn-ink)", boxShadow: "var(--shadow-sm)" }}
              onClick={() => setAdding((v) => !v)}
            >
              {adding ? <Close size={18} /> : <Plus size={20} />}
            </button>
          ) : null}
        </div>
      </Rise>

      {!squads.length || adding ? <StartCards first={!squads.length} onDone={() => setAdding(false)} /> : null}

      {squads.length > 1 ? (
        <Rise index={1}>
          <ChipRow options={squads.map((s) => ({ key: s.id, label: s.name }))} value={selectedId ?? ""} onChange={(id) => router.push(`/squad?g=${id}`)} label="Your squads" />
        </Rise>
      ) : null}

      {selected ? <Board key={selected.id} me={me} today={today} squad={selected} board={board} sentNudges={sentNudges} shareStats={shareStats} /> : null}
    </div>
  );
}

/** Create a squad (one field, one button); "Have a code?" reveals the join field. */
function StartCards({ first, onDone }: { first: boolean; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<{ id: string; code: string; name: string } | null>(null);

  function create() {
    setError(null);
    start(async () => {
      try {
        const g = await createSquad(name);
        setCreated({ ...g, name: name.trim() });
        setName("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create the squad");
      }
    });
  }
  function join() {
    setError(null);
    start(async () => {
      try {
        const id = await joinSquad(code);
        setCode("");
        onDone();
        router.push(`/squad?g=${id}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not join");
      }
    });
  }

  if (created) {
    return (
      <Rise index={1}>
        <Card padding={20}>
          <p className="text-[15px]">
            <span className="font-bold">{created.name}</span> is live — send your friends the code.
          </p>
          <CodePill code={created.code} />
          <div className="mt-3">
            <PillButton
              soft
              height={46}
              onClick={() => {
                setCreated(null);
                onDone();
                router.push(`/squad?g=${created.id}`);
              }}
            >
              See the board
            </PillButton>
          </div>
        </Card>
      </Rise>
    );
  }

  return (
    <Rise index={1}>
      <Card padding={18}>
        <p className="text-[15px]">{first ? "Train with friends: make a squad and share its 6-letter code." : "Make another squad, or join one with a code."}</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create();
          }}
        >
          <input className="field" placeholder="Squad name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Squad name" />
          <PillButton type="submit" height={48} disabled={pending || !name.trim()} className="!w-auto shrink-0 !px-5">
            Create
          </PillButton>
        </form>
        {joining ? (
          <form
            className="mt-2.5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 6) join();
            }}
          >
            <input
              className="field num text-center font-extrabold uppercase"
              style={{ letterSpacing: "0.3em", fontSize: 20 }}
              placeholder="LOCK7Q"
              value={code}
              maxLength={6}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Squad code"
              onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6))}
            />
            <PillButton type="submit" height={48} disabled={pending || code.length !== 6} className="!w-auto shrink-0 !px-5">
              Join
            </PillButton>
          </form>
        ) : (
          <button type="button" className="hit press mt-2.5 py-1 text-[13px] font-semibold muted" onClick={() => setJoining(true)}>
            Have a code? Join a squad
          </button>
        )}
        {error ? (
          <div className="mt-2.5">
            <ErrorNote text={error} />
          </div>
        ) : null}
      </Card>
    </Rise>
  );
}

async function shareInvite(code: string) {
  const text = inviteText(code);
  try {
    if (navigator.share) await navigator.share({ text });
    else await navigator.clipboard.writeText(text);
  } catch {
    // Share sheet cancelled.
  }
}

/** The squad code as one big copyable pill, with the share / invite button beside it. */
function CodePill({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        className="press flex min-h-[56px] flex-1 items-center justify-between rounded-full pl-5 pr-4"
        style={{ background: "var(--card2)" }}
        aria-label={`Copy squad code ${code}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard blocked; the code is on screen anyway.
          }
        }}
      >
        <span className="num text-[26px] font-extrabold" style={{ letterSpacing: "0.2em" }}>
          {code}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: copied ? "var(--green)" : "var(--muted)" }}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
      <button type="button" aria-label="Invite friends" className="press grid h-14 w-14 shrink-0 place-items-center rounded-full" style={{ background: "var(--btn)", color: "var(--btn-ink)" }} onClick={() => shareInvite(code)}>
        <Share size={20} />
      </button>
    </div>
  );
}

/** Mon–Sun of the week containing `today`. */
function weekDays(today: string) {
  const ws = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
}

function streakOf(m: SquadMember) {
  return m.days.length ? m.days[m.days.length - 1].week_streak : 0;
}

function Board({ me, today, squad, board, sentNudges, shareStats }: { me: string; today: string; squad: Squad; board: SquadMember[]; sentNudges: string[]; shareStats: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [nudged, setNudged] = useState<Set<string>>(() => new Set(sentNudges));
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(squad.name);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pending, start] = useTransition();
  const isOwner = squad.owner_id === me;
  const days = weekDays(today);
  const members = [...board].sort((a, b) => streakOf(b) - streakOf(a) || (a.user_id === me ? -1 : b.user_id === me ? 1 : 0));

  function nudge(m: SquadMember) {
    setError(null);
    setNudged((s) => new Set(s).add(m.user_id));
    start(async () => {
      try {
        await nudgeMember(squad.id, m.user_id);
      } catch (e) {
        setNudged((s) => {
          const n = new Set(s);
          n.delete(m.user_id);
          return n;
        });
        setError(e instanceof Error ? e.message : "Could not send the nudge");
      }
    });
  }

  return (
    <>
      <Rise index={2}>
        <Card padding={18}>
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  try {
                    await renameSquad(squad.id, newName);
                    setRenaming(false);
                    router.refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not rename");
                  }
                });
              }}
            >
              <input className="field" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} aria-label="Squad name" autoFocus />
              <PillButton type="submit" height={48} disabled={pending || !newName.trim()} className="!w-auto shrink-0 !px-5">
                Save
              </PillButton>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[22px] font-extrabold" style={{ letterSpacing: "-0.025em" }}>
                {squad.name}
              </p>
              {isOwner ? (
                <button type="button" aria-label="Rename squad" className="hit press grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }} onClick={() => setRenaming(true)}>
                  <Pencil size={14} />
                </button>
              ) : null}
            </div>
          )}
          <p className="mt-0.5 text-xs muted">
            {board.length} member{board.length === 1 ? "" : "s"} · tap the code to copy it
          </p>
          <CodePill code={squad.code} />
        </Card>
      </Rise>

      {error ? <ErrorNote text={error} /> : null}

      {members.map((m, i) => {
        const todayRow = m.days.find((d) => d.date === today);
        const trainedToday = !!todayRow?.trained;
        const trainedDays = new Set(m.days.filter((d) => d.trained).map((d) => d.date));
        const isMe = m.user_id === me;
        const already = nudged.has(m.user_id);
        const first = m.name.split(" ")[0] || "them";
        return (
          <Rise key={m.user_id} index={3 + i}>
            <Card padding={14}>
              <div className="flex items-center gap-3">
                <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-[17px] font-bold" style={{ background: "var(--card2)" }}>
                  {(m.name || "?").slice(0, 1).toUpperCase()}
                  <span
                    className="absolute bottom-0 right-0 rounded-full"
                    style={{ width: 12, height: 12, background: trainedToday ? "var(--green)" : "var(--hair)", border: "2px solid var(--card)" }}
                    title={trainedToday ? "Trained today" : "Not yet today"}
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">
                    {m.name}
                    {isMe ? <span className="font-medium muted"> · you</span> : null}
                    {m.is_owner ? <span className="text-[11px] font-semibold muted"> · owner</span> : null}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: trainedToday ? "var(--green)" : "var(--muted)", fontWeight: trainedToday ? 700 : 500 }}>
                    {trainedToday ? "Locked in today" : "Not yet today"}
                    <span className="inline-flex items-center gap-0.5 font-extrabold" style={{ color: "var(--ink)" }} title={`${streakOf(m)}-week streak`}>
                      · <BreathingFlame size={13} />
                      <span className="num">{streakOf(m)}</span>
                    </span>
                  </span>
                </span>
                {!isMe && !trainedToday ? (
                  <button
                    type="button"
                    className="chip press shrink-0"
                    style={{ height: 36, padding: "0 12px", gap: 6, background: already ? "var(--card2)" : "var(--btn)", color: already ? "var(--muted)" : "var(--btn-ink)", fontWeight: 700 }}
                    disabled={already}
                    aria-label={already ? `Nudged ${first}` : `Nudge ${first}`}
                    onClick={() => nudge(m)}
                  >
                    {already ? <Check size={15} /> : <Fist size={15} />}
                    {already ? "Nudged" : "Nudge"}
                  </button>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex gap-1.5" aria-label="This week">
                  {days.map((d) => {
                    const did = trainedDays.has(d);
                    const future = d > today;
                    return (
                      <span key={d} className="flex flex-col items-center gap-1">
                        <span
                          className="rounded-full"
                          style={{
                            width: 14,
                            height: 14,
                            background: did ? "var(--green)" : "transparent",
                            border: did ? "none" : `1.5px solid ${future ? "var(--track)" : "var(--hair)"}`,
                            outline: d === today ? "1.5px solid var(--ink)" : "none",
                            outlineOffset: 1.5,
                          }}
                        />
                        <span className="text-[9px] font-semibold muted">{new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "narrow" })}</span>
                      </span>
                    );
                  })}
                </div>
                <span className="num text-right text-[13px] font-semibold" style={{ color: m.share_stats ? "var(--ink)" : "var(--muted)" }}>
                  {m.share_stats ? `${Math.round(todayRow?.protein_g ?? 0)} g · ${Math.round(todayRow?.calories ?? 0).toLocaleString("en-IN")} kcal` : "streaks only"}
                </span>
              </div>
            </Card>
          </Rise>
        );
      })}

      <Rise index={4 + members.length}>
        <p className="px-1 text-center text-xs muted">
          You share {shareStats ? "streaks + protein & calories" : "streaks only"} ·{" "}
          <Link href="/profile" className="font-semibold underline" style={{ color: "var(--ink)" }}>
            change
          </Link>
        </p>
      </Rise>

      <Rise index={5 + members.length}>
        {confirmLeave ? (
          <Card padding={16}>
            <p className="text-[15px] font-semibold">Leave {squad.name}?</p>
            <p className="mt-0.5 text-xs muted">{board.length <= 1 ? "You're the last one in, so the squad will be deleted." : isOwner ? "The longest-standing member becomes the owner." : "You can rejoin any time with the code."}</p>
            <div className="mt-3 flex gap-2">
              <PillButton soft height={44} onClick={() => setConfirmLeave(false)}>
                Stay
              </PillButton>
              <PillButton
                height={44}
                disabled={pending}
                style={{ background: "var(--red)", color: "#fff" }}
                onClick={() =>
                  start(async () => {
                    try {
                      await leaveSquad(squad.id);
                      router.push("/squad");
                      router.refresh();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not leave");
                    }
                  })
                }
              >
                Leave
              </PillButton>
            </div>
          </Card>
        ) : (
          <button type="button" className="hit press mx-auto block py-2 text-[13px] font-semibold" style={{ color: "var(--red)" }} onClick={() => setConfirmLeave(true)}>
            Leave squad
          </button>
        )}
      </Rise>
    </>
  );
}
