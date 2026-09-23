"use client";

import { useState } from "react";
import { ALL_BADGES, GROUPS, earned, earnedCount, groupTitle, progressValue, shareText, type Badge, type BadgeProgress } from "@/lib/badges";
import HexMedal from "./HexMedal";
import SubPage from "./SubPage";
import { Share } from "./icons";
import { Card, Rise } from "./ui";

/** The twelve medals, grouped by tier. Earned ones burn orange and can be shared. */
export default function BadgesScreen({ progress }: { progress: BadgeProgress }) {
  const got = earnedCount(progress);
  const [toast, setToast] = useState<string | null>(null);

  async function share(b: Badge) {
    const text = shareText(b);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Locked In", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setToast("Copied — paste it anywhere.");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        setToast("Copied — paste it anywhere.");
      } catch {
        setToast(text);
      }
    }
  }

  return (
    <SubPage title="Badges" back="/progress">
      <Rise index={0}>
        <Card padding={20}>
          <div className="flex items-center gap-4">
            <HexMedal number={got} earned size={64} />
            <div className="min-w-0">
              <p className="num text-[22px] font-extrabold" style={{ letterSpacing: "-0.03em" }}>
                {got} of {ALL_BADGES.length} earned
              </p>
              <p className="text-xs muted">
                Longest streak {progress.streakDays} d · {progress.meals} meals · {progress.goalDays} goal days
              </p>
            </div>
          </div>
        </Card>
      </Rise>
      {toast ? (
        <Rise index={0}>
          <p className="break-all px-1 text-xs muted" role="status">
            {toast}
          </p>
        </Rise>
      ) : null}
      {GROUPS.map((g, gi) => (
        <Rise key={g} index={gi + 1}>
          <p className="mb-2 pl-1 text-[13px] font-bold muted">{groupTitle(g)}</p>
          <div className="grid grid-cols-3 gap-2.5">
            {ALL_BADGES.filter((b) => b.group === g).map((b) => (
              <BadgeTile key={b.name} badge={b} progress={progress} onShare={() => share(b)} />
            ))}
          </div>
        </Rise>
      ))}
    </SubPage>
  );
}

function BadgeTile({ badge, progress, onShare }: { badge: Badge; progress: BadgeProgress; onShare: () => void }) {
  const got = earned(progress, badge);
  return (
    <Card padding={12} className="relative">
      <div className="flex flex-col items-center text-center">
        <HexMedal number={badge.need} earned={got} size={56} />
        <p className="mt-2 text-xs font-bold leading-[15px]" style={{ color: got ? "var(--ink)" : "var(--muted)" }}>
          {badge.name}
        </p>
        <p className="num text-[11px]" style={{ color: got ? "var(--flame)" : "var(--muted)", fontWeight: got ? 700 : 400 }}>
          {got ? "Earned" : `${progressValue(progress, badge.group)} / ${badge.need}`}
        </p>
      </div>
      {got ? (
        <button
          type="button"
          onClick={onShare}
          aria-label={`Share ${badge.name}`}
          className="press absolute right-1.5 top-1.5 grid place-items-center rounded-full"
          style={{ width: 28, height: 28, background: "none", border: 0, color: "var(--muted)" }}
        >
          <Share size={16} />
        </button>
      ) : null}
    </Card>
  );
}
