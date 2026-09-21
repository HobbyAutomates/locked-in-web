"use client";

import { useRef, useState } from "react";
import type { LabelReport } from "@/lib/types";
import { Scan } from "./icons";
import { Card, ErrorNote, Hair, PillButton, Rise } from "./ui";

const MAX_EDGE = 2200;

/** Downscale to <= 2200 px and re-encode as JPEG 0.88, matching the Android scanner. */
async function toJpegBase64(file: File): Promise<{ base64: string; media_type: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return { base64: dataUrl.split(",")[1] ?? "", media_type: "image/jpeg", preview: dataUrl };
}

export default function ScanScreen() {
  const [preview, setPreview] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ base64: string; media_type: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LabelReport | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReport(null);
    try {
      const { base64, media_type, preview: p } = await toJpegBase64(file);
      setPayload({ base64, media_type });
      setPreview(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that image");
    }
  }

  async function analyse() {
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scan-label", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: payload.base64, media_type: payload.media_type, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Scan failed (${res.status})`);
      setReport((await res.json()) as LabelReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyse that label");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <h1 className="screen-title">Scan</h1>
        <p className="text-[13px] muted">Ingredients list or nutrition panel</p>
      </Rise>

      <Rise index={1}>
        <Card>
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "var(--btn)", color: "var(--btn-ink)" }}>
              <Scan size={18} />
            </span>
            <span>
              <span className="block text-[15px] font-semibold">Scan an ingredients label</span>
              <span className="block text-xs muted">Safe, fake or misleading? Is the protein real? Should you eat it?</span>
            </span>
          </div>

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local canvas data URL, not a remote asset
            <img src={preview} alt="The label you photographed" className="mt-3 h-[220px] w-full rounded-[14px] object-cover" />
          ) : null}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          <input ref={galleryRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />

          <div className="mt-3 flex gap-2">
            <PillButton height={46} onClick={() => cameraRef.current?.click()}>
              {preview ? "Retake" : "Take photo"}
            </PillButton>
            <PillButton height={46} soft onClick={() => galleryRef.current?.click()}>
              Gallery
            </PillButton>
          </div>

          {preview ? (
            <>
              <input
                className="field mt-2.5"
                value={note}
                aria-label="Optional note about this product"
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional: what is it / what do you want to know"
              />
              <div className="mt-2.5">
                <PillButton height={48} disabled={busy} onClick={analyse}>
                  {busy ? "Reading label and researching…" : "Analyse"}
                </PillButton>
              </div>
              {busy ? (
                <>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
                    <div className="shimmer h-full w-1/2 rounded-full" style={{ background: "var(--ink)" }} />
                  </div>
                  <p className="mt-1.5 text-xs muted">Reading the label → researching the brand → writing your report. 20–45 s.</p>
                </>
              ) : null}
            </>
          ) : null}
        </Card>
      </Rise>

      <ErrorNote text={error} />
      {report ? <ReportView report={report} /> : null}
    </div>
  );
}

const VERDICTS: Record<string, { color: string; bg: string; label: string }> = {
  safe: { color: "var(--green)", bg: "var(--green-bg)", label: "Safe" },
  caution: { color: "var(--orange)", bg: "var(--orange-bg)", label: "Caution" },
  unsafe: { color: "var(--red)", bg: "var(--red-bg)", label: "Unsafe" },
  misleading: { color: "var(--purple)", bg: "var(--purple-bg)", label: "Misleading" },
  fake: { color: "var(--red)", bg: "var(--red-bg)", label: "Likely fake" },
};

const PER_100 = [
  ["calories", "kcal"],
  ["protein_g", "g P"],
  ["carbs_g", "g C"],
  ["sugar_g", "g sugar"],
  ["fat_g", "g F"],
  ["sodium_mg", "mg Na"],
] as const;

function ReportView({ report: r }: { report: LabelReport }) {
  const v = VERDICTS[r.verdict] ?? { color: "var(--muted)", bg: "var(--card2)", label: r.verdict };

  if (!r.readable) {
    return (
      <Rise index={2}>
        <Card>
          <p className="font-bold">Couldn&apos;t read that as a food label</p>
          <p className="text-[13px] muted">{r.verdict_reason}</p>
        </Card>
      </Rise>
    );
  }

  const per100 = r.per_100g ?? {};
  const protein = r.protein;
  const proteinColor =
    protein?.rating === "excellent" || protein?.rating === "good" ? "var(--green)" : protein?.rating === "average" ? "var(--orange)" : "var(--red)";

  return (
    <>
      <Rise index={2}>
        <Card>
          <div className="flex items-start justify-between gap-2">
            <p className="flex-1 text-[17px] font-bold">{r.product || "Unknown product"}</p>
            <span className="badge shrink-0" style={{ background: v.bg, color: v.color }}>
              {v.label}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed">{r.verdict_reason}</p>
          {Object.keys(per100).length > 0 ? (
            <>
              <div className="my-2.5">
                <Hair />
              </div>
              <p className="text-xs font-semibold muted">Per 100 g</p>
              <div className="mt-1 flex justify-between gap-2">
                {PER_100.filter(([k]) => per100[k] != null).map(([k, unit]) => (
                  <span key={k}>
                    <span className="num block text-[15px] font-bold">{Math.round(Number(per100[k]))}</span>
                    <span className="block text-[10px] muted">{unit}</span>
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </Card>
      </Rise>

      {protein ? (
        <Rise index={3}>
          <Card>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[15px] font-bold">Protein</p>
              <span className="badge shrink-0" style={{ background: v.bg === "var(--card2)" ? "var(--card2)" : `color-mix(in srgb, ${proteinColor} 16%, transparent)`, color: proteinColor }}>
                {protein.rating.slice(0, 1).toUpperCase() + protein.rating.slice(1)}
                {protein.per_serving_g != null ? ` · ${Math.round(protein.per_serving_g)} g / serving` : ""}
              </span>
            </div>
            <p className="mt-1.5 text-sm">{protein.quality}</p>
            {protein.note ? <p className="mt-1 text-[13px] muted">{protein.note}</p> : null}
          </Card>
        </Rise>
      ) : null}

      {r.concerns?.length ? (
        <Rise index={4}>
          <Card>
            <p className="text-[15px] font-bold">Ingredients to know about</p>
            {r.concerns.map((c, i) => (
              <div key={i} className="mt-2 flex items-start gap-2">
                <span
                  className="mt-1.5 shrink-0 rounded-full"
                  style={{ width: 8, height: 8, background: c.severity === "high" ? "var(--red)" : c.severity === "medium" ? "var(--orange)" : "var(--muted)" }}
                />
                <span>
                  <span className="block text-sm font-semibold">{c.ingredient}</span>
                  <span className="block text-[13px] muted">{c.issue}</span>
                </span>
              </div>
            ))}
          </Card>
        </Rise>
      ) : null}

      {r.claims?.length ? (
        <Rise index={5}>
          <Card>
            <p className="text-[15px] font-bold">Claims on the pack</p>
            {r.claims.map((c, i) => (
              <div key={i} className="mt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex-1 text-sm font-semibold">&ldquo;{c.claim}&rdquo;</span>
                  <span
                    className="shrink-0 text-xs font-bold"
                    style={{ color: c.status === "supported" ? "var(--green)" : c.status === "unclear" ? "var(--orange)" : "var(--red)" }}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="text-[13px] muted">{c.why}</p>
              </div>
            ))}
          </Card>
        </Rise>
      ) : null}

      {r.research?.length ? <Rise index={6}><Bullets title="What the web says" lines={r.research} /></Rise> : null}
      {r.suggestions?.length ? <Rise index={7}><Bullets title="For you" lines={r.suggestions} strong /></Rise> : null}
      {r.alternatives?.length ? <Rise index={8}><Bullets title="Better options" lines={r.alternatives} /></Rise> : null}
    </>
  );
}

function Bullets({ title, lines, strong }: { title: string; lines: string[]; strong?: boolean }) {
  return (
    <Card>
      <p className="text-[15px] font-bold">{title}</p>
      <ul className="mt-1 list-none p-0">
        {lines.map((l, i) => (
          <li key={i} className="mt-1.5 flex gap-2 text-sm leading-relaxed" style={{ color: strong ? "var(--ink)" : "var(--muted)" }}>
            <span aria-hidden="true" className="muted">
              •
            </span>
            {l}
          </li>
        ))}
      </ul>
    </Card>
  );
}
