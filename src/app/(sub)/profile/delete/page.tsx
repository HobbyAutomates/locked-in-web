"use client";

import { useState } from "react";
import SubPage from "@/components/SubPage";
import { createClient } from "@/lib/supabase/client";
import { DELETE_WORD, deleteConfirmed } from "@/lib/social/safety";

const MAIL = "mailto:sohumai.team@gmail.com?subject=Delete%20my%20Locked%20In%20data";

/** v2.18 E5: delete the account in the app (type DELETE). The email request stays as the fallback. */
export default function DeleteAccountPage() {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    if (!deleteConfirmed(typed)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: DELETE_WORD }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || "Couldn't delete the account");
      try {
        localStorage.clear();
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        // Nothing cached.
      }
      await createClient().auth.signOut({ scope: "local" }).catch(() => undefined);
      window.location.replace("/login");
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Couldn't delete the account");
    }
  }

  return (
    <SubPage title="Delete account" back="/profile/preferences/account">
      <section className="flex flex-col gap-3" style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)" }}>
        <p className="text-[17px] font-bold">This can&rsquo;t be undone</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] muted">
          <li>Your meals, workouts, weights, water, photos and coach chats are wiped.</li>
          <li>Your posts leave every squad. Squads you own pass to the longest-standing member.</li>
          <li>You&rsquo;re signed out everywhere, and the email can sign up again later as a new account.</li>
        </ul>
        <p className="text-[13.5px]">
          Want a copy first?{" "}
          <a href="/profile/export" className="font-semibold underline" style={{ color: "var(--ink)" }}>
            Export your data
          </a>
          .
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold muted">Type {DELETE_WORD} to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" className="mono h-12 rounded-2xl px-3.5 text-[16px] tracking-[0.2em]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
        </label>
        {error ? <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>{error}</p> : null}
        <button type="button" disabled={!deleteConfirmed(typed) || busy} onClick={() => void del()} className="press h-12 rounded-2xl text-[15px] font-bold" style={{ background: "var(--danger)", color: "#fff", border: 0, opacity: deleteConfirmed(typed) ? 1 : 0.45 }}>
          {busy ? "Deleting…" : "Delete my account"}
        </button>
        <a href={MAIL} className="text-center text-[12.5px] muted underline">
          Or email us to do it for you
        </a>
      </section>
    </SubPage>
  );
}
