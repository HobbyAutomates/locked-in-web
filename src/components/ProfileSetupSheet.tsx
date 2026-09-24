"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkUsername, saveUsername } from "@/lib/actions";
import { AVATAR_GRADIENTS, initialsOf, renderAvatarPreset } from "@/lib/avatarPresets";
import { squareAvatar } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import { Check, Close, Spinner } from "./icons";
import { BottomSheet, ErrorNote } from "./ui";

type Step = "username" | "photo" | "confirm";
type Pick = { kind: "preset"; index: number } | { kind: "file"; file: File; preview: string } | { kind: "keep" };

/**
 * v2.6 (Cal AI groups onboarding): "Create a username" with a live availability tick, then
 * "Add a profile photo" — swipe through 8 gradient-initials presets or upload one — then
 * "Confirm your photo" → Create Profile. `photo={false}` edits just the username.
 */
export default function ProfileSetupSheet({
  open,
  onClose,
  userId,
  name,
  username,
  avatarPath,
  photo = true,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  name: string;
  username: string | null;
  avatarPath: string | null;
  photo?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("username");
  const [handle, setHandle] = useState(username ?? "");
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">(username ? "ok" : "idle");
  const [pick, setPick] = useState<Pick>(avatarPath ? { kind: "keep" } : { kind: "preset", index: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initials = initialsOf(name || handle || "?");
  const fileRef = useRef<HTMLInputElement>(null);

  // Availability check, 350 ms after typing stops.
  useEffect(() => {
    const clean = handle.trim().toLowerCase();
    if (!clean) return;
    let live = true;
    const t = setTimeout(async () => {
      if (!/^[a-z0-9_]{3,20}$/.test(clean)) return live && setStatus("invalid");
      if (clean === username) return live && setStatus("ok");
      setStatus("checking");
      try {
        const ok = await checkUsername(clean);
        if (live) setStatus(ok ? "ok" : "taken");
      } catch {
        if (live) setStatus("idle");
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [handle, username]);

  function close() {
    setStep("username");
    setError(null);
    onClose();
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const clean = handle.trim().toLowerCase();
      if (clean !== username) {
        const res = await saveUsername(clean);
        if (!res.ok) {
          setStep("username");
          throw new Error(res.error);
        }
      }
      if (photo && pick.kind !== "keep") {
        const blob = pick.kind === "preset" ? await renderAvatarPreset(pick.index, initials) : await squareAvatar(pick.file, 512, 0.85);
        const supabase = createClient();
        const key = `${userId}/avatar.jpg`;
        const up = await supabase.storage.from("avatars").upload(key, blob, { upsert: true, contentType: "image/jpeg" });
        if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
        const { error: e2 } = await supabase.from("profiles").update({ avatar_path: `${key}?v=${Date.now()}` }).eq("id", userId);
        if (e2) throw new Error(`Couldn't save your photo: ${e2.message}`);
      }
      router.refresh();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  const usernameOk = status === "ok";
  const title = step === "username" ? "Create a username" : step === "photo" ? "Add a profile photo" : "Confirm your photo";
  const subtitle = step === "username" ? "This helps others find you in squads." : step === "photo" ? "Your profile photo helps others recognise you in squads." : "This will be your profile picture.";
  const primary =
    step === "username"
      ? { label: photo ? "Next" : busy ? "Saving…" : "Save", onClick: () => (photo ? setStep("photo") : void finish()), disabled: !usernameOk || busy }
      : step === "photo"
        ? { label: "Next", onClick: () => setStep("confirm"), disabled: false }
        : { label: busy ? "Creating…" : "Create Profile", onClick: () => void finish(), disabled: busy };

  return (
    <BottomSheet open={open} title={title} subtitle={subtitle} onClose={close} primary={primary}>
      {step === "username" ? (
        <div className="pb-1">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-bold muted">@</span>
            <input
              className="field pl-9 pr-11"
              value={handle}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
              placeholder="username"
              aria-label="Username"
              onChange={(e) => {
                const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
                setHandle(v);
                if (!v) setStatus("idle");
              }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: status === "ok" ? "var(--green)" : status === "taken" || status === "invalid" ? "var(--red)" : "var(--muted)" }}>
              {status === "checking" ? <Spinner size={16} /> : status === "ok" ? <Check size={18} /> : status === "taken" || status === "invalid" ? <Close size={16} /> : null}
            </span>
          </div>
          <p className="mt-1.5 px-1 text-[12px]" style={{ color: status === "taken" || status === "invalid" ? "var(--red)" : status === "ok" ? "var(--green)" : "var(--muted)" }}>
            {status === "ok" ? "Username is available" : status === "taken" ? "That one's taken — try another" : status === "invalid" ? "3–20 characters: letters, numbers and _" : "Letters, numbers and _ only"}
          </p>
        </div>
      ) : step === "photo" ? (
        <div className="flex flex-col items-center pb-1">
          <PresetCarousel initials={initials} index={pick.kind === "preset" ? pick.index : -1} onPick={(index) => setPick({ kind: "preset", index })} />
          <p className="mt-1 text-[12px] muted">Swipe to select</p>
          <div className="my-3 flex w-full items-center gap-3 text-[12px] muted">
            <span className="h-px flex-1" style={{ background: "var(--hair)" }} />
            OR
            <span className="h-px flex-1" style={{ background: "var(--hair)" }} />
          </div>
          <button type="button" className="pill pill-soft press w-full" style={{ minHeight: 48 }} onClick={() => fileRef.current?.click()}>
            Upload a photo
          </button>
          {avatarPath ? (
            <button type="button" className="hit press mt-2 py-1 text-[13px] font-semibold muted" onClick={() => setPick({ kind: "keep" })} style={{ color: pick.kind === "keep" ? "var(--ink)" : undefined }}>
              {pick.kind === "keep" ? "✓ Keeping my current photo" : "Keep my current photo"}
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setPick({ kind: "file", file: f, preview: URL.createObjectURL(f) });
              setStep("confirm");
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center pb-1">
          <div className="grid place-items-center overflow-hidden rounded-full" style={{ width: 170, height: 170 }}>
            {pick.kind === "preset" ? (
              <PresetDisc index={pick.index} initials={initials} size={170} />
            ) : pick.kind === "file" ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={pick.preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <Avatar path={avatarPath} name={name} size={170} />
            )}
          </div>
          <button type="button" className="press mt-4 rounded-full px-4 py-2 text-[13px] font-semibold" style={{ background: "var(--card2)", color: "var(--red)", border: 0 }} onClick={() => setStep("photo")}>
            Choose different photo
          </button>
        </div>
      )}
      {error ? (
        <div className="mt-2">
          <ErrorNote text={error} />
        </div>
      ) : null}
    </BottomSheet>
  );
}

function PresetDisc({ index, initials, size }: { index: number; initials: string; size: number }) {
  const [a, b] = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-extrabold text-white" style={{ width: size, height: size, background: `linear-gradient(135deg, ${a}, ${b})`, fontSize: Math.round(size * (initials.length > 1 ? 0.36 : 0.44)), letterSpacing: "-0.02em" }}>
      {initials}
    </span>
  );
}

/** Horizontal scroll-snap row of the 8 presets; the centred one is selected, with dots below. */
function PresetCarousel({ initials, index, onPick }: { initials: string; index: number; onPick: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const ITEM = 150;
  const GAP = 16;
  const current = index < 0 ? 0 : index;
  useEffect(() => {
    ref.current?.scrollTo({ left: current * (ITEM + GAP) });
    // Only on mount: afterwards the user's swipe drives the index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div
        ref={ref}
        className="flex w-full snap-x snap-mandatory overflow-x-auto py-2"
        style={{ scrollbarWidth: "none", gap: GAP, paddingLeft: `calc(50% - ${ITEM / 2}px)`, paddingRight: `calc(50% - ${ITEM / 2}px)` }}
        onScroll={(e) => {
          const i = Math.round(e.currentTarget.scrollLeft / (ITEM + GAP));
          const clamped = Math.max(0, Math.min(AVATAR_GRADIENTS.length - 1, i));
          if (clamped !== index) onPick(clamped);
        }}
      >
        {AVATAR_GRADIENTS.map((_, i) => (
          <button
            key={i}
            type="button"
            className="shrink-0 snap-center rounded-full"
            style={{ width: ITEM, height: ITEM, padding: 0, border: 0, background: "none", transform: i === index ? "scale(1)" : "scale(0.82)", opacity: i === index ? 1 : 0.6, transition: "transform .2s, opacity .2s" }}
            aria-label={`Photo style ${i + 1}`}
            aria-pressed={i === index}
            onClick={() => {
              onPick(i);
              ref.current?.scrollTo({ left: i * (ITEM + GAP), behavior: "smooth" });
            }}
          >
            <PresetDisc index={i} initials={initials} size={ITEM} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden="true">
        {AVATAR_GRADIENTS.map((_, i) => (
          <span key={i} className="rounded-full" style={{ width: 6, height: 6, background: i === index ? "var(--ink)" : "var(--hair)" }} />
        ))}
      </div>
    </>
  );
}
