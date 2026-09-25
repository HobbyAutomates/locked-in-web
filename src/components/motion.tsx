"use client";

import { useEffect, useRef } from "react";

/**
 * v2.12 motion helpers on top of lib/motion.css. The CSS does the work (it honours
 * prefers-reduced-motion by showing the final state); these just keep delays and count-ups tidy.
 */

/** Card stagger used by Progress / Profile: ~170 ms between cards. */
export const STAGGER = 170;

/** `style={md(600)}` → an animation delay, merged with any extra style. */
export function md(ms: number, extra?: React.CSSProperties): React.CSSProperties {
  return { animationDelay: `${Math.round(ms)}ms`, ...extra };
}

/** The visible fraction for an `.m-draw` stroke drawn with pathLength={1}. */
export function drawLen(fraction: number, delay: number, extra?: React.CSSProperties): React.CSSProperties {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return { ["--len" as string]: f, animationDelay: `${Math.round(delay)}ms`, ...extra } as React.CSSProperties;
}

/** A card that fades up out of a blur. */
export function MRise({ delay = 0, children, className = "", style, as: Tag = "div" }: { delay?: number; children: React.ReactNode; className?: string; style?: React.CSSProperties; as?: "div" | "section" }) {
  return (
    <Tag className={`m-rise ${className}`} style={md(delay, style)}>
      {children}
    </Tag>
  );
}

export function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * A number that counts up from 0 once, on mount (decimals too: 71.8 counts 0.0 → 71.8).
 * Server HTML carries the final value; the count writes straight to the DOM (no re-renders) and
 * starts after `delay` ms. Screen readers get the final value only.
 */
export function CountUp({ value, decimals = 0, delay = 0, duration = 1800, format }: { value: number; decimals?: number; delay?: number; duration?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmtRef = useRef(format);
  const done = useRef(false);
  const shown = format ? format(value) : value.toFixed(decimals);
  useEffect(() => {
    fmtRef.current = format;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmtN = (n: number) => (fmtRef.current ? fmtRef.current(n) : n.toFixed(decimals));
    // Only the first mount animates; later value changes just show the new number.
    if (done.current || reducedMotion() || !Number.isFinite(value)) {
      el.textContent = fmtN(value);
      return;
    }
    el.textContent = fmtN(0);
    let raf = 0;
    const start = performance.now() + delay;
    // expo-out, like cubic-bezier(.16,1,.3,1)
    const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const f = 10 ** decimals;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      el.textContent = fmtN(Math.round(value * ease(t) * f) / f);
      if (t < 1) raf = requestAnimationFrame(tick);
      else done.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = fmtN(value);
    };
  }, [value, decimals, delay, duration]);
  return (
    <>
      <span ref={ref} aria-hidden="true">
        {shown}
      </span>
      <span className="sr-only">{shown}</span>
    </>
  );
}
