"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestJoin } from "@/lib/actions";
import type { SquadInvite } from "@/lib/types";
import { Check, Globe, Lock, Padlock } from "./icons";
import { SquadIcon } from "./SquadIcon";
import { ErrorNote, PillButton } from "./ui";

/** v2.6 invite landing (/join/<code>): the squad's card and one button — Join, or Ask to join a private squad. */
export default function JoinSquadScreen({ invite }: { invite: SquadInvite | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "requested">(invite?.requested ? "requested" : "idle");
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (!invite) return;
    setState("busy");
    setError(null);
    try {
      const res = await requestJoin(invite.id);
      if (res === "requested") setState("requested");
      else router.replace(`/squad/${invite.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join");
      setState("idle");
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col justify-center px-6 py-10">
      <span className="flex items-center justify-center gap-2 text-[11px] font-bold tracking-[0.15em] muted">
        <Lock size={18} />
        LOCKED IN
      </span>
      {!invite ? (
        <div className="mt-8 flex flex-col items-center text-center">
          <h1 className="text-[24px] font-extrabold">That invite doesn&apos;t work</h1>
          <p className="mt-1 text-[14px] muted">The code may be mistyped, or the squad was deleted.</p>
          <Link href="/squad" className="pill press mt-6" style={{ minHeight: 52 }}>
            Go to Squads
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col items-center text-center">
          <SquadIcon icon={invite.icon} cover={invite.cover_url} size={120} />
          <p className="mt-4 text-[13px] font-semibold muted">You&apos;re invited to join</p>
          <h1 className="text-[28px] font-extrabold" style={{ letterSpacing: "-0.03em" }}>
            {invite.name}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold muted">
            {invite.member_count} member{invite.member_count === 1 ? "" : "s"} ·{invite.join_policy === "request" ? <Padlock size={13} /> : <Globe size={13} />}
            {invite.join_policy === "request" ? "Private" : "Open"}
          </p>
          {invite.description || invite.tagline ? <p className="mt-2 max-w-[320px] text-[14px] muted">{invite.description || invite.tagline}</p> : null}
          <div className="mt-8 w-full">
            {state === "requested" ? (
              <div className="flex flex-col items-center gap-2">
                <span className="flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-bold" style={{ background: "var(--green-bg)", color: "var(--green)" }}>
                  <Check size={16} /> Request sent
                </span>
                <p className="text-[13px] muted">The owner will let you in — it shows up under Squads once they approve.</p>
                <Link href="/squad" className="hit mt-2 text-[13px] font-semibold underline" style={{ color: "var(--ink)" }}>
                  Go to Squads
                </Link>
              </div>
            ) : (
              <PillButton disabled={state === "busy"} onClick={() => void join()}>
                {state === "busy" ? "Joining…" : invite.join_policy === "request" ? "Ask to join" : "Join squad"}
              </PillButton>
            )}
          </div>
          {error ? (
            <div className="mt-3 w-full">
              <ErrorNote text={error} />
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
