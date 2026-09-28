"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDictation } from "@/lib/speech";
import { Mic } from "../icons";

/**
 * v2.18 A1: hold-to-talk on top of the existing dictation (Web Speech, en-IN / hi-IN, so English,
 * Hindi and Hinglish all work). Press and hold to talk, let go to stop; a quick tap toggles instead
 * (hands-free), and Enter / Space toggle for keyboards. Every final phrase is appended to `value`.
 *
 * `useVoiceNote` owns the text so the Scan screen can wait for the last words (`settle`) when the
 * photo is taken while the mic is still open.
 */
export function useVoiceNote() {
  const [value, setState] = useState("");
  // Mirrors `value` so a caller can read the latest words right after `settle()` (no stale closure).
  const latest = useRef("");
  const setValue = useCallback((v: string) => {
    latest.current = v;
    setState(v);
  }, []);
  const settleWaiters = useRef<(() => void)[]>([]);
  const dictation = useDictation((chunk) => setValue((latest.current ? `${latest.current}, ${chunk}` : chunk).slice(0, 400)));
  const listening = dictation.listening;
  useEffect(() => {
    if (listening) return;
    const w = settleWaiters.current;
    settleWaiters.current = [];
    w.forEach((f) => f());
  }, [listening]);
  /** Stop listening (if we are) and wait for the recogniser's last result, at most 1.5 s. */
  const settle = useCallback(async () => {
    if (!dictation.listening) return;
    dictation.stop();
    await new Promise<void>((resolve) => {
      settleWaiters.current.push(resolve);
      setTimeout(resolve, 1500);
    });
    // One more tick for a result that lands right after `onend`.
    await new Promise((r) => setTimeout(r, 150));
  }, [dictation]);
  const current = useCallback(() => latest.current, []);
  const clear = useCallback(() => setValue(""), [setValue]);
  return { value, setValue, clear, settle, current, dictation };
}

type Dictation = ReturnType<typeof useDictation>;

const HOLD_MS = 350;

/** The round mic: hold to talk, tap to toggle. `tone` "dark" sits on the camera; "light" on a card. */
export function HoldMic({ dictation, label = "Hold to add details", tone = "light", size = 44 }: { dictation: Dictation; label?: string; tone?: "light" | "dark"; size?: number }) {
  const downAt = useRef(0);
  const on = dictation.listening;
  const bg = on ? "var(--danger)" : tone === "dark" ? "rgba(28, 28, 30, 0.72)" : "var(--card2)";
  const fg = on ? "#fff" : tone === "dark" ? "#f5f5f7" : "var(--ink)";
  if (!dictation.supported) return null;
  return (
    <button
      type="button"
      aria-label={on ? "Listening. Let go or tap to stop" : label}
      aria-pressed={on}
      className="press grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: bg, color: fg, border: 0, touchAction: "none", backdropFilter: tone === "dark" ? "blur(12px)" : undefined, boxShadow: on ? "0 0 0 6px color-mix(in srgb, var(--danger) 22%, transparent)" : undefined, transition: "box-shadow .2s, background .2s" }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        downAt.current = Date.now();
        if (!dictation.listening) dictation.toggle();
      }}
      onPointerUp={() => {
        // A long press is push-to-talk (release stops); a quick tap leaves it listening until the next tap.
        const held = Date.now() - downAt.current;
        if (downAt.current && held >= HOLD_MS && dictation.listening) dictation.stop();
        else if (downAt.current && held < HOLD_MS && on) dictation.stop();
        downAt.current = 0;
      }}
      onPointerCancel={() => {
        downAt.current = 0;
        if (dictation.listening) dictation.stop();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          dictation.toggle();
        }
      }}
    >
      <Mic size={Math.round(size * 0.42)} className={on ? "flame-breathe" : undefined} />
    </button>
  );
}

/** EN / हिं switch for the recogniser (Hinglish works in EN; हिं writes Devanagari). */
export function LangToggle({ dictation, tone = "light" }: { dictation: Dictation; tone?: "light" | "dark" }) {
  if (!dictation.supported) return null;
  return (
    <button type="button" onClick={dictation.toggleLang} className="hit press shrink-0 px-1 text-[12px] font-bold" style={{ background: "none", border: 0, color: tone === "dark" ? "#f5f5f7" : "var(--muted)" }} aria-label={`Voice language: ${dictation.lang === "hi-IN" ? "Hindi" : "English and Hinglish"}. Tap to switch.`}>
      {dictation.lang === "hi-IN" ? "हिं" : "EN"}
    </button>
  );
}

/**
 * The row above the shutter in Scan food mode: EN / हिं, the mic, and what was heard (✕ clears it).
 * Say it before or while shooting: "2 roti, less oil, extra dal".
 */
export function CameraVoiceRow({ voice }: { voice: ReturnType<typeof useVoiceNote> }) {
  const { dictation, value } = voice;
  if (!dictation.supported) return null;
  const text = dictation.listening ? value || "Listening…" : value;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 10px" }}>
      <LangToggle dictation={dictation} tone="dark" />
      <HoldMic dictation={dictation} tone="dark" label="Hold to say what's on the plate" size={42} />
      <div
        role="status"
        aria-live="polite"
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 6px 0 12px", borderRadius: 999, background: "rgba(28, 28, 30, 0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", color: "#f5f5f7", fontSize: 13, fontWeight: 600 }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: text ? 1 : 0.75 }}>{text ? `“${text}”` : "Hold the mic: “2 roti, less oil”"}</span>
        {value && !dictation.listening ? (
          <button type="button" aria-label="Clear what you said" onClick={voice.clear} style={{ border: 0, background: "none", color: "#f5f5f7", width: 28, height: 28, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
