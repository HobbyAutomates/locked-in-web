"use client";

import Link from "next/link";
import { dismiss, useDismissed } from "@/lib/dismiss";
import { CoachAvatar } from "@/components/onboarding/kit";
import { Close } from "../icons";

/**
 * v2.14 "Tune your plan": existing users aren't sent through the new onboarding; this card offers
 * its new questions (training, obstacles, coach style) instead. Shown while onboarded_v2 is false.
 */
export default function TuneCard() {
  const hidden = useDismissed("tune-plan-v214");
  if (hidden) return null;
  return (
    <div className="m-rise card relative flex items-center gap-3" style={{ padding: "14px 44px 14px 14px" }}>
      <CoachAvatar size={40} />
      <Link href="/start?tune=1" className="min-w-0 flex-1" style={{ color: "var(--ink)" }}>
        <span className="display block text-[16px] font-extrabold">Tune your plan</span>
        <span className="block text-[13px] leading-snug muted">Three quick questions and your new AI coach knows how to talk to you.</span>
      </Link>
      <button type="button" aria-label="Hide" className="press absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={() => dismiss("tune-plan-v214")}>
        <Close size={16} />
      </button>
    </div>
  );
}
