"use client";

import { useState } from "react";
import { ALL_BADGES, GROUPS, earnedCount, groupTitle, requirement, shareText, type Badge, type BadgeProgress } from "@/lib/badges";
import { jewelItems, nextJewel, topJewel, type JewelItem } from "@/lib/jewels";
import { TierLabel, moreText } from "./Medal";
import { Jewel } from "./Jewel";
import BadgeUnlock from "./BadgeUnlock";
import SubPage from "./SubPage";
import { Share } from "./icons";
import { Card, Rise } from "./ui";

/**
 * The twelve badges, grouped as before. v2.16: jewellery shields (lib/jewels.ts): frame shape by
 * category, metal by tier, gem colour by category; locked ones dark with an ember progress line.
 * "Next up" sits under the grid. Earned ones can still be shared.
 */
export default function BadgesScreen({ progress }: { progress: BadgeProgress }) {
  const got = earnedCount(progress);
  const top = topJewel(progress);
  const next = nextJewel(progress);
  const items = jewelItems(progress);
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
      <BadgeUnlock progress={progress} />
      <Rise index={0}>
        <Card padding={20}>
          <div className="flex items-center gap-4">
            {top ? <Jewel category={top.category} tier={top.tier} size={68} delay={120} /> : <Jewel category="special" tier="bronze" locked progress={got / ALL_BADGES.length} size={68} delay={120} />}
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
            {items
              .filter((x) => x.badge.group === g)
              .map((x, k) => (
                <BadgeTile key={x.id} item={x} delay={200 + gi * 120 + k * 70} onShare={() => share(x.badge)} />
              ))}
          </div>
        </Rise>
      ))}
      <Rise index={GROUPS.length + 1}>
        <NextUp next={next} />
      </Rise>
    </SubPage>
  );
}

/** "Next up: Getting Serious · 3 more days" with an ember bar; used here and on Profile. */
export function NextUp({ next, bare = false }: { next: JewelItem | null; bare?: boolean }) {
  const body = next ? (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-2 text-[13.5px]">
        <span>
          Next up: <b className="font-semibold">{next.badge.name}</b>
        </span>
        <span className="num muted">{moreText({ badge: next.badge, value: next.value, tier: "bronze", got: false, fraction: next.fraction })}</span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-full" style={{ background: "var(--track)" }} role="progressbar" aria-label={`${next.badge.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(next.fraction * 100)}>
        <div className="m-growx h-full rounded-full" style={{ width: `${Math.max(2, next.fraction * 100)}%`, background: "linear-gradient(90deg, var(--ember-2), var(--ember))", animationDelay: "600ms" }} />
      </div>
    </div>
  ) : (
    <p className="text-[13.5px] muted">Every badge earned. Legend.</p>
  );
  if (bare) return body;
  return <Card padding={16}>{body}</Card>;
}

function BadgeTile({ item, delay, onShare }: { item: JewelItem; delay: number; onShare: () => void }) {
  const { badge, got, tier, category, value, fraction } = item;
  return (
    <Card padding={12} className="relative">
      <div className="flex flex-col items-center gap-1 text-center">
        <Jewel category={category} tier={tier} size={64} locked={!got} progress={fraction} delay={delay} />
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
