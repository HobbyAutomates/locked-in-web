"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up") {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return setMsg("Account created. Check your email to confirm, then sign in.");
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="min-h-full flex items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-sm flex flex-col gap-4">
        <div>
          <p className="label">Band Log</p>
          <h1 className="text-3xl font-extrabold">{mode === "in" ? "Sign in" : "Create account"}</h1>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {msg && <p className="text-sm text-warn">{msg}</p>}
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Working…" : mode === "in" ? "Sign in" : "Sign up"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
