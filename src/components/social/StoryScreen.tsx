"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ErrorNote } from "../ui";
import { FADE_MS, FRAME_MS, INTRO_MS, STORY_OPTIN_KEY, frameCaption, reelLength, type StoryFrame } from "@/lib/social/story";
import { shortDate } from "@/lib/dates";

const W = 720;
const H = 1280;

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

async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

function pickMime(): string | null {
  const MR = typeof window !== "undefined" ? window.MediaRecorder : undefined;
  if (!MR) return null;
  for (const m of ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) if (MR.isTypeSupported?.(m)) return m;
  return "video/webm";
}

/** Draws the reel at time `t` (ms) on the canvas. */
function draw(ctx: CanvasRenderingContext2D, t: number, frames: StoryFrame[], bitmaps: (ImageBitmap | null)[], fonts: { display: string; serif: string; mono: string }) {
  ctx.fillStyle = "#0B0B0C";
  ctx.fillRect(0, 0, W, H);
  const total = reelLength(frames.length);
  const cover = (bmp: ImageBitmap, alpha: number) => {
    const s = Math.max(W / bmp.width, H / bmp.height);
    const w = bmp.width * s;
    const h = bmp.height * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
    ctx.globalAlpha = 1;
  };
  ctx.textAlign = "left";
  if (t < INTRO_MS) {
    ctx.fillStyle = "#F4F1EA";
    ctx.font = `800 44px ${fonts.display}`;
    ctx.fillText("locked in", 60, 120);
    ctx.font = `800 104px ${fonts.display}`;
    ctx.fillText("The", 60, 560);
    ctx.fillText("change.", 60, 670);
    ctx.fillStyle = "#FF5B1F";
    ctx.font = `italic 300 48px ${fonts.serif}`;
    ctx.fillText(`${frames.length} photos · ${frames[frames.length - 1].dayIndex + 1} days`, 60, 760);
    return;
  }
  const tt = t - INTRO_MS;
  const i = Math.min(frames.length - 1, Math.floor(tt / FRAME_MS));
  if (tt < frames.length * FRAME_MS) {
    const within = tt - i * FRAME_MS;
    if (i > 0 && within < FADE_MS && bitmaps[i - 1]) cover(bitmaps[i - 1]!, 1);
    if (bitmaps[i]) cover(bitmaps[i]!, i > 0 ? Math.min(1, within / FADE_MS) : 1);
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, "rgba(11,11,12,0)");
    g.addColorStop(1, "rgba(11,11,12,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const f = frames[i];
    const cap = frameCaption(f);
    ctx.fillStyle = "#F4F1EA";
    ctx.font = `500 26px ${fonts.mono}`;
    ctx.fillText(shortDate(f.date).toUpperCase(), 60, H - 250);
    ctx.font = `800 96px ${fonts.display}`;
    ctx.fillText(cap.day, 60, H - 150);
    if (f.kg != null) {
      ctx.font = `600 40px ${fonts.display}`;
      ctx.fillText(`${f.kg} kg${cap.change ? `  ${cap.change}` : ""}`, 60, H - 90);
    }
    ctx.fillStyle = "#FF5B1F";
    ctx.fillRect(60, H - 44, ((W - 120) * (tt + 1)) / (frames.length * FRAME_MS), 4);
    return;
  }
  // Outro: first and last side by side.
  const a = bitmaps[0];
  const b = bitmaps[bitmaps.length - 1];
  const half = (bmp: ImageBitmap | null, x: number) => {
    if (!bmp) return;
    const s = Math.max(W / 2 / bmp.width, (H * 0.62) / bmp.height);
    const w = bmp.width * s;
    const h = bmp.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 180, W / 2 - 6, H * 0.62);
    ctx.clip();
    ctx.drawImage(bmp, x + (W / 2 - 6 - w) / 2, 180 + (H * 0.62 - h) / 2, w, h);
    ctx.restore();
  };
  half(a, 0);
  half(b, W / 2 + 6);
  ctx.fillStyle = "#F4F1EA";
  ctx.font = `800 44px ${fonts.display}`;
  ctx.fillText("locked in", 60, 120);
  const last = frames[frames.length - 1];
  ctx.font = `800 72px ${fonts.display}`;
  ctx.fillText(last.delta != null ? `${last.delta > 0 ? "+" : last.delta < 0 ? "−" : "±"}${Math.abs(last.delta)} kg` : `${last.dayIndex + 1} days`, 60, H * 0.62 + 290);
  ctx.fillStyle = "#FF5B1F";
  ctx.font = `italic 300 44px ${fonts.serif}`;
  ctx.fillText("Still going.", 60, H * 0.62 + 350);
  void total;
}

export default function StoryScreen({ frames }: { frames: StoryFrame[] }) {
  const [optin, setOptin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<{ url: string; blob: Blob; ext: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    try {
      setOptin(localStorage.getItem(STORY_OPTIN_KEY) === "1");
    } catch {
      setOptin(false);
    }
  }, []);
  useEffect(() => () => (video ? URL.revokeObjectURL(video.url) : undefined), [video]);

  function setOpt(v: boolean) {
    setOptin(v);
    try {
      localStorage.setItem(STORY_OPTIN_KEY, v ? "1" : "0");
    } catch {
      // Just this visit.
    }
  }

  async function make() {
    const canvas = canvasRef.current;
    const mime = pickMime();
    if (!canvas || !mime || typeof canvas.captureStream !== "function") return setError("This browser can't record video. Try Chrome on Android, or Safari 14.1+.");
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const bitmaps = await Promise.all(frames.map((f) => (f.url ? loadBitmap(f.url) : Promise.resolve(null))));
      if (!bitmaps.some(Boolean)) throw new Error("Couldn't load your photos. Check your connection.");
      const ctx = canvas.getContext("2d")!;
      const fonts = { display: familyOf("display", "system-ui"), serif: familyOf("serif", "Georgia, serif"), mono: familyOf("mono", "ui-monospace, monospace") };
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
      const total = reelLength(frames.length);
      draw(ctx, 0, frames, bitmaps, fonts);
      rec.start(250);
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          const t = performance.now() - t0;
          draw(ctx, Math.min(t, total), frames, bitmaps, fonts);
          setProgress(Math.min(1, t / total));
          if (t >= total) return resolve();
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      rec.stop();
      await done;
      const blob = new Blob(chunks, { type: mime.split(";")[0] });
      setVideo({ url: URL.createObjectURL(blob), blob, ext: mime.includes("mp4") ? "mp4" : "webm" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the reel");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!video) return;
    const file = new File([video.blob], `locked-in-transformation.${video.ext}`, { type: video.blob.type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "My transformation" });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = video.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (optin === null) return null;
  if (!optin)
    return (
      <section className="flex flex-col gap-3" style={{ background: "linear-gradient(160deg, #0B0B0C, #1a1a1d)", color: "#F4F1EA", borderRadius: 26, padding: 22 }}>
        <p className="display text-[26px] font-extrabold leading-tight" style={{ letterSpacing: "-0.03em" }}>
          Your before and after, as a reel.
        </p>
        <p className="text-[13.5px]" style={{ opacity: 0.75 }}>
          Uses your progress photos and weights. It&rsquo;s made on this phone and only goes anywhere if you share it.
        </p>
        <button type="button" onClick={() => setOpt(true)} className="press h-12 rounded-2xl text-[15px] font-bold" style={{ background: "#FF5B1F", color: "#0B0B0C", border: 0 }}>
          Turn it on
        </button>
      </section>
    );

  if (frames.length < 2)
    return (
      <section className="flex flex-col gap-2" style={{ background: "var(--card)", borderRadius: 22, padding: 18, boxShadow: "var(--pcard-ring)" }}>
        <p className="text-[16px] font-bold">Add at least two progress photos</p>
        <p className="text-[13px] muted">One now and one in a few weeks is enough to start. Same spot, same light works best.</p>
        <Link href="/progress/photos" className="press flex h-11 items-center justify-center rounded-2xl text-[14px] font-semibold" style={{ background: "var(--ink)", color: "var(--bg)" }}>
          Progress photos
        </Link>
        <button type="button" onClick={() => setOpt(false)} className="press h-10 text-[13px] font-semibold muted" style={{ background: "none", border: 0 }}>
          Turn off
        </button>
      </section>
    );

  return (
    <>
      <section aria-label="Timeline" className="flex flex-col gap-2.5" style={{ background: "var(--card)", borderRadius: 22, padding: 16, boxShadow: "var(--pcard-ring)" }}>
        <p className="text-[15.5px] font-semibold">
          {frames.length} photos · {frames[frames.length - 1].dayIndex + 1} days
        </p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {frames.map((f) => {
            const cap = frameCaption(f);
            return (
              <figure key={f.date + (f.url ?? "")} className="flex w-[92px] shrink-0 flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                <img src={f.url ?? ""} alt="" className="h-[128px] w-[92px] rounded-xl object-cover" loading="lazy" />
                <figcaption className="text-[11px] leading-tight">
                  <span className="font-semibold">{cap.day}</span>
                  <br />
                  <span className="muted">{f.kg != null ? `${f.kg} kg` : shortDate(f.date)}</span>
                  {cap.change ? <span style={{ color: "var(--accent)" }}> {cap.change}</span> : null}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </section>
      <ErrorNote text={error} />
      {video ? (
        <section className="flex flex-col gap-2.5" style={{ background: "#0B0B0C", borderRadius: 22, padding: 12 }}>
          <video src={video.url} controls playsInline className="mx-auto aspect-[9/16] w-full max-w-[280px] rounded-xl" />
          <button type="button" onClick={() => void share()} className="press h-12 rounded-2xl text-[15px] font-bold" style={{ background: "#FF5B1F", color: "#0B0B0C", border: 0 }}>
            Share the reel
          </button>
        </section>
      ) : null}
      <button type="button" disabled={busy} onClick={() => void make()} className="press h-12 rounded-2xl text-[15px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-ink)", border: 0 }}>
        {busy ? `Recording… ${Math.round(progress * 100)}%` : video ? "Make it again" : `Make the reel (${Math.round(reelLength(frames.length) / 1000)} s)`}
      </button>
      <canvas ref={canvasRef} width={W} height={H} className="hidden" aria-hidden="true" />
      <p className="px-1 text-[12px] muted">Made on this phone. Nothing is uploaded unless you share it.</p>
      <button type="button" onClick={() => setOpt(false)} className="press h-10 text-[13px] font-semibold muted" style={{ background: "none", border: 0 }}>
        Turn off the story
      </button>
    </>
  );
}
