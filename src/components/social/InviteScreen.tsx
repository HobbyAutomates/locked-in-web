"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "../Avatar";
import { ErrorNote } from "../ui";
import { claimReferral } from "@/lib/social/actions";
import { bankedText, claimMessage, inviteText, inviteUrl, normalizeCode } from "@/lib/social/referrals";
import { shortDate } from "@/lib/dates";

export default function InviteScreen({ code, name, friends, bankedDays, proUntil, claimed }: { code: string; name: string; friends: { name: string; avatar_path: string | null; joined_at: string }[]; bankedDays: number; proUntil: string | null; claimed: boolean }) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = inviteUrl(origin || "https://lockedin.app", code);
  const banked = bankedText(bankedDays);
  const until = proUntil && Date.parse(proUntil) > Date.now() ? new Date(proUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;

  async function share() {
    const text = inviteText(name, url);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: "Locked In", text });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    await copy();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Long-press the link instead.");
    }
  }
  async function claim() {
    const c = normalizeCode(typed);
    if (!c) return setError("Codes are 6 letters and numbers");
    setBusy(true);
    setError(null);
    const r = await claimReferral(c);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (r.data.ok) {
      setMsg(claimMessage(r.data));
      router.refresh();
    } else setError(claimMessage(r.data));
  }

  return (
    <>
      <section aria-label="Your invite" className="flex flex-col gap-4" style={{ background: "linear-gradient(160deg, #0B0B0C, #1a1a1d)", color: "#F4F1EA", borderRadius: 26, padding: 22, boxShadow: "var(--shadow-lg)" }}>
        <p className="mono text-[11px] font-semibold uppercase" style={{ letterSpacing: "0.14em", opacity: 0.6 }}>
          Your invite
        </p>
        <p className="display text-[30px] font-extrabold leading-tight" style={{ letterSpacing: "-0.035em" }}>
          A week of Pro for you both.
        </p>
        <p className="text-[13.5px]" style={{ opacity: 0.72 }}>
          When a friend joins with your link, you each get 1 week of Pro. During the beta everyone has Pro already, so the weeks are banked for when it ends.
        </p>
        <div className="flex items-center gap-2 rounded-2xl px-3.5 py-3" style={{ background: "rgba(244,241,234,.07)" }}>
          <span className="mono min-w-0 flex-1 truncate text-[13px]">{url.replace(/^https?:\/\//, "")}</span>
          <button type="button" onClick={() => void copy()} className="press h-9 rounded-full px-3 text-[13px] font-semibold" style={{ background: "rgba(244,241,234,.12)", color: "#F4F1EA", border: 0 }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <button type="button" onClick={() => void share()} className="press flex h-12 items-center justify-center rounded-2xl text-[15px] font-bold" style={{ background: "#FF5B1F", color: "#0B0B0C", border: 0 }}>
          Share invite
        </button>
      </section>
      <ErrorNote text={error} />
      {msg ? (
        <p role="status" className="px-1 text-[13.5px] font-semibold" style={{ color: "var(--green-ink)" }}>
          {msg}
        </p>
      ) : null}
      <section aria-label="Joined with your link" className="flex flex-col gap-3" style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)" }}>
        <div className="flex items-baseline justify-between">
          <p className="text-[15.5px] font-semibold">Joined with your link</p>
          <span className="num text-[13px] muted">{friends.length}</span>
        </div>
        {banked || until ? <p className="text-[13px] font-semibold" style={{ color: "#9c7a35" }}>{[banked, until ? `Pro until ${until}` : null].filter(Boolean).join(" · ")}</p> : null}
        {friends.length ? (
          <ul className="flex flex-col gap-2">
            {friends.map((f, i) => (
              <li key={`${f.joined_at}-${i}`} className="flex items-center gap-3">
                <Avatar path={f.avatar_path} name={f.name} size={36} />
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{f.name}</span>
                <span className="text-[12.5px] muted">{shortDate(f.joined_at.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] muted">Nobody yet. Your squad is a good place to start.</p>
        )}
      </section>
      {!claimed ? (
        <section aria-label="Got a code" className="flex flex-col gap-2.5" style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)" }}>
          <p className="text-[15.5px] font-semibold">Got a friend&rsquo;s code?</p>
          <p className="text-[12.5px] muted">For accounts less than 30 days old.</p>
          <div className="flex gap-2">
            <input aria-label="Invite code" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} maxLength={8} placeholder="ABC234" className="mono h-11 min-w-0 flex-1 rounded-2xl px-3.5 text-[15px] tracking-[0.2em]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
            <button type="button" disabled={busy} onClick={() => void claim()} className="press h-11 rounded-2xl px-4 text-[14px] font-semibold" style={{ background: "var(--ink)", color: "var(--bg)", border: 0 }}>
              {busy ? "…" : "Use"}
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
