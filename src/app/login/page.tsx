"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { nameFromEmail } from "@/lib/display";
import { Lock } from "@/components/icons";
import { ErrorNote, PillButton } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            // The signup trigger copies this into profiles.name; the confirmation email greets with it.
            options: { data: { name: name.trim().slice(0, 40) || nameFromEmail(email) } },
          });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up") {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return setMsg("Account created. Confirm the email we sent, then sign in.");
    }
    // v2.6: invite links send people here with ?next=/join/<code>; only same-site paths are followed.
    const next = new URLSearchParams(window.location.search).get("next") ?? "";
    router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[480px] flex-col justify-center px-6 py-10">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] muted">
          <Lock size={18} />
          LOCKED IN
        </span>
        <h1 className="text-3xl font-extrabold">{mode === "in" ? "Sign in" : "Create account"}</h1>
        <p className="text-[13px] muted">One sign-in on this phone. You&apos;ll stay logged in.</p>

        {mode === "up" ? (
          <div className="mt-3 flex flex-col gap-2">
            <label className="text-[13px] font-semibold muted" htmlFor="name">
              Your name <span className="font-normal">(optional)</span>
            </label>
            <input
              id="name"
              className="field"
              type="text"
              autoComplete="given-name"
              maxLength={40}
              value={name}
              placeholder={nameFromEmail(email) || "What your squad calls you"}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        ) : null}
        <div className={mode === "up" ? "flex flex-col gap-2" : "mt-3 flex flex-col gap-2"}>
          <label className="text-[13px] font-semibold muted" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="field"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold muted" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="field"
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>

        <ErrorNote text={msg} />

        <div className="mt-2">
          <PillButton type="submit" disabled={busy || !email || password.length < 6}>
            {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
          </PillButton>
        </div>
        <button
          type="button"
          className="press mx-auto py-2 text-[13px] muted"
          style={{ background: "none", border: 0 }}
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setMsg(null);
          }}
        >
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
