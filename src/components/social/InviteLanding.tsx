"use client";

import { useEffect } from "react";
import Link from "next/link";
import { REF_STORAGE_KEY } from "@/lib/social/referrals";

/** The page a friend lands on from an invite link (ink, bone, one ember button). */
export default function InviteLanding({ code }: { code: string | null }) {
  useEffect(() => {
    if (!code) return;
    try {
      localStorage.setItem(REF_STORAGE_KEY, code);
    } catch {
      // No storage: the invite can't be remembered; sign-up still works.
    }
  }, [code]);
  return (
    <main className="mx-auto flex min-h-full w-full max-w-[480px] flex-col justify-between px-6" style={{ background: "#0B0B0C", color: "#F4F1EA", paddingTop: "calc(48px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(32px + env(safe-area-inset-bottom, 0px))", minHeight: "100dvh" }}>
      <div className="flex flex-col gap-5">
        <p className="display text-[22px] font-extrabold" style={{ letterSpacing: "-0.03em" }}>
          locked in
        </p>
        <h1 className="display text-[44px] font-extrabold leading-[0.95]" style={{ letterSpacing: "-0.045em" }}>
          {code ? "You're invited." : "That invite looks off."}
        </h1>
        <p className="serif text-[22px] italic leading-snug" style={{ opacity: 0.85 }}>
          {code ? "Join, and you and your friend both get a week of Pro." : "Ask your friend for a fresh link, or just sign up."}
        </p>
        {code ? (
          <p className="mono inline-flex w-fit rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ background: "rgba(244,241,234,.08)", letterSpacing: "0.18em" }}>
            {code}
          </p>
        ) : null}
        <ul className="mt-2 flex flex-col gap-2 text-[15px]" style={{ opacity: 0.8 }}>
          <li>Log food by typing or talking, in Hinglish.</li>
          <li>Snap a plate, a label or a barcode.</li>
          <li>Train with a squad that notices when you skip.</li>
        </ul>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/login" className="press flex h-14 items-center justify-center rounded-2xl text-[16px] font-bold" style={{ background: "#FF5B1F", color: "#0B0B0C" }}>
          Get started
        </Link>
        <Link href="/" className="press flex h-12 items-center justify-center text-[14px] font-semibold" style={{ color: "#F4F1EA", opacity: 0.7 }}>
          I already have an account
        </Link>
      </div>
    </main>
  );
}
