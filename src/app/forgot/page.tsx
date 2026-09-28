"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * v2.18 E5 forgot password: Supabase sends a recovery email whose link opens /reset (add
 * <site>/reset to Supabase Auth → URL configuration → Redirect URLs). The answer is the same
 * whether or not the address has an account, so this page can't be used to probe emails.
 */
export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` });
    if (err && /rate|too many/i.test(err.message)) {
      setState("idle");
      setError("Too many tries. Wait a minute and try again.");
      return;
    }
    setState("sent");
  }

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-5 px-6" style={{ minHeight: "100dvh", paddingTop: "calc(48px + env(safe-area-inset-top, 0px))", paddingBottom: 32 }}>
      <Link href="/login" className="press text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
        ← Sign in
      </Link>
      <h1 className="text-[32px] font-extrabold" style={{ letterSpacing: "-1px", lineHeight: 1.1 }}>
        Reset your password
      </h1>
      {state === "sent" ? (
        <p className="text-[16px] muted">If there&rsquo;s an account for that email, a reset link is on its way. Open it on this phone, then pick a new password.</p>
      ) : (
        <form onSubmit={(e) => void send(e)} className="flex flex-col gap-3">
          <p className="text-[15px] muted">We&rsquo;ll email you a link to set a new one.</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold muted">Email</span>
            <input type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-2xl px-3.5 text-[16px]" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} />
          </label>
          {error ? <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>{error}</p> : null}
          <button type="submit" disabled={state === "busy" || !email.includes("@")} className="press h-13 rounded-2xl py-3.5 text-[16px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0 }}>
            {state === "busy" ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </main>
  );
}
