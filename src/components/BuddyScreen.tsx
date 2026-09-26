"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WEB_URL } from "@/lib/squadPosts";
import { buddyAccept, buddyInvite, buddyNudge, loadBuddies, removeBuddy, type Buddy } from "@/lib/v214Actions";
import { ErrorNote } from "./ui";
import { Flame } from "./icons";
import { COMING_SOON } from "@/lib/v36";

/**
 * v2.14 buddy streaks (/buddy). Both log = the streak grows; one skips = the other can nudge;
 * break it and you both start over. Invite by link / code, or type a buddy's code. `invite`
 * opens the share sheet straight away (the onboarding's "Invite a buddy").
 */
export const buddyLink = (code: string) => `${WEB_URL}/buddy/${code}`;

export default function BuddyScreen({ autoInvite = false, code: incoming = null, inviter = null }: { autoInvite?: boolean; code?: string | null; inviter?: string | null }) {
  const router = useRouter();
  const [list, setList] = useState<Buddy[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (r: Awaited<ReturnType<typeof loadBuddies>>) => {
    if (r.ok) setList(r.buddies);
    else {
      setList([]);
      if (r.unavailable) setUnavailable(true);
    }
  };
  const refresh = () => loadBuddies().then(apply);
  useEffect(() => {
    let live = true;
    loadBuddies().then((r) => {
      if (!live) return;
      apply(r);
      // The onboarding's "Invite a buddy": straight to the share sheet once the list is in.
      if (autoInvite && r.ok) void share();
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  async function share() {
    setErr(null);
    let c = code;
    if (!c) {
      const r = await buddyInvite();
      if (!r.ok) return setErr(r.error);
      c = r.code;
      setCode(c);
    }
    const url = buddyLink(c);
    const text = `Lock in with me on Locked In. Both log daily and our streak grows. Code ${c}`;
    try {
      if (navigator.share) await navigator.share({ title: "Buddy streak", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setMsg("Link copied. Send it to your buddy.");
      }
    } catch {
      // Share sheet closed: the code is on screen anyway.
    }
  }


  async function accept(c: string) {
    setBusy(true);
    setErr(null);
    const r = await buddyAccept(c);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setMsg("You're buddies now. Both log today to start the streak.");
    setTyped("");
    await refresh();
    router.replace("/buddy");
  }

  if (unavailable)
    return (
      <div className="card text-center">
        <p className="font-bold">{COMING_SOON}</p>
        <p className="mt-1 text-sm muted">Buddy streaks need a quick server update.</p>
      </div>
    );

  return (
    <>
      {incoming ? (
        <div className="card flex flex-col gap-3">
          <p className="m-0 text-[17px] font-bold">{inviter ? `${inviter} wants a buddy streak` : "Join a buddy streak"}</p>
          <p className="m-0 text-sm muted">Both of you log every day and the streak grows. One skips, the other can nudge.</p>
          <button type="button" className="pill press" style={{ background: "var(--ember)", color: "var(--ember-ink)" }} disabled={busy} onClick={() => void accept(incoming)}>
            {busy ? "Joining…" : "Lock in together"}
          </button>
        </div>
      ) : null}

      {list?.map((b) => (
        <div key={b.id} className="card flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: b.streak ? "var(--ember-bg)" : "var(--card2)", color: b.streak ? "var(--ember)" : "var(--muted)" }}>
              <Flame size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="display num text-[26px] font-extrabold leading-none">{b.streak} days</div>
              <div className="text-sm muted">
                you + {b.partner_name} · best {b.best}
              </div>
            </div>
          </div>
          <div className="flex gap-2 text-[13px]">
            <span className="rounded-full px-3 py-1.5" style={{ background: b.me_today ? "var(--btn)" : "var(--card2)", color: b.me_today ? "var(--btn-ink)" : "var(--ink)" }}>
              You {b.me_today ? "logged" : "haven't logged"}
            </span>
            <span className="rounded-full px-3 py-1.5" style={{ background: b.partner_today ? "var(--btn)" : "var(--card2)", color: b.partner_today ? "var(--btn-ink)" : "var(--ink)" }}>
              {b.partner_name.split(" ")[0]} {b.partner_today ? "logged" : "hasn't logged"}
            </span>
          </div>
          <div className="flex gap-2">
            {!b.partner_today ? (
              <button
                type="button"
                className="press flex-1 rounded-full py-2.5 text-[14px] font-bold"
                style={{ background: "var(--btn)", color: "var(--btn-ink)", border: 0 }}
                onClick={async () => {
                  const r = await buddyNudge(b.id);
                  setMsg(r.ok ? (r.sent ? `Nudged ${b.partner_name}.` : "Already nudged today.") : r.error);
                }}
              >
                Nudge {b.partner_name.split(" ")[0]}
              </button>
            ) : null}
            <button
              type="button"
              className="press rounded-full px-4 py-2.5 text-[14px] font-semibold"
              style={{ background: "var(--card2)", color: "var(--danger)", border: 0 }}
              onClick={async () => {
                if (!window.confirm(`End your streak with ${b.partner_name}?`)) return;
                const r = await removeBuddy(b.id);
                if (!r.ok) setErr(r.error);
                await refresh();
              }}
            >
              End
            </button>
          </div>
        </div>
      ))}

      <div className="card flex flex-col gap-3">
        <p className="m-0 text-[17px] font-bold">Invite a buddy</p>
        <p className="m-0 text-sm muted">Both log = streak grows. One skips = the other gets to nudge. Break it and you both start over.</p>
        {code ? (
          <p className="display num m-0 text-center text-[34px] font-extrabold" style={{ letterSpacing: "0.12em" }}>
            {code}
          </p>
        ) : null}
        <button type="button" className="pill press" onClick={() => void share()}>
          {code ? "Share the link again" : "Get my invite link"}
        </button>
      </div>

      <form
        className="card flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          const m = typed.replace(/[^a-z0-9]/gi, "").toUpperCase();
          if (m.length !== 6) return setErr("Codes are 6 letters and numbers.");
          void accept(m);
        }}
      >
        <p className="m-0 text-[15px] font-bold">Got a buddy code?</p>
        <div className="flex gap-2">
          <input className="field flex-1" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="AB12CD" autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-label="Buddy code" maxLength={12} />
          <button type="submit" className="press rounded-2xl px-4 text-[15px] font-bold" style={{ background: "var(--btn)", color: "var(--btn-ink)", border: 0 }} disabled={busy}>
            Join
          </button>
        </div>
      </form>
      {msg ? <p className="text-sm" style={{ color: "var(--ink)" }}>{msg}</p> : null}
      <ErrorNote text={err} />
    </>
  );
}
