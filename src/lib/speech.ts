"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Built-in dictation via the Web Speech API (Chrome on Android, Safari on iOS 14.5+). Results are
 * appended to whatever the caller keeps in its text box. `supported` is false where the browser has
 * no recogniser, so the UI can say so instead of showing a dead mic.
 */
export type SpeechLang = "en-IN" | "hi-IN";

type Recognizer = {
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

function ctor(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

export function useDictation(onText: (finalText: string) => void) {
  // Renders as unsupported on the server, then settles on the client without a setState-in-effect.
  const supported = useSyncExternalStore(noop, () => ctor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<SpeechLang>("en-IN");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognizer | null>(null);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  });

  const stop = useCallback(() => {
    try {
      rec.current?.stop();
    } catch {
      // already stopped
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) {
      setError("Voice input isn't available in this browser — use your keyboard's mic instead.");
      return;
    }
    try {
      const r = new C();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = false;
      r.onresult = (e) => {
        let out = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) out += (res[0]?.transcript ?? "") + " ";
        }
        if (out.trim()) cb.current(out.trim());
      };
      r.onerror = (e) => {
        const code = e.error ?? "";
        if (code === "not-allowed" || code === "service-not-allowed") setError("Microphone access was blocked. Allow it in the browser's site settings and try again.");
        else if (code !== "aborted" && code !== "no-speech") setError("Voice input stopped — try again.");
        setListening(false);
      };
      r.onend = () => setListening(false);
      rec.current = r;
      setError(null);
      r.start();
      setListening(true);
    } catch {
      setError("Voice input isn't available in this browser — use your keyboard's mic instead.");
      setListening(false);
    }
  }, [lang]);

  useEffect(() => () => void rec.current?.abort?.(), []);

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);
  const toggleLang = useCallback(() => {
    stop();
    setLang((l) => (l === "en-IN" ? "hi-IN" : "en-IN"));
  }, [stop]);

  return { supported, listening, lang, error, toggle, toggleLang, stop };
}
