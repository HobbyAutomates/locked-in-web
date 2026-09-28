"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoachMessage } from "@/lib/coach";
import { isStopPhrase, pickVoiceName, speakable } from "@/lib/v218/voice";
import { CoachAvatar } from "@/components/onboarding/kit";
import { MicGlyph } from "./CoachDaily";

/**
 * v2.18 B1 voice coach: hands-free. Listen → send to the same coach chat (memory, tools, style) with
 * `voice: true` so the reply is short and speakable → read it out (Web Speech synthesis) → listen
 * again. "Stop", "bas" or "bye" ends it; tapping the orb interrupts. English or Hindi (en-IN /
 * hi-IN) for both hearing and speaking. Everything said lands in the normal chat history.
 */

type Phase = "idle" | "listening" | "thinking" | "speaking";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recCtor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const LANG_KEY = "lockedin-voice-lang";

export default function VoiceCoach({ onClose, onExchange }: { onClose: () => void; onExchange: (user: CoachMessage, reply: CoachMessage) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang] = useState<"en-IN" | "hi-IN">(() => {
    try {
      return window.localStorage.getItem(LANG_KEY) === "hi-IN" ? "hi-IN" : "en-IN";
    } catch {
      return "en-IN";
    }
  });
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const alive = useRef(true);
  const langRef = useRef(lang);
  const listenRef = useRef<() => void>(() => {});
  const supported = recCtor() !== null;
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const stopAll = useCallback(() => {
    try {
      rec.current?.abort();
    } catch {
      // not running
    }
    rec.current = null;
    if (canSpeak) window.speechSynthesis.cancel();
  }, [canSpeak]);

  const speak = useCallback(
    (text: string) => {
      const say = speakable(text);
      if (!canSpeak || !say) {
        listenRef.current();
        return;
      }
      setPhase("speaking");
      const u = new SpeechSynthesisUtterance(say);
      u.lang = langRef.current;
      const name = pickVoiceName(window.speechSynthesis.getVoices(), langRef.current);
      const v = window.speechSynthesis.getVoices().find((x) => x.name === name);
      if (v) u.voice = v;
      u.rate = 1.02;
      u.onend = () => alive.current && listenRef.current();
      u.onerror = () => alive.current && listenRef.current();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [canSpeak],
  );

  const send = useCallback(
    async (text: string) => {
      setPhase("thinking");
      setErr(null);
      try {
        const res = await fetch("/api/coach/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, voice: true }) });
        const out = (await res.json().catch(() => ({}))) as { user?: CoachMessage; reply?: CoachMessage; error?: string };
        if (!res.ok || !out.reply || !out.user) throw new Error(out.error ?? "The coach couldn't answer.");
        if (!alive.current) return;
        onExchange(out.user, out.reply);
        setReply(out.reply.text);
        speak(out.reply.text);
      } catch (e) {
        if (!alive.current) return;
        setErr(e instanceof Error ? e.message : "The coach couldn't answer.");
        setPhase("idle");
      }
    },
    [onExchange, speak],
  );

  const listen = useCallback(() => {
    const C = recCtor();
    if (!C || !alive.current) return;
    stopAll();
    const r = new C();
    r.lang = langRef.current;
    r.continuous = false;
    r.interimResults = true;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += `${res[0]?.transcript ?? ""} `;
        else interim += res[0]?.transcript ?? "";
      }
      setHeard((finalText + interim).trim());
    };
    r.onerror = (e) => {
      const code = e.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed") setErr("Microphone access is blocked. Allow it in the browser's site settings.");
      else if (code !== "aborted" && code !== "no-speech") setErr("Didn't catch that. Tap the mic to try again.");
    };
    r.onend = () => {
      if (!alive.current || rec.current !== r) return;
      rec.current = null;
      const t = finalText.trim();
      if (!t) return setPhase("idle");
      if (isStopPhrase(t)) return onClose();
      void send(t);
    };
    rec.current = r;
    setHeard("");
    setPhase("listening");
    try {
      r.start();
    } catch {
      setPhase("idle");
    }
  }, [onClose, send, stopAll]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  useEffect(() => {
    alive.current = true;
    // iOS only lets speech play after a tap: an empty utterance now (inside the opening tap) unlocks it.
    if (canSpeak) {
      try {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      } catch {
        // fine
      }
    }
    const t = window.setTimeout(() => listenRef.current(), 250);
    return () => {
      alive.current = false;
      window.clearTimeout(t);
      stopAll();
    };
  }, [canSpeak, stopAll]);

  const orb = () => {
    if (phase === "listening") {
      try {
        rec.current?.stop();
      } catch {
        // already stopped
      }
    } else if (phase !== "thinking") listen();
  };

  const status = phase === "listening" ? (lang === "hi-IN" ? "सुन रहा हूँ…" : "Listening…") : phase === "thinking" ? "Thinking…" : phase === "speaking" ? "Speaking · tap to interrupt" : "Tap the mic and ask";

  return (
    <div role="dialog" aria-modal="true" aria-label="Voice coach" className="fixed inset-0 z-50 flex flex-col items-center" style={{ background: "color-mix(in srgb, #0d0c0b 94%, transparent)", color: "#f4efe6", padding: "calc(16px + env(safe-area-inset-top, 0px)) 20px calc(24px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="flex w-full max-w-[440px] items-center justify-between">
        <span className="flex items-center gap-2.5">
          <CoachAvatar size={32} />
          <span className="text-[15px] font-semibold">Voice coach</span>
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            className="press h-9 rounded-full px-3 text-[13px] font-semibold"
            style={{ background: "rgba(255,255,255,0.1)", color: "#f4efe6", border: 0 }}
            aria-label={`Language: ${lang === "hi-IN" ? "Hindi" : "English"}. Tap to switch.`}
            onClick={() => {
              const next = lang === "en-IN" ? "hi-IN" : "en-IN";
              setLang(next);
              try {
                window.localStorage.setItem(LANG_KEY, next);
              } catch {
                // per-device nicety only
              }
            }}
          >
            {lang === "hi-IN" ? "हिंदी" : "EN"}
          </button>
          <button type="button" className="press h-9 rounded-full px-3.5 text-[13px] font-semibold" style={{ background: "#f4efe6", color: "#0d0c0b", border: 0 }} onClick={onClose}>
            Done
          </button>
        </span>
      </div>

      <div className="flex w-full max-w-[440px] flex-1 flex-col items-center justify-center gap-6 text-center">
        {!supported ? (
          <p className="text-[15px] leading-[22px]" style={{ opacity: 0.85 }}>
            Voice isn&apos;t available in this browser. Try Chrome on Android or Safari on iPhone, or type in the chat.
          </p>
        ) : (
          <>
            <button
              type="button"
              aria-label={phase === "listening" ? "Stop listening" : "Speak"}
              className="press grid place-items-center rounded-full"
              style={{
                width: 132,
                height: 132,
                border: 0,
                color: "#0d0c0b",
                background: phase === "listening" ? "var(--ember)" : phase === "speaking" ? "var(--iris)" : "#f4efe6",
                boxShadow: phase === "listening" ? "0 0 0 14px color-mix(in srgb, var(--ember) 22%, transparent), 0 0 0 30px color-mix(in srgb, var(--ember) 10%, transparent)" : phase === "speaking" ? "0 0 0 14px color-mix(in srgb, var(--iris) 25%, transparent)" : "none",
                transition: "box-shadow 300ms ease, background 300ms ease",
              }}
              onClick={orb}
            >
              {phase === "thinking" ? <span className="m-glow block h-4 w-4 rounded-full" style={{ background: "#0d0c0b" }} /> : <MicGlyph size={44} />}
            </button>
            <p className="text-[13px] font-semibold uppercase" style={{ letterSpacing: ".08em", opacity: 0.7 }} aria-live="polite">
              {status}
            </p>
            {heard ? <p className="text-[17px] leading-[24px]" style={{ opacity: 0.9 }}>“{heard}”</p> : null}
            {reply && phase !== "listening" ? (
              <p className="rounded-2xl px-4 py-3 text-[15px] leading-[22px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                {reply}
              </p>
            ) : null}
            {err ? (
              <p role="alert" className="text-[13px]" style={{ color: "var(--ember-2, #ffb27a)" }}>
                {err}
              </p>
            ) : null}
          </>
        )}
      </div>
      <p className="max-w-[440px] text-center text-[12px] leading-[17px]" style={{ opacity: 0.55 }}>
        Try “how much protein is left?”, “log 2 roti and dal” or “took my creatine”. Say “stop” to finish.
      </p>
    </div>
  );
}
