"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { markTourSeen } from "@/lib/v216Actions";
import { TOUR_DONE_KEY, TOUR_REPLAY_KEY, TOUR_STEPS, tourShouldShow } from "@/lib/tour";

type Box = { x: number; y: number; w: number; h: number; r: number };

/** The union of every element tagged data-tour={key}, or null when none is on screen. */
function measure(key: string): Box | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)).filter((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed");
  const rects = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.left));
  const y0 = Math.min(...rects.map((r) => r.top));
  const x1 = Math.max(...rects.map((r) => r.right));
  const y1 = Math.max(...rects.map((r) => r.bottom));
  const pad = 3;
  const w = x1 - x0 + pad * 2;
  const h = y1 - y0 + pad * 2;
  const round = key === "fab";
  return { x: x0 - pad, y: y0 - pad, w, h, r: round ? Math.min(w, h) / 2 : key.startsWith("tab-") ? 20 : 24 };
}

function local(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * v2.16 first-run tour (boards TourF1–TourF5), over Home: a dim layer with a rounded spotlight on
 * each stop and a pulsing ember outline, plus a card ("n OF 5", title, text, dots, Skip tour, Next /
 * Let's go). Shown once: remembered on this device and, with schema_v40, on the account.
 * Preferences → "Replay the tour" sets a local flag that brings it back on the next Home visit.
 */
export default function GuidedTour({ serverSeen }: { serverSeen: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [vw, setVw] = useState(390);
  const [vh, setVh] = useState(844);

  useEffect(() => {
    const show = tourShouldShow({ done: local(TOUR_DONE_KEY) === "1", replay: local(TOUR_REPLAY_KEY) === "1", serverSeen });
    if (!show) return;
    // Let Home's entrance animations settle first.
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [serverSeen]);

  const cur = TOUR_STEPS[step];

  const place = useCallback(() => {
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    setBox(measure(cur.target));
  }, [cur.target]);

  // Bring an in-page target into view, then measure; keep measuring on scroll / resize / late content.
  useLayoutEffect(() => {
    if (!open) return;
    const first = document.querySelector<HTMLElement>(`[data-tour="${cur.target}"]`);
    if (first && !cur.target.startsWith("tab-") && cur.target !== "fab") {
      const r = first.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 280) first.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measuring the DOM (layout) for the spotlight
    place();
    const again = [120, 400, 900].map((ms) => setTimeout(place, ms));
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      again.forEach(clearTimeout);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [open, cur.target, place]);

  const finish = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(TOUR_DONE_KEY, "1");
      window.localStorage.removeItem(TOUR_REPLAY_KEY);
    } catch {
      // Not remembered on this device; the account flag (v40) still is.
    }
    void markTourSeen().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.dataset.tour = "on";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      delete document.body.dataset.tour;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, finish]);

  if (!open) return null;

  const last = step === TOUR_STEPS.length - 1;
  const cardW = Math.min(vw - 40, 440);
  const cardLeft = (vw - cardW) / 2;
  const below = box ? box.y + box.h + 16 + 200 < vh : false;
  const cardStyle: React.CSSProperties = box
    ? below
      ? { top: box.y + box.h + 16 }
      : { bottom: vh - box.y + 16 }
    : { top: Math.max(80, vh / 2 - 110) };
  const arrowX = box ? Math.max(18, Math.min(cardW - 32, box.x + box.w / 2 - cardLeft - 7)) : null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Tour, step ${step + 1} of ${TOUR_STEPS.length}: ${cur.title}`}>
      <svg width={vw} height={vh} className="absolute inset-0" aria-hidden="true">
        <defs>
          <mask id="tour-hole">
            <rect width={vw} height={vh} fill="#fff" />
            {box ? <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={box.r} fill="#000" style={{ transition: "all 380ms cubic-bezier(.16,1,.3,1)" }} /> : null}
          </mask>
        </defs>
        <rect width={vw} height={vh} fill="rgba(0,0,0,.78)" mask="url(#tour-hole)" />
        {box ? <rect x={box.x - 3} y={box.y - 3} width={box.w + 6} height={box.h + 6} rx={box.r + 3} fill="none" stroke="#FF5B1F" strokeWidth="2" className="m-pulse" style={{ transition: "all 380ms cubic-bezier(.16,1,.3,1)" }} /> : null}
      </svg>
      <div
        key={step}
        className="m-rise absolute rounded-[22px] p-[18px]"
        style={{ ...cardStyle, left: cardLeft, width: cardW, background: "#1b1b1e", color: "#f5f5f7", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08), 0 20px 50px rgba(0,0,0,.6)" }}
      >
        {arrowX != null ? (
          <span
            aria-hidden="true"
            className="absolute"
            style={{ left: arrowX, width: 14, height: 14, background: "#1b1b1e", transform: "rotate(45deg)", ...(below ? { top: -7, boxShadow: "-1px -1px 0 rgba(255,255,255,.08)" } : { bottom: -7, boxShadow: "1px 1px 0 rgba(255,255,255,.08)" }) }}
          />
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold" style={{ letterSpacing: "1.4px", color: "#FF8B5E" }}>
            {step + 1} OF {TOUR_STEPS.length}
          </span>
          <button type="button" className="press -my-2 min-h-11 px-1 text-[13px] font-medium" style={{ background: "none", border: 0, color: "#9a9aa1" }} onClick={finish}>
            Skip tour
          </button>
        </div>
        <p className="mt-1 text-[20px] font-extrabold" style={{ letterSpacing: "-.4px" }}>
          {cur.title}
        </p>
        <p className="mt-1.5 text-[14.5px] leading-[1.45]" style={{ color: "#c9c9ce" }}>
          {cur.text}
        </p>
        <div className="mt-3.5 flex items-center justify-between">
          <div className="flex gap-[5px]" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <span key={s.target} className="h-1.5 rounded-full" style={{ width: i === step ? 18 : 6, background: i === step ? "#FF5B1F" : "rgba(255,255,255,.25)", transition: "width 300ms" }} />
            ))}
          </div>
          <button
            type="button"
            autoFocus
            className="press inline-flex h-10 items-center rounded-full px-[18px] text-[14px] font-bold"
            style={{ background: "#FF5B1F", color: "#fff", border: 0 }}
            onClick={() => (last ? finish() : setStep((n) => n + 1))}
          >
            {last ? "Let’s go" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
