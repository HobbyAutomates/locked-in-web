"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { nameFromEmail } from "@/lib/display";
import { LineIcon, type LineName } from "@/components/lineIcons";
import { drawLen, md } from "@/components/motion";
import { BottomSheet, ErrorNote } from "@/components/ui";

type Screen = "start" | "in" | "up";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * v2.12 sign-in. Start = colourful preview cards over a soft gradient with a bottom sheet
 * (Continue with email · I have a squad invite). Email → the sign-in form. "New here?" → create
 * account, one question per screen: email → password → what your squad calls you → create.
 * The auth itself is unchanged from v2.11: Supabase email + password, the display name goes into
 * the signup metadata (the trigger copies it to profiles.name), the confirm-email message, and the
 * session cookie keeps you logged in. ?next=/join/<code> is honoured after signing in.
 */
export default function LoginPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("start");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(mode: "in" | "up") {
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
      if (!data.session) {
        setCreated(true);
        return setMsg("Account created. Confirm the email we sent, then sign in.");
      }
    }
    // v2.6: invite links send people here with ?next=/join/<code>; only same-site paths are followed.
    const next = new URLSearchParams(window.location.search).get("next") ?? "";
    router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  function go(s: Screen) {
    setMsg(null);
    setCreated(false);
    setScreen(s);
  }

  if (screen === "in")
    return (
      <SignIn
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        busy={busy}
        msg={msg}
        onBack={() => go("start")}
        onSubmit={() => void submit("in")}
        onCreate={() => go("up")}
      />
    );
  if (screen === "up")
    return (
      <CreateAccount
        email={email}
        password={password}
        name={name}
        setEmail={setEmail}
        setPassword={setPassword}
        setName={setName}
        busy={busy}
        msg={msg}
        created={created}
        onExit={() => go("start")}
        onSubmit={() => void submit("up")}
        onSignIn={() => go("in")}
      />
    );
  return <Start onEmail={() => go("in")} />;
}

// ---------------------------------------------------------------- start (Login B)

function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" style={{ flex: "none" }}>
      <rect width="56" height="56" rx="16" fill="var(--ember)" />
      <path d="M19 26v-5a9 9 0 0 1 18 0v5" fill="none" stroke="var(--card)" strokeWidth="4" strokeLinecap="round" />
      <rect x="14" y="25" width="28" height="20" rx="6" fill="var(--card)" />
      <path d="M28 29c3 3 4 5 4 7a4 4 0 0 1-8 0c0-1.5.7-2.5 1.5-3.2.2 1.2 1 1.9 1.7 1.9-.7-2-.2-4 .8-5.7z" fill="var(--ember)" />
    </svg>
  );
}

/** A decorative preview card, tilted, rising in and then drifting gently. */
function Float({ x, y, rot, delay, bg = "var(--card)", children }: { x: number; y: number; rot: number; delay: number; bg?: string; children: React.ReactNode }) {
  return (
    <div className="absolute" style={{ left: x, top: y, transform: `rotate(${rot}deg)` }}>
      <div className="m-rise" style={md(delay)}>
        <div className="m-float rounded-[20px] px-4 py-3.5" style={md(delay + 1200, { background: bg, boxShadow: "var(--shadow-lg)" })}>
          {children}
        </div>
      </div>
    </div>
  );
}

function MiniRing({ fraction, color, delay }: { fraction: number; color: string; delay: number }) {
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
      <circle cx="23" cy="23" r="18" fill="none" stroke="var(--track)" strokeWidth="6" />
      <circle cx="23" cy="23" r="18" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" pathLength={1} transform="rotate(-90 23 23)" className="m-draw" style={drawLen(fraction, delay)} />
    </svg>
  );
}

function Start({ onEmail }: { onEmail: () => void }) {
  const router = useRouter();
  const [invite, setInvite] = useState(false);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);

  function openInvite() {
    const raw = code.trim();
    const m = raw.match(/join\/([a-z0-9]{6})/i) ?? raw.replace(/[^a-z0-9]/gi, "").match(/^([a-z0-9]{6})$/i);
    if (!m) return setCodeErr("Paste the invite link, or type the 6-character code.");
    router.push(`/join/${m[1].toUpperCase()}`);
  }

  const av = (n: string, c: string) => (
    <span key={n} className="grid place-items-center rounded-full text-[13px] font-extrabold" style={{ width: 34, height: 34, background: c, color: "var(--card)", border: "2px solid var(--card)", marginLeft: -8 }}>
      {n}
    </span>
  );

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      <div
        className="relative flex flex-1 items-center justify-center"
        aria-hidden="true"
        style={{
          minHeight: 362,
          paddingTop: "env(safe-area-inset-top, 0px)",
          background: "radial-gradient(120% 90% at 20% 0%, var(--ember-bg), transparent 60%), radial-gradient(90% 80% at 100% 30%, var(--surf2), transparent 60%)",
        }}
      >
        <div className="relative w-[390px] max-w-full" style={{ height: 320 }}>
          <Float x={24} y={54} rot={-4} delay={140}>
            <div className="flex items-center gap-1.5">
              <LineIcon name="flame" size={26} stroke={2} style={{ color: "var(--orange)" }} />
              <span className="num text-[34px] font-extrabold" style={{ letterSpacing: "-1px", color: "var(--ink)" }}>
                19
              </span>
              <span className="text-[13px] font-semibold leading-tight muted">
                day
                <br />
                streak
              </span>
            </div>
          </Float>
          <Float x={196} y={40} rot={5} delay={260}>
            <div className="flex gap-2">
              <MiniRing fraction={0.84} color="var(--blue)" delay={900} />
              <MiniRing fraction={0.96} color="var(--orange)" delay={1060} />
              <MiniRing fraction={1} color="var(--purple)" delay={1220} />
            </div>
            <p className="mt-1.5 text-[12px] font-semibold muted">Protein · Carbs · Fat</p>
          </Float>
          <Float x={30} y={180} rot={3} delay={380}>
            <div className="flex items-center pl-2">
              {av("A", "var(--blue)")}
              {av("R", "var(--orange)")}
              {av("K", "var(--purple)")}
              {av("S", "var(--ember)")}
            </div>
            <p className="mt-2 text-[14px] font-bold" style={{ color: "var(--ink)" }}>
              Ayaan logged lunch
            </p>
            <p className="text-[12px] muted">+32 g protein · 2 min ago</p>
          </Float>
          <Float x={228} y={198} rot={-6} delay={500} bg="var(--ember)">
            <p className="text-[12px] font-semibold" style={{ color: "var(--card)", opacity: 0.8 }}>
              Today
            </p>
            <p className="num text-[30px] font-extrabold" style={{ color: "var(--card)", letterSpacing: "-1px", lineHeight: 1.15 }}>
              1,892
            </p>
            <p className="text-[12px] font-semibold" style={{ color: "var(--card)", opacity: 0.8 }}>
              of 2,200 kcal
            </p>
          </Float>
        </div>
      </div>

      <div className="m-rise flex flex-col gap-3 px-6 pt-7" style={md(380, { background: "var(--card)", borderRadius: "32px 32px 0 0", paddingBottom: "calc(34px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -8px 30px rgba(0,0,0,0.06)" })}>
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-[24px] font-extrabold" style={{ letterSpacing: "-.6px" }}>
              Locked In
            </h1>
            <p className="text-[14px] muted">Your food, training and squad in one place</p>
          </div>
        </div>
        <div className="h-2" />
        <Btn kind="primary" icon="mail" onClick={onEmail}>
          Continue with email
        </Btn>
        <Btn kind="ghost" icon="ticket" onClick={() => setInvite(true)}>
          I have a squad invite
        </Btn>
        <p className="mt-1.5 text-center text-[12px] leading-normal muted">One sign-in on this phone. You&apos;ll stay logged in.</p>
      </div>

      <BottomSheet open={invite} title="Join your squad" subtitle="Paste the invite link a friend sent you, or type its 6-character code. You'll sign in or create an account next." onClose={() => setInvite(false)} primary={{ label: "Open invite", onClick: openInvite, disabled: !code.trim() }}>
        <label className="flex flex-col gap-1.5 pb-1">
          <span className="text-[13px] font-semibold muted">Invite link or code</span>
          <input
            className="field"
            value={code}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://…/join/AB12CD"
            onChange={(e) => {
              setCode(e.target.value);
              setCodeErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.trim()) openInvite();
            }}
          />
          <ErrorNote text={codeErr} />
        </label>
      </BottomSheet>
    </main>
  );
}

function Btn({ kind, icon, children, onClick, type = "button", disabled }: { kind: "primary" | "ghost" | "accent"; icon?: LineName; children: React.ReactNode; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  const style: React.CSSProperties =
    kind === "primary"
      ? { background: "var(--btn)", color: "var(--btn-ink)", border: 0 }
      : kind === "accent"
        ? { background: "var(--ember)", color: "var(--ember-ink)", border: 0 }
        : { background: "transparent", color: "var(--ink)", border: "1.5px solid var(--hair)" };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="press flex h-[54px] w-full items-center justify-center gap-2.5 rounded-full text-[16px] font-bold" style={style}>
      {icon ? <LineIcon name={icon} size={18} stroke={2} /> : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- sign in

function Field({ id, icon, label, children, right }: { id: string; icon: LineName; label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold muted">
        {label}
      </label>
      <span className="flex h-[52px] items-center gap-2.5 rounded-[14px] pl-3.5 pr-1.5 focus-within:outline focus-within:outline-2" style={{ background: "var(--card2)", outlineColor: "var(--ink)" }}>
        <LineIcon name={icon} size={18} style={{ color: "var(--muted)" }} />
        {children}
        {right}
      </span>
    </div>
  );
}

function EyeButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} className="press grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }}>
      <LineIcon name={shown ? "eyeOff" : "eye"} size={18} />
    </button>
  );
}

/** The wrapper shows focus (ring / ember frame), so the bare input doesn't draw the global outline too. */
const NO_OUTLINE: React.CSSProperties = { outline: "none" };
const inputCls = "min-w-0 flex-1 bg-transparent text-[16px] outline-none";

function SignIn({
  email,
  password,
  setEmail,
  setPassword,
  busy,
  msg,
  onBack,
  onSubmit,
  onCreate,
}: {
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  busy: boolean;
  msg: string | null;
  onBack: () => void;
  onSubmit: () => void;
  onCreate: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-6" style={{ paddingTop: "calc(18px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="m-rise" style={md(0)}>
        <BackButton onClick={onBack} />
      </div>
      <form
        className="flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="m-rise flex flex-col gap-3 pt-7" style={md(90)}>
          <Logo size={52} />
          <h1 className="text-[34px] font-extrabold" style={{ letterSpacing: "-1px", lineHeight: 1.1 }}>
            Welcome back
          </h1>
          <p className="text-[16px] muted">Log food, train, and keep your squad honest.</p>
        </div>
        <div className="m-rise flex flex-col gap-3.5 pt-7" style={md(180)}>
          <Field id="email" icon="mail" label="Email">
            <input id="email" className={inputCls} style={NO_OUTLINE} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field id="password" icon="lock" label="Password" right={<EyeButton shown={show} onToggle={() => setShow((v) => !v)} />}>
            <input id="password" className={inputCls} style={NO_OUTLINE} type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </Field>
          <ErrorNote text={msg} />
        </div>
        <div className="m-rise mt-auto flex flex-col gap-3 pt-8" style={md(270)}>
          <Btn kind="primary" type="submit" disabled={busy || !email || password.length < 6}>
            {busy ? "Signing in…" : "Sign in"}
          </Btn>
          <p className="text-center text-[14px] muted">
            New here?{" "}
            <button type="button" className="press font-bold" style={{ background: "none", border: 0, padding: "10px 2px", color: "var(--ink)" }} onClick={onCreate}>
              Create account
            </button>
          </p>
          <p className="text-center text-[12px] muted">One sign-in on this phone. You&apos;ll stay logged in.</p>
        </div>
      </form>
    </main>
  );
}

function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="press grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }}>
      <LineIcon name="back" size={18} stroke={2} />
    </button>
  );
}

// ---------------------------------------------------------------- create account (Login C)

function CreateAccount({
  email,
  password,
  name,
  setEmail,
  setPassword,
  setName,
  busy,
  msg,
  created,
  onExit,
  onSubmit,
  onSignIn,
}: {
  email: string;
  password: string;
  name: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  setName: (v: string) => void;
  busy: boolean;
  msg: string | null;
  created: boolean;
  onExit: () => void;
  onSubmit: () => void;
  onSignIn: () => void;
}) {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);
  const fallback = nameFromEmail(email);
  const shown = name.trim() || fallback || "You";
  const ok = step === 0 ? EMAIL_OK.test(email.trim()) : step === 1 ? password.length >= 6 : true;

  const steps = [
    { title: "What's your email?", sub: "You'll sign in with it. It never shows on the feed." },
    { title: "Pick a password", sub: "At least 6 characters. You'll stay logged in on this phone." },
    { title: "What does your squad call you?", sub: "This shows on the feed, chats and challenges." },
    { title: created ? "Check your inbox" : "Ready when you are", sub: created ? `We sent a link to ${email.trim()}.` : "One tap and you're in." },
  ];

  function next() {
    if (!ok) return;
    if (step < 3) setStep(step + 1);
    else onSubmit();
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-6" style={{ paddingTop: "calc(18px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="m-rise flex items-center gap-3.5" style={md(0)}>
        <BackButton label={step === 0 ? "Back to start" : "Previous question"} onClick={() => (step === 0 ? onExit() : setStep(step - 1))} />
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-label="Create account" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-[5px] flex-1 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
              <span className="block h-full rounded-full" style={{ background: "var(--ember)", width: i <= step ? "100%" : "0%", transition: "width 600ms cubic-bezier(.16,1,.3,1)" }} />
            </span>
          ))}
        </div>
        <span className="num text-[13px] font-semibold muted">{step + 1} of 4</span>
      </div>

      <form
        className="flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <div key={step} className="m-step flex flex-col">
          <div className="flex flex-col gap-2.5 pt-[30px]">
            <span className="text-[14px] font-bold" style={{ color: "var(--ember)" }}>
              Create account
            </span>
            <h1 className="text-[34px] font-extrabold" style={{ letterSpacing: "-1px", lineHeight: 1.1 }}>
              {steps[step].title}
            </h1>
            <p className="text-[16px] muted">{steps[step].sub}</p>
          </div>

          <div className="pt-[30px]">
            {step === 0 ? (
              <BigInput>
                <input autoFocus aria-label="Email" className={bigCls} style={NO_OUTLINE} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </BigInput>
            ) : step === 1 ? (
              <BigInput right={<EyeButton shown={show} onToggle={() => setShow((v) => !v)} />}>
                <input autoFocus aria-label="Password" className={bigCls} style={NO_OUTLINE} type={show ? "text" : "password"} autoComplete="new-password" minLength={6} placeholder="6+ characters" value={password} onChange={(e) => setPassword(e.target.value)} />
              </BigInput>
            ) : step === 2 ? (
              <>
                <BigInput>
                  <input autoFocus aria-label="What your squad calls you" className={bigCls} style={NO_OUTLINE} type="text" autoComplete="nickname" maxLength={40} placeholder={fallback || "Your name"} value={name} onChange={(e) => setName(e.target.value)} />
                </BigInput>
                {fallback && !name.trim() ? (
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    <button type="button" className="press rounded-full px-3.5 py-2.5 text-[14px] font-bold" style={{ background: "var(--ember)", color: "var(--ember-ink)", border: 0 }} onClick={() => setName(fallback)}>
                      {fallback}
                    </button>
                  </div>
                ) : null}
                <div className="mt-6 flex items-center gap-3 rounded-[18px] px-4 py-3.5" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }} aria-label="Preview of your posts">
                  <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full font-extrabold" style={{ background: "var(--orange)", color: "var(--card)" }}>
                    {shown.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">
                      {shown} <span className="font-medium muted">logged breakfast</span>
                    </p>
                    <p className="text-[13px] muted">How your posts will look</p>
                  </div>
                  <LineIcon name="flame" size={20} stroke={2} style={{ color: "var(--orange)" }} />
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3 rounded-[18px] p-4" style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
                <Summary icon="mail" label="Email" value={email.trim()} />
                <Summary icon="user" label="Your squad sees" value={shown} />
                {created ? (
                  <p className="text-[13px] leading-5 muted">Tap the link in that email, then come back and sign in with your password.</p>
                ) : null}
              </div>
            )}
            {msg ? (
              <div className="mt-3.5">
                <ErrorNote text={msg} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-8">
          {created ? (
            <Btn kind="accent" onClick={onSignIn}>
              Sign in
            </Btn>
          ) : (
            <Btn kind="accent" type="submit" disabled={busy || !ok}>
              {step < 3 ? "Continue" : busy ? "Creating…" : "Create account"}
            </Btn>
          )}
          <p className="text-center text-[14px] muted" hidden={created}>
            Have an account?{" "}
            <button type="button" className="press font-bold" style={{ background: "none", border: 0, padding: "10px 2px", color: "var(--ink)" }} onClick={onSignIn}>
              Sign in
            </button>
          </p>
        </div>
      </form>
    </main>
  );
}

const bigCls = "min-w-0 flex-1 bg-transparent text-[22px] font-bold outline-none";

function BigInput({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex h-16 items-center rounded-[18px] pl-[18px] pr-2" style={{ background: "var(--card2)", boxShadow: "inset 0 0 0 2px var(--ember)" }}>
      {children}
      {right}
    </div>
  );
}

function Summary({ icon, label, value }: { icon: LineName; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <LineIcon name={icon} size={18} style={{ color: "var(--muted)" }} />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold muted">{label}</p>
        <p className="truncate text-[15px] font-semibold">{value || "—"}</p>
      </div>
    </div>
  );
}
