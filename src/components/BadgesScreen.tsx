"use client";

import { useState } from "react";
import { ALL_BADGES, GROUPS, earned, earnedCount, groupTitle, progressValue, requirement, shareText, type Badge, type BadgeProgress } from "@/lib/badges";
import { GROUP_ICON, LockedMedal, MetalMedal, TROPHY_ICON, TierLabel, badgeTier, medalShelf } from "./Medal";
import SubPage from "./SubPage";
import { Share } from "./icons";
import { Card, Rise } from "./ui";

/** The twelve medals, grouped by tier. v2.12: Medals v2 (metal rim by difficulty); earned ones can be shared. */
export default function BadgesScreen({ progress }: { progress: BadgeProgress }) {
  const got = earnedCount(progress);
  const top = medalShelf(progress).earned[0];
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
    <SubPage title="Badges">
      <Rise index={0}>
        <Card padding={20}>
          <div className="flex items-center gap-4">
            {top ? <MetalMedal tier={top.tier} icon={TROPHY_ICON} size={64} delay={120} /> : <LockedMedal progress={got / ALL_BADGES.length} icon={TROPHY_ICON} size={64} delay={120} />}
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
  const tier = badgeTier(badge);
  const value = progressValue(progress, badge.group);
  return (
    <Card padding={12} className="relative">
      <div className="flex flex-col items-center gap-1 text-center">
        {got ? <MetalMedal tier={tier} icon={GROUP_ICON[badge.group]} size={60} /> : <LockedMedal progress={value / badge.need} icon={GROUP_ICON[badge.group]} size={60} />}
        <span className="mt-0.5">{got ? <TierLabel tier={tier} /> : <TierLabel locked={`${Math.min(value, badge.need)} of ${badge.need}`} />}</span>
        <p className="text-xs font-bold leading-[15px]" style={{ color: got ? "var(--ink)" : "var(--muted)" }}>
          {badge.name}
        </p>
        <p className="text-[11px] muted">{requirement(badge)}</p>
      </div>
      {got ? (
        <button
          type="button"
          onClick={onShare}
          aria-label={`Share ${badge.name}`}
          className="press absolute right-0.5 top-0.5 grid place-items-center rounded-full"
          style={{ width: 36, height: 36, background: "none", border: 0, color: "var(--muted)" }}
        >
          <Share size={16} />
        </button>
      ) : null}
    </Card>
  );
}
