"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteScan, saveMeal } from "@/lib/actions";
import { today } from "@/lib/dates";
import type { Fit, LabelReport, Lens, PlateEstimate, PlateItem, ScanHistoryItem } from "@/lib/types";
import { Bowl, Scan, Spinner, Trash } from "./icons";
import { Card, ErrorNote, Hair, PillButton, Rise, Segmented, fmt } from "./ui";

const MAX_EDGE = 2200;
const LENSES: { key: Lens; label: string }[] = [
  { key: "protein", label: "Protein" },
  { key: "snack", label: "Snack" },
  { key: "cutting", label: "Cutting" },
  { key: "bulking", label: "Bulking" },
];
type Mode = "label" | "barcode" | "photo";

/** Try to read an EAN/UPC from a still image in the browser (iPhone Safari has no native reader). */
async function decodeBarcode(dataUrl: string): Promise<string | null> {
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);
    const result = await reader.decodeFromImageUrl(dataUrl);
    const digits = result.getText().replace(/\D/g, "");
    return digits.length >= 8 ? digits : null;
  } catch {
    return null;
  }
}

/** Downscale and re-encode as JPEG, matching the Android scanner. */
async function toJpegBase64(file: File, maxEdge = MAX_EDGE, quality = 0.88): Promise<{ base64: string; media_type: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { base64: dataUrl.split(",")[1] ?? "", media_type: "image/jpeg", preview: dataUrl };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`);
  return (await res.json()) as T;
}

export default function ScanScreen({ history }: { history: ScanHistoryItem[] }) {
  const [mode, setMode] = useState<Mode>("label");
  const [preview, setPreview] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ base64: string; media_type: string } | null>(null);
  const [note, setNote] = useState("");
  const [barcode, setBarcode] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [decodeNote, setDecodeNote] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens>("protein");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LabelReport | null>(null);
  const [plate, setPlate] = useState<PlateEstimate | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [opened, setOpened] = useState<Record<string, unknown> | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  function reset() {
    setError(null);
    setReport(null);
    setPlate(null);
    setNotFound(false);
    setOpened(null);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    reset();
    try {
      const out = mode === "photo" ? await toJpegBase64(file, 1600, 0.85) : await toJpegBase64(file);
      setPayload({ base64: out.base64, media_type: out.media_type });
      setPreview(out.preview);
      if (mode === "barcode") {
        setDecodeNote(null);
        setDecoding(true);
        const digits = await decodeBarcode(out.preview);
        setDecoding(false);
        if (digits) setBarcode(digits);
        else setDecodeNote("Couldn't read the bars from that photo. Tap Analyse and the printed digits will be read on the server, or type them below.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that image");
    }
  }

  async function analyse() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "barcode") {
        const digits = barcode.replace(/\D/g, "");
        const r = await post<LabelReport & { found?: boolean; message?: string; barcode?: string }>("/api/scan-barcode", {
          barcode: digits.length >= 8 ? digits : undefined,
          image: digits.length >= 8 ? undefined : payload?.base64,
          media_type: digits.length >= 8 ? undefined : payload?.media_type,
          lens,
          note: note.trim() || undefined,
        });
        if (r.barcode && digits.length < 8) setBarcode(r.barcode);
        if (r.found === false) {
          setNotFound(true);
          if (r.message) setError(r.message);
        } else setReport(r);
      } else if (mode === "photo") {
        if (!payload) return;
        setPlate(await post<PlateEstimate>("/api/photo-meal", { image: payload.base64, media_type: payload.media_type, note: note.trim() || undefined }));
      } else {
        if (!payload) return;
        setReport(await post<LabelReport>("/api/scan-label", { image: payload.base64, media_type: payload.media_type, note: note.trim() || undefined, lens }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyse that");
    } finally {
      setBusy(false);
    }
  }

  async function open(item: ScanHistoryItem) {
    reset();
    setBusy(true);
    try {
      const res = await fetch(`/api/scans/${item.id}`);
      if (!res.ok) throw new Error("Could not load that scan");
      setOpened((await res.json()) as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that scan");
    } finally {
      setBusy(false);
    }
  }

  const modeIndex = mode === "label" ? 0 : mode === "barcode" ? 1 : 2;
  const canAnalyse = mode === "barcode" ? barcode.replace(/\D/g, "").length >= 8 || !!payload : !!payload;

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <h1 className="screen-title">Scan</h1>
        <p className="text-[13px] muted">Label, barcode or a photo of your plate</p>
      </Rise>

      <Rise index={1}>
        <Segmented
          options={["Label", "Barcode", "Food photo"]}
          selected={modeIndex}
          label="Scan mode"
          onSelect={(i) => {
            setMode(i === 0 ? "label" : i === 1 ? "barcode" : "photo");
            setPreview(null);
            setPayload(null);
            reset();
          }}
        />
      </Rise>

      <Rise index={2}>
        <Card>
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "var(--btn)", color: "var(--btn-ink)" }}>
              {mode === "photo" ? <Bowl size={18} /> : <Scan size={18} />}
            </span>
            <span>
              <span className="block text-[15px] font-semibold">
                {mode === "label" ? "Scan an ingredients label" : mode === "barcode" ? "Scan a barcode" : "Photograph your plate"}
              </span>
              <span className="block text-xs muted">
                {mode === "label"
                  ? "What it is, how it fits your goal, and whether to trust the pack"
                  : mode === "barcode"
                    ? "Photograph the bars — looked up on Open Food Facts"
                    : "Each item with grams, calories, macros and micros. An estimate — edit anything."}
              </span>
            </span>
          </div>

          {mode !== "photo" ? (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold muted">Judge it for</p>
              <LensSwitch value={lens} onChange={setLens} />
            </div>
          ) : null}

          {mode === "barcode" ? (
            <>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local canvas data URL, not a remote asset
                <img src={preview} alt="The barcode you photographed" className="mt-3 h-[180px] w-full rounded-[14px] object-cover" />
              ) : null}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
              <input ref={galleryRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
              <div className="mt-3 flex gap-2">
                <PillButton height={46} onClick={() => cameraRef.current?.click()}>
                  {preview ? "Retake" : "Photograph the barcode"}
                </PillButton>
                <PillButton height={46} soft onClick={() => galleryRef.current?.click()}>
                  Gallery
                </PillButton>
              </div>
              {decoding ? <p className="mt-2 text-xs muted">Reading the bars…</p> : null}
              {decodeNote && !barcode ? <p className="mt-2 text-xs muted">{decodeNote}</p> : null}
              <input
                className="field mt-3 num"
                inputMode="numeric"
                value={barcode}
                aria-label="Barcode digits"
                onChange={(e) => setBarcode(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="…or type the digits under the bars"
              />
            </>
          ) : (
            <>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local canvas data URL, not a remote asset
                <img src={preview} alt={mode === "photo" ? "Your plate" : "The label you photographed"} className="mt-3 h-[220px] w-full rounded-[14px] object-cover" />
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
            </>
          )}

          {canAnalyse ? (
            <>
              <input
                className="field mt-2.5"
                value={note}
                aria-label="Optional note"
                onChange={(e) => setNote(e.target.value)}
                placeholder={mode === "photo" ? "Optional: e.g. the dal has ghee, two rotis" : "Optional: what is it / what do you want to know"}
              />
              <div className="mt-2.5">
                <PillButton height={48} disabled={busy} onClick={analyse}>
                  {busy ? (mode === "photo" ? "Looking at the plate…" : "Reading and researching…") : mode === "photo" ? "Estimate" : "Analyse"}
                </PillButton>
              </div>
              {busy ? (
                <>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
                    <div className="shimmer h-full w-1/2 rounded-full" style={{ background: "var(--ink)" }} />
                  </div>
                  <p className="mt-1.5 text-xs muted">{mode === "photo" ? "Identifying each item, then checking the food table. 10–20 s." : "Reading → researching the brand → writing your report. 20–45 s."}</p>
                </>
              ) : null}
            </>
          ) : null}
        </Card>
      </Rise>

      <ErrorNote text={error} />
      {notFound ? (
        <Rise index={3}>
          <Card>
            <p className="font-bold">Not in the database yet</p>
            <p className="text-[13px] muted">Open Food Facts doesn&apos;t know this barcode. Scan the label instead — it reads the pack itself.</p>
            <div className="mt-2.5">
              <PillButton height={44} soft onClick={() => setMode("label")}>
                Scan the label
              </PillButton>
            </div>
          </Card>
        </Rise>
      ) : null}
      {report ? <ReportView report={report} initialLens={lens} /> : null}
      {plate ? <PlateReview plate={plate} onSaved={() => setPlate(null)} /> : null}
      {opened ? <OpenedScan data={opened} onClose={() => setOpened(null)} /> : null}

      <History items={history} onOpen={open} />
    </div>
  );
}

function LensSwitch({ value, onChange }: { value: Lens; onChange: (l: Lens) => void }) {
  return (
    <div className="flex gap-1 rounded-full p-[3px]" style={{ background: "var(--card2)" }} role="radiogroup" aria-label="Lens">
      {LENSES.map((l) => {
        const sel = l.key === value;
        return (
          <button
            key={l.key}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onChange(l.key)}
            className="press flex-1 rounded-full py-1.5 text-xs font-semibold"
            style={{ background: sel ? "var(--btn)" : "transparent", color: sel ? "var(--btn-ink)" : "var(--muted)" }}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- the label / barcode report ----

const TRUST: Record<string, { color: string; bg: string; label: string }> = {
  safe: { color: "var(--green)", bg: "var(--green-bg)", label: "Safe" },
  caution: { color: "var(--orange)", bg: "var(--orange-bg)", label: "Caution" },
  unsafe: { color: "var(--red)", bg: "var(--red-bg)", label: "Unsafe" },
  misleading: { color: "var(--purple)", bg: "var(--purple-bg)", label: "Misleading" },
  fake: { color: "var(--red)", bg: "var(--red-bg)", label: "Likely fake" },
};
const FIT_STYLE: Record<string, { color: string; label: string }> = {
  great: { color: "var(--green)", label: "Great fit" },
  ok: { color: "var(--orange)", label: "Fine" },
  weak: { color: "var(--muted)", label: "Weak fit" },
};

const PER_100 = [
  ["calories", "kcal"],
  ["protein_g", "g P"],
  ["carbs_g", "g C"],
  ["sugar_g", "g sugar"],
  ["fat_g", "g F"],
  ["sodium_mg", "mg Na"],
] as const;

export function ReportView({ report: r, initialLens, readOnly }: { report: LabelReport; initialLens?: Lens; readOnly?: boolean }) {
  const [lens, setLens] = useState<Lens>(initialLens ?? r.lens ?? "protein");
  const t = TRUST[r.verdict] ?? { color: "var(--muted)", bg: "var(--card2)", label: r.verdict };

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
  const proteinColor = protein?.rating === "excellent" || protein?.rating === "good" ? "var(--green)" : protein?.rating === "average" ? "var(--orange)" : "var(--muted)";
  const fit: Fit | undefined = r.fits?.[lens];
  const fs = fit ? FIT_STYLE[fit.verdict] : null;
  const info = r.infographic;

  return (
    <>
      <Rise index={2}>
        <Card>
          <div className="flex items-start gap-3">
            {r.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Open Food Facts product photo
              <img src={r.image_url} alt="" className="h-16 w-16 shrink-0 rounded-[12px] object-cover" style={{ background: "var(--card2)" }} />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold">{r.product || "Unknown product"}</p>
              {r.what_it_is ? <p className="mt-1 text-sm leading-relaxed">{r.what_it_is}</p> : null}
              {info?.one_liner ? <p className="mt-1 text-[13px] muted">{info.one_liner}</p> : null}
            </div>
          </div>
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

      {r.fits && Object.keys(r.fits).length ? (
        <Rise index={3}>
          <Card>
            <p className="text-[15px] font-bold">How it fits</p>
            <div className="mt-2">{readOnly && !r.fits ? null : <LensSwitch value={lens} onChange={setLens} />}</div>
            {fit && fs ? (
              <div className="mt-3 rounded-[14px] p-3" style={{ background: `color-mix(in srgb, ${fs.color} 12%, transparent)` }}>
                <span className="badge" style={{ background: `color-mix(in srgb, ${fs.color} 18%, transparent)`, color: fs.color }}>
                  {fs.label}
                </span>
                <p className="mt-1.5 text-sm leading-relaxed">{fit.why}</p>
              </div>
            ) : null}
          </Card>
        </Rise>
      ) : null}

      <Rise index={4}>
        <Card>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] font-bold">Trust</p>
            <span className="badge shrink-0" style={{ background: t.bg, color: t.color }}>
              {t.label}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed">{r.verdict_reason}</p>
        </Card>
      </Rise>

      {protein ? (
        <Rise index={5}>
          <Card>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[15px] font-bold">Protein</p>
              <span className="badge shrink-0" style={{ background: `color-mix(in srgb, ${proteinColor} 16%, transparent)`, color: proteinColor }}>
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
        <Rise index={6}>
          <Card>
            <p className="text-[15px] font-bold">Ingredients to know about</p>
            {r.concerns.map((c, i) => (
              <div key={i} className="mt-2 flex items-start gap-2">
                <span className="mt-1.5 shrink-0 rounded-full" style={{ width: 8, height: 8, background: c.severity === "high" ? "var(--red)" : c.severity === "medium" ? "var(--orange)" : "var(--muted)" }} />
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
        <Rise index={7}>
          <Card>
            <p className="text-[15px] font-bold">Claims on the pack</p>
            {r.claims.map((c, i) => (
              <div key={i} className="mt-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex-1 text-sm font-semibold">&ldquo;{c.claim}&rdquo;</span>
                  <span className="shrink-0 text-xs font-bold" style={{ color: c.status === "supported" ? "var(--green)" : c.status === "unclear" ? "var(--orange)" : "var(--red)" }}>
                    {c.status}
                  </span>
                </div>
                <p className="text-[13px] muted">{c.why}</p>
              </div>
            ))}
          </Card>
        </Rise>
      ) : null}

      {r.research?.length ? <Rise index={8}><Bullets title="What the web says" lines={r.research} /></Rise> : null}
      {r.suggestions?.length ? <Rise index={9}><Bullets title="For you" lines={r.suggestions} strong /></Rise> : null}
      {r.alternatives?.length ? <Rise index={9}><Bullets title="Better options" lines={r.alternatives} /></Rise> : null}
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

// ---- the plate estimate ----

const MICRO_LABELS: [keyof PlateItem["micros"], string, string][] = [
  ["fiber_g", "Fibre", "g"],
  ["sugar_g", "Sugar", "g"],
  ["sodium_mg", "Sodium", "mg"],
  ["iron_mg", "Iron", "mg"],
  ["calcium_mg", "Calcium", "mg"],
  ["vitamin_c_mg", "Vit C", "mg"],
  ["potassium_mg", "Potassium", "mg"],
];
const CONF_STYLE: Record<PlateItem["confidence"], { color: string; label: string }> = {
  high: { color: "var(--green)", label: "High" },
  medium: { color: "var(--orange)", label: "Med" },
  low: { color: "var(--muted)", label: "Low" },
};

function scaleItem(it: PlateItem, grams: number): PlateItem {
  if (it.grams <= 0) return { ...it, grams };
  const k = grams / it.grams;
  const micros: PlateItem["micros"] = {};
  for (const [key, v] of Object.entries(it.micros)) if (v != null) micros[key as keyof PlateItem["micros"]] = Math.round(v * k * 10) / 10;
  return { ...it, grams, calories: Math.round(it.calories * k), protein_g: Math.round(it.protein_g * k * 10) / 10, carbs_g: Math.round(it.carbs_g * k * 10) / 10, fat_g: Math.round(it.fat_g * k * 10) / 10, micros };
}

export function PlateReview({ plate, onSaved, readOnly }: { plate: PlateEstimate; onSaved?: () => void; readOnly?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<PlateItem[]>(plate.items);
  const [open, setOpen] = useState<number | null>(null);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const kcal = items.reduce((a, i) => a + i.calories, 0);
  const prot = items.reduce((a, i) => a + i.protein_g, 0);

  if (!plate.items.length) {
    return (
      <Rise index={3}>
        <Card>
          <p className="font-bold">Couldn&apos;t find food in that photo</p>
          <p className="text-[13px] muted">{plate.plate_note}</p>
        </Card>
      </Rise>
    );
  }

  return (
    <>
      <Rise index={3}>
        <Card>
          <p className="text-[15px] font-bold">{plate.plate_note || "Your plate"}</p>
          <p className="mt-0.5 text-xs muted">This is an estimate — edit anything.</p>
        </Card>
      </Rise>
      <Rise index={4}>
        <Card padding={0}>
          <div className="px-4">
            {items.map((it, idx) => {
              const c = CONF_STYLE[it.confidence];
              const micros = MICRO_LABELS.filter(([k]) => it.micros[k] != null);
              return (
                <div key={idx}>
                  {idx > 0 ? <Hair /> : null}
                  <div className="flex items-center gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold">
                          {it.name}
                          {it.source === "estimated" ? " ~" : ""}
                        </span>
                        <span className="badge shrink-0" style={{ background: `color-mix(in srgb, ${c.color} 16%, transparent)`, color: c.color, fontSize: 10 }}>
                          {c.label}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-xs muted">
                        <span>{it.calories} kcal</span>
                        <span style={{ color: "var(--red)" }}>{fmt(it.protein_g)}g P</span>
                        <span style={{ color: "var(--orange)" }}>{fmt(it.carbs_g)}g C</span>
                        <span style={{ color: "var(--blue)" }}>{fmt(it.fat_g)}g F</span>
                        {micros.length ? (
                          <button type="button" className="press underline" onClick={() => setOpen(open === idx ? null : idx)}>
                            Micros
                          </button>
                        ) : null}
                      </div>
                      {open === idx ? (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs muted">
                          {micros.map(([k, label, unit]) => (
                            <span key={k}>
                              {label} {fmt(it.micros[k] as number)} {unit}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {!readOnly ? (
                      <>
                        <input
                          className="field num w-[68px] text-right"
                          inputMode="decimal"
                          aria-label={`${it.name} grams`}
                          value={it.grams}
                          onChange={(e) => {
                            const g = Number(e.target.value.replace(/[^\d.]/g, ""));
                            if (Number.isFinite(g)) setItems(items.map((x, i) => (i === idx ? scaleItem(x, g) : x)));
                          }}
                        />
                        <span className="text-xs muted">g</span>
                        <button type="button" aria-label={`Remove ${it.name}`} className="press grid h-8 w-8 place-items-center rounded-full" style={{ color: "var(--muted)" }} onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                          <Trash size={16} />
                        </button>
                      </>
                    ) : (
                      <span className="num text-sm font-bold">{Math.round(it.grams)} g</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </Rise>
      {plate.notes.length ? (
        <Rise index={5}>
          <p className="px-1 text-xs muted">{plate.notes.join(" · ")}</p>
        </Rise>
      ) : null}
      <ErrorNote text={error} />
      {!readOnly ? (
        <Rise index={6}>
          <div className="flex items-center gap-3">
            <div>
              <span className="num block text-[20px] font-extrabold tracking-tight">{Math.round(kcal)} kcal</span>
              <span className="block text-xs muted">{fmt(prot)} g protein</span>
            </div>
            <PillButton
              className="flex-1"
              disabled={saving || !items.length}
              onClick={() =>
                startSave(async () => {
                  try {
                    await saveMeal({
                      date: today(),
                      raw_text: plate.plate_note || items.map((i) => i.name).join(", "),
                      photo_path: plate.photo_path ?? null,
                      items: items.map((i) => ({ food_id: i.food_id, name: i.name, grams: i.grams, calories: i.calories, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, source: i.source, confidence: i.confidence === "high" ? 0.9 : i.confidence === "medium" ? 0.6 : 0.3, micros: i.micros })),
                    });
                    onSaved?.();
                    router.push("/");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not save");
                  }
                })
              }
            >
              {saving ? <Spinner size={18} /> : "Save as meal"}
            </PillButton>
          </div>
        </Rise>
      ) : null}
    </>
  );
}

// ---- history ----

const KIND_LABEL: Record<string, string> = { label: "Label", barcode: "Barcode", photo: "Photo" };

function History({ items, onOpen }: { items: ScanHistoryItem[]; onOpen: (i: ScanHistoryItem) => void }) {
  const router = useRouter();
  const [removing, startRemove] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const rows = items.filter((i) => !gone.has(i.id));
  if (!rows.length) return null;
  return (
    <Rise index={4}>
      <p className="mb-2 px-1 text-xs font-semibold muted">History</p>
      <div className="flex flex-col gap-2">
        {rows.map((it) => {
          const t = TRUST[it.verdict];
          return (
            <Card key={it.id} padding={12}>
              <div className="flex items-center gap-3">
                <button type="button" className="press flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(it)} aria-label={`Open ${it.product || KIND_LABEL[it.kind]}`}>
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- product / plate thumbnail
                    <img src={it.image_url} alt="" className="h-11 w-11 shrink-0 rounded-[12px] object-cover" style={{ background: "var(--card2)" }} />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]" style={{ background: "var(--card2)", color: "var(--muted)" }}>
                      {it.kind === "photo" ? <Bowl size={20} /> : <Scan size={20} />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{it.product || KIND_LABEL[it.kind]}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] muted">
                      <span>{KIND_LABEL[it.kind]}</span>
                      <span>·</span>
                      <span>{new Date(it.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      {it.score != null ? <span className="num">· {it.score}/10</span> : null}
                      {it.kind !== "photo" ? <span className="badge" style={{ background: "var(--card2)", color: "var(--ink)", fontSize: 10 }}>{it.lens}</span> : null}
                      {t ? <span style={{ color: t.color }}>{t.label}</span> : null}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete scan"
                  disabled={removing}
                  className="press grid h-8 w-8 shrink-0 place-items-center rounded-full"
                  style={{ color: "var(--muted)" }}
                  onClick={() =>
                    startRemove(async () => {
                      await deleteScan(it.id).catch(() => undefined);
                      setGone(new Set([...gone, it.id]));
                      router.refresh();
                    })
                  }
                >
                  <Trash size={16} />
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </Rise>
  );
}

/** A stored scan, rendered read-only with the same views. */
function OpenedScan({ data, onClose }: { data: Record<string, unknown>; onClose: () => void }) {
  const kind = String(data.kind ?? "label");
  return (
    <>
      <Rise index={2}>
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold muted">Saved scan · {KIND_LABEL[kind] ?? kind}</p>
          <button type="button" className="press text-xs font-semibold" onClick={onClose}>
            Close
          </button>
        </div>
      </Rise>
      {kind === "photo" ? (
        <>
          {typeof data.photo_url === "string" ? (
            <Rise index={2}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
              <img src={data.photo_url} alt="The plate" className="h-[200px] w-full rounded-[14px] object-cover" />
            </Rise>
          ) : null}
          <PlateReview plate={data as unknown as PlateEstimate} readOnly />
        </>
      ) : (
        <ReportView report={data as unknown as LabelReport} readOnly />
      )}
    </>
  );
}
