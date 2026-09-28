"use client";

/**
 * v2.18 D1 Wrapped story cards: 1080 x 1920 PNGs drawn on a canvas in brand v1 (ink / bone / ember,
 * Bricolage display numbers, a Fraunces italic line, Geist mono eyebrow), shared as files through
 * the Web Share API (Instagram Stories on phones) or downloaded.
 */
import type { Slide } from "./wrapped";

const W = 1080;
const H = 1920;

export const TONES: Record<Slide["tone"], { bg: string; ink: string; soft: string; accent: string }> = {
  ember: { bg: "#FF5B1F", ink: "#0B0B0C", soft: "rgba(11,11,12,0.62)", accent: "#F4F1EA" },
  ink: { bg: "#0B0B0C", ink: "#F4F1EA", soft: "rgba(244,241,234,0.62)", accent: "#FF5B1F" },
  bone: { bg: "#F4F1EA", ink: "#0B0B0C", soft: "rgba(11,11,12,0.6)", accent: "#FF5B1F" },
};

function familyOf(className: string, fallback: string): string {
  try {
    const el = document.createElement("span");
    el.className = className;
    el.style.position = "absolute";
    el.style.visibility = "hidden";
    document.body.appendChild(el);
    const f = getComputedStyle(el).fontFamily;
    el.remove();
    return f || fallback;
  } catch {
    return fallback;
  }
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, weight: string, family: string, min = 60): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > max) {
    s -= 6;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

/** Word-wraps `text` into at most `lines` lines of `max` px (the last one ellipsized). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (!cur || ctx.measureText(next).width <= max) {
      cur = next;
      continue;
    }
    out.push(cur);
    cur = words[i];
    if (out.length === lines - 1) {
      cur = words.slice(i).join(" ");
      break;
    }
  }
  if (cur) out.push(cur);
  let last = out[out.length - 1] ?? "";
  if (ctx.measureText(last).width > max) {
    while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    out[out.length - 1] = `${last.trimEnd()}…`;
  }
  return out;
}

export async function renderSlide(slide: Slide, period: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available");
  try {
    await document.fonts?.ready;
  } catch {
    // Fonts load late: the fallbacks still read fine.
  }
  const base = familyOf("", "system-ui, sans-serif");
  const display = familyOf("display", base);
  const serif = familyOf("serif", "Georgia, serif");
  const mono = familyOf("mono", "ui-monospace, monospace");
  const c = TONES[slide.tone];

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  // A soft glow and a fine grain so flat colour doesn't look cheap.
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.18, 20, W * 0.8, H * 0.18, 1100);
  glow.addColorStop(0, slide.tone === "ink" ? "rgba(255,91,31,0.22)" : "rgba(255,255,255,0.28)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c.ink;
  ctx.font = `800 64px ${display}`;
  ctx.fillText("locked in", 96, 200);
  ctx.fillStyle = c.soft;
  ctx.font = `500 34px ${mono}`;
  ctx.fillText(period.toUpperCase(), 96, 256);

  ctx.fillStyle = slide.tone === "ink" ? c.accent : c.ink;
  ctx.font = `600 40px ${mono}`;
  ctx.fillText(slide.eyebrow.toUpperCase(), 96, 700);

  ctx.fillStyle = c.ink;
  const size = fit(ctx, slide.big, W - 192, slide.big.length <= 4 ? 520 : 300, "800", display);
  ctx.font = `800 ${size}px ${display}`;
  const bigY = 700 + size * 0.95 + 20;
  ctx.fillText(slide.big, 84, bigY);

  ctx.fillStyle = slide.tone === "ember" ? "#F4F1EA" : c.ink;
  ctx.font = `italic 300 84px ${serif}`;
  const lines = wrap(ctx, slide.line, W - 192, 3);
  lines.forEach((l, i) => ctx.fillText(l, 96, bigY + 140 + i * 100));

  ctx.fillStyle = c.soft;
  ctx.font = `600 36px ${base}`;
  ctx.fillText("Tracked with Locked In", 96, H - 120);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the card"))), "image/png"));
}

/** Shares one or more slides as image files (one share sheet), else downloads them. */
export async function shareSlides(files: { blob: Blob; name: string }[]): Promise<"shared" | "downloaded" | "cancelled"> {
  const list = files.map((f) => new File([f.blob], f.name, { type: "image/png" }));
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: list })) {
    try {
      await nav.share({ files: list, title: "Locked In Wrapped" });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return "downloaded";
}
