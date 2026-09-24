"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteChallenge } from "@/lib/actions";
import { challengeEmoji, challengeLength, challengeStatus, ruleLabel, timeLabel } from "@/lib/challenges";
import { shortDate } from "@/lib/dates";
import type { Challenge, ChallengeBoardRow, Squad } from "@/lib/types";
import { ArrowLeft, Trash } from "./icons";
import { ProgressBar, SquadRankRow } from "./SquadRankRow";
import { BottomSheet, ErrorNote, Ring, Rise } from "./ui";

type Props = { me: string; today: string; squad: Squad; challenge: Challenge; board: ChallengeBoardRow[] };

/**
 * v2.7 challenge detail: the challenge up top with my ring, then every squad member ranked by
 * qualifying days (earlier finishers first on a tie), a bar each and 🏆 for finishers. The creator
 * and the squad owner can delete it.
 */
export default function ChallengeDetail({ me, today, squad, challenge: c, board }: Props) {
  const router = useRouter();
  const back = `/squad/${squad.id}?tab=challenges`;
  const canDelete = c.created_by === me || squad.owner_id === me;
  const status = challengeStatus(c, today);
  const done = c.my_progress >= c.target_days;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await deleteChallenge(c.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setConfirm(false);
      return;
    }
    router.push(back);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col" style={{ paddingTop: "calc(8px + env(safe-area-inset-top, 0px))", paddingBottom: 40 }}>
      <div className="flex items-center px-4 py-2">
        <button type="button" onClick={() => router.push(back)} aria-label="Back" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="min-w-0 flex-1 truncate px-2 text-center text-[17px] font-bold">{squad.name}</h1>
        {canDelete ? (
          <button type="button" onClick={() => setConfirm(true)} aria-label="Delete challenge" className="press grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)", color: "var(--ink)" }}>
            <Trash size={17} />
          </button>
        ) : (
          <span className="w-10" />
        )}
      </div>

      <div className="flex flex-col gap-3 px-4 pt-1.5">
        <ErrorNote text={error} />
        <Rise index={0}>
          <div className="card flex items-center gap-4" style={{ padding: 16 }}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12px] font-semibold muted">
                {challengeEmoji(c.kind)} {status === "upcoming" ? "Upcoming" : status === "ended" ? "Wrapped" : "Live"} · {timeLabel(c, today)}
              </span>
              <span className="mt-1 text-[21px] font-extrabold leading-tight" style={{ letterSpacing: "-0.02em" }}>
                {c.title}
              </span>
              <span className="mt-1.5 text-[12px] muted">
                {ruleLabel(c.kind, c.protein_target)} · {challengeLength(c)} days
              </span>
              <span className="text-[12px] muted">
                {shortDate(c.starts_on)} → {shortDate(c.ends_on)} · by {c.created_by === me ? "you" : c.creator_name}
              </span>
            </span>
            <Ring fraction={c.target_days ? c.my_progress / c.target_days : 0} color={done ? "var(--flame)" : "var(--ink)"} size={92} stroke={9}>
              <span className="flex flex-col items-center leading-none">
                <span className="num text-[22px] font-extrabold">
                  {c.my_progress}
                  <span className="text-[13px] font-bold muted">/{c.target_days}</span>
                </span>
                <span className="mt-0.5 text-[10px] font-semibold muted">{done ? "done 🔥" : "you"}</span>
              </span>
            </Ring>
          </div>
        </Rise>

        <p className="px-1 pt-1 text-xs font-semibold muted">
          Board · {c.completed_count ? `🏆 ${c.completed_count} of ${c.participants} done` : `${c.participants} in`}
        </p>
        {board.map((r, i) => (
          <Rise key={r.user_id} index={i + 1}>
            <SquadRankRow
              rank={r.rank}
              avatarPath={r.avatar_path}
              name={r.name}
              username={r.username}
              isMe={r.user_id === me}
              meta={r.completed && r.completed_on ? `done ${shortDate(r.completed_on)}` : status === "upcoming" ? "starts soon" : `${Math.max(0, c.target_days - r.progress)} to go`}
              right={
                <span className="flex items-center gap-1 text-[15px] font-extrabold">
                  {r.completed ? <span aria-label="Completed">🏆</span> : null}
                  <span className="num">
                    {r.progress}
                    <span className="text-[12px] font-bold muted">/{c.target_days}</span>
                  </span>
                </span>
              }
            >
              <ProgressBar fraction={c.target_days ? r.progress / c.target_days : 0} color={r.completed ? "var(--flame)" : "var(--ink)"} />
            </SquadRankRow>
          </Rise>
        ))}
        {!board.length ? <p className="px-1 text-center text-[13px] muted">Couldn&apos;t load the board. Refresh in a sec.</p> : null}
        <p className="px-1 pt-1 text-center text-[12px] leading-snug muted">
          Days count from your logs automatically. Hit {c.target_days} to take the 🏆.
        </p>
      </div>

      <BottomSheet
        open={confirm}
        title="Delete this challenge?"
        subtitle="It's gone for the whole squad. Feed posts stay."
        onClose={() => setConfirm(false)}
        primary={{ label: busy ? "Deleting…" : "Delete challenge", disabled: busy, onClick: () => void remove() }}
      />
    </div>
  );
}
