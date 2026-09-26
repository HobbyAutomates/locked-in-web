"use client";

/**
 * v2.13 share cards (spec §13): 1080×1920 story images drawn on a canvas, shared as a file through
 * the Web Share API (works on iPhone) or downloaded when sharing files isn't supported.
 * hide_numbers: callers pass `hide` and no kcal is ever drawn (protein grams are fine, per the
 * v2.10 science spec).
 */

export type CardStat = { label: string; value: string };
export type ShareCard =
  | { kind: "pr"; exercise: string; value: string; sub: string; date: string }
  | { kind: "streak"; days: number; best: number }
  | { kind: "today"; date: string; stats: CardStat[] }
  | { kind: "recap"; title: string; period: string; stats: CardStat[] }
  /** v2.14 milestone flood: the whole card is ember, a big Bricolage number and one Fraunces line. */
  | { kind: "milestone"; eyebrow: string; big: string; line: string };

const WIDTH = 1080;
const HEIGHT = 1920;
const ACCENT = "#ff8a3d";
const ACCENT2 = "#ffb27a";

function fontFamily(): string {
  try {
    const f = getComputedStyle(document.body).fontFamily;
    return f || "system-ui, -apple-system, 'Segoe UI', sans-serif";
  } catch {
    return "system-ui, -apple-system, 'Segoe UI', sans-serif";
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: number, family: string): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 28 && ctx.measureText(text).width > maxWidth) {
    s -= 4;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

/** The font family a class resolves to (next/font hashes the names), for canvas text. */
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

/** v2.14: the ember milestone card (brand v1: ink type on ember, Fraunces italic line). */
function drawMilestone(ctx: CanvasRenderingContext2D, card: Extract<ShareCard, { kind: "milestone" }>, fam: string) {
  const display = familyOf("display", fam);
  const serif = familyOf("serif", "Georgia, serif");
  const mono = familyOf("mono", "ui-monospace, monospace");
  ctx.fillStyle = "#FF5B1F";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.42, 40, WIDTH * 0.5, HEIGHT * 0.42, 1100);
  glow.addColorStop(0, "rgba(255,139,94,0.9)");
  glow.addColorStop(1, "rgba(255,91,31,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "left";
  ctx.fillStyle = "#0B0B0C";
  ctx.font = `800 64px ${display}`;
  ctx.fillText("locked in", 96, 200);
  ctx.font = `500 40px ${mono}`;
  ctx.fillText(card.eyebrow.toUpperCase(), 96, 620);
  const size = fitText(ctx, card.big, WIDTH - 192, 520, 800, display);
  ctx.font = `800 ${size}px ${display}`;
  ctx.fillText(card.big, 84, 620 + size * 0.95);
  ctx.fillStyle = "#F4F1EA";
  fitText(ctx, card.line, WIDTH - 192, 96, 300, `italic ${serif}`.replace("italic ", ""));
  ctx.font = `italic 300 96px ${serif}`;
  ctx.fillText(card.line, 96, 620 + size * 0.95 + 150);
  ctx.fillStyle = "rgba(11,11,12,0.6)";
  ctx.font = `600 36px ${fam}`;
  ctx.fillText("Tracked with Locked In", 96, HEIGHT - 120);
}

/** Draws a card and returns it as a PNG blob. */
export async function renderCard(card: ShareCard): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available");
  try {
    await document.fonts?.ready;
  } catch {
    // Fonts API missing: the fallback family is fine.
  }
  const fam = fontFamily();
  if (card.kind === "milestone") {
    drawMilestone(ctx, card, fam);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))), "image/png"));
  }

  // Background: near-black with a warm glow and three soft plates, like the Profile cover.
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#1d1d1f");
  bg.addColorStop(1, "#050505");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH * 0.8, HEIGHT * 0.18, 20, WIDTH * 0.8, HEIGHT * 0.18, 900);
  glow.addColorStop(0, "rgba(255,138,61,0.38)");
  glow.addColorStop(1, "rgba(255,138,61,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (const [x, y, r] of [
    [130, 1650, 260],
    [980, 1480, 190],
  ] as const) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 10, x, y, r);
    g.addColorStop(0, "#3a3a3d");
    g.addColorStop(1, "#0b0b0c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Wordmark.
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 54px ${fam}`;
  ctx.fillText("LOCKED IN", 96, 190);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(96, 214, 120, 10);

  const center = WIDTH / 2;
  ctx.textAlign = "center";
  const eyebrow = (t: string, y: number) => {
    ctx.fillStyle = ACCENT2;
    ctx.font = `700 44px ${fam}`;
    ctx.fillText(t.toUpperCase(), center, y);
  };
  const big = (t: string, y: number, size = 300) => {
    ctx.fillStyle = "#ffffff";
    fitText(ctx, t, WIDTH - 160, size, 800, fam);
    ctx.fillText(t, center, y);
  };
  const sub = (t: string, y: number, size = 52, color = "rgba(255,255,255,0.72)") => {
    ctx.fillStyle = color;
    fitText(ctx, t, WIDTH - 180, size, 600, fam);
    ctx.fillText(t, center, y);
  };
  const stats = (list: CardStat[], top: number) => {
    const rowH = 150;
    list.slice(0, 5).forEach((s, i) => {
      const y = top + i * rowH;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      roundRect(ctx, 110, y, WIDTH - 220, rowH - 26, 36);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.66)";
      ctx.font = `600 42px ${fam}`;
      ctx.fillText(s.label, 160, y + 76);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 56px ${fam}`;
      ctx.fillText(s.value, WIDTH - 160, y + 80);
      ctx.textAlign = "center";
    });
  };

  if (card.kind === "pr") {
    eyebrow("New personal record", 520);
    sub(card.exercise, 640, 76, "#ffffff");
    big(card.value, 950, 260);
    sub(card.sub, 1060);
    sub(card.date, 1150, 40, "rgba(255,255,255,0.5)");
  } else if (card.kind === "streak") {
    eyebrow("Day streak", 560);
    big(String(card.days), 900, 380);
    sub(card.days === 1 ? "day locked in" : "days locked in", 1010);
    if (card.best > card.days) sub(`Best so far: ${card.best}`, 1100, 42, "rgba(255,255,255,0.5)");
    else if (card.days > 1) sub("Personal best", 1100, 42, ACCENT2);
  } else if (card.kind === "today") {
    eyebrow("Today", 480);
    sub(card.date, 570, 60, "#ffffff");
    stats(card.stats, 700);
  } else {
    eyebrow(card.title, 480);
    sub(card.period, 570, 60, "#ffffff");
    stats(card.stats, 700);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `600 36px ${fam}`;
  ctx.fillText("Tracked with Locked In", center, HEIGHT - 120);

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))), "image/png"));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shares the card as a file, or downloads it. Resolves "shared" | "downloaded" | "cancelled". */
export async function shareCard(card: ShareCard, filename = "locked-in.png"): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await renderCard(card);
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Locked In" });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
