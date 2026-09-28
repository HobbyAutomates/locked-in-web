"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD, passwordProblem } from "@/lib/social/safety";

/**
 * v2.18 E5: the page the recovery email opens. Handles both link styles Supabase can send: PKCE
 * (?code=… exchanged here) and the implicit #access_token hash (picked up by the browser client).
 */
export default function ResetPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "bad">("checking");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const code = new URLSearchParams(window.location.search).get("code");
    const go = async () => {
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        // Drop the one-time code from the address bar either way.
        window.history.replaceState(null, "", "/reset");
        if (err) return setReady("bad");
      }
      const { data } = await supabase.auth.getSession();
      setReady(data.session ? "ok" : "bad");
    };
    void go();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = passwordProblem(pw, again);
    if (p) return setError(p);
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(err.message);
    router.replace("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-5 px-6" style={{ minHeight: "100dvh", paddingTop: "calc(48px + env(safe-area-inset-top, 0px))", paddingBottom: 32 }}>
      <h1 className="text-[32px] font-extrabold" style={{ letterSpacing: "-1px", lineHeight: 1.1 }}>
        Pick a new password
      </h1>
      {ready === "checking" ? <p className="text-[15px] muted">Checking your link…</p> : null}
      {ready === "bad" ? (
        <>
          <p className="text-[15px] muted">That link has expired or was already used. Ask for a new one.</p>
          <Link href="/forgot" className="press flex h-12 items-center justify-center rounded-2xl text-[15px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
            Send a new link
          </Link>
        </>
      ) : null}
      {ready === "ok" ? (
        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-3">
          <input type="password" autoComplete="new-password" aria-label="New password" placeholder={`New password (${MIN_PASSWORD}+ characters)`} value={pw} onChange={(e) => setPw(e.target.value)} className="h-12 rounded-2xl px-3.5 text-[16px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
          <input type="password" autoComplete="new-password" aria-label="New password again" placeholder="Once more" value={again} onChange={(e) => setAgain(e.target.value)} className="h-12 rounded-2xl px-3.5 text-[16px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
          {error ? <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>{error}</p> : null}
          <button type="submit" disabled={busy} className="press rounded-2xl py-3.5 text-[16px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0 }}>
            {busy ? "Saving…" : "Save and sign in"}
          </button>
        </form>
      ) : null}
    </main>
  );
}
