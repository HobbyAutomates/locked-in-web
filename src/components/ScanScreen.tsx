"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { deleteScan, saveMeal } from "@/lib/actions";
import { today } from "@/lib/dates";
import { decodeBarcode, makeThumb, postJson, toJpegBase64 } from "@/lib/image";
import { mealItemFromPlate, priceItem, type QuantityFood } from "@/lib/quantity";
import { initialLens, type Fit, type LabelReport, type Lens, type MealItem, type PlateEstimate, type PlateItem, type Profile, type ScanHistoryItem } from "@/lib/types";
import { Alert, Barcode, Camera, Check, ChevronDown, Close, Scan, Spinner, Spoon, Tag, Trash } from "./icons";
import QuantitySheet from "./QuantitySheet";
import FoodImage from "./FoodImage";
import { PLATE_PREFILL_KEY, type PlatePrefill } from "@/lib/platePrefill";
import { Card, ErrorNote, Hair, MacroDot, PillButton, Ring, Rise, SPRING, fmt } from "./ui";

const LENSES: { key: Lens; label: string }[] = [
  { key: "protein", label: "Protein" },
  { key: "snack", label: "Snack" },
  { key: "cutting", label: "Cutting" },
  { key: "bulking", label: "Bulking" },
];

export type ScanKind = "barcode" | "label" | "plate";
const KIND_CHIPS: { key: ScanKind; label: string }[] = [
  { key: "barcode", label: "a barcode" },
  { key: "label", label: "a label" },
  { key: "plate", label: "a plate" },
];
const NOT_FOUND = "Not in the database yet — photograph the label side.";

/** The picked photo: the full JPEG for the model and the v2.2 320 px thumbnail for History. */
type Payload = { base64: string; media_type: string; thumb: string | null };

/** What /api/scan came back with, as the screen renders it. */
export type ScanResult = { kind: ScanKind; report?: LabelReport; plate?: PlateEstimate; notFound?: string };

function toResult(r: Record<string, unknown>): ScanResult {
  const kind = (r.kind === "plate" || r.kind === "barcode" ? r.kind : "label") as ScanKind;
  if (kind === "plate") return { kind, plate: r as unknown as PlateEstimate };
  if (r.found === false) return { kind, notFound: typeof r.message === "string" && r.message ? r.message : NOT_FOUND };
  return { kind, report: r as unknown as LabelReport };
}

/**
 * The Scan tab: one button. The photo is decoded for a barcode in the browser first; everything
 * else goes to /api/scan, which works out whether it's a barcode, a label or a plate and runs that
 * pipeline. Analysis starts as soon as the photo is taken. A chip row under the result lets the
 * user correct the guess, which re-runs the scan with that kind forced.
 */
export default function ScanScreen({ history, profile }: { history: ScanHistoryItem[]; profile: Profile }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [digits, setDigits] = useState("");
  const [showDigits, setShowDigits] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  // Profile → Preferences → "Judge scans for" decides where the lens starts.
  const [lens] = useState<Lens>(initialLens(profile));
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<ScanResult | null>(null);
  const [opened, setOpened] = useState<Record<string, unknown> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setError(null);
    setRes(null);
    setOpened(null);
  }

  async function run(extra: { kind?: ScanKind; barcode?: string }, pl: Payload | null = payload) {
    setBusy(true);
    setError(null);
    setRes(null);
    setOpened(null);
    setStage(extra.kind === "plate" ? "Looking at the plate… 10–20 s" : extra.barcode ? "Looking it up and writing your report… 15–30 s" : "Working out what it is, then reading it… 15–45 s");
    try {
      const r = await postJson<Record<string, unknown>>("/api/scan", { image: pl?.base64, media_type: pl?.media_type, thumb: pl?.thumb ?? undefined, lens, note: note.trim() || undefined, ...extra });
      if (typeof r.barcode === "string" && r.barcode) setDigits(r.barcode);
      setRes(toResult(r));
      // A saved scan (it has an id) belongs in History with its new thumbnail.
      if (r.id) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not scan that");
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    reset();
    setDigits("");
    try {
      // v2.7: 1600 px covers label OCR and barcode digits (the harder cases); the classifier / plate
      // path shares this same photo since kind isn't known until the server looks at it.
      const [out, thumb] = await Promise.all([toJpegBase64(file, 1600, 0.86), makeThumb(file)]);
      const pl: Payload = { base64: out.base64, media_type: out.media_type, thumb };
      setPayload(pl);
      setPreview(out.preview);
      setBusy(true);
      setStage("Reading the bars…");
      const code = await decodeBarcode(out.preview);
      if (code) setDigits(code);
      await run(code ? { barcode: code } : {}, pl);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not read that image");
    }
  }

  async function open(item: ScanHistoryItem) {
    reset();
    setBusy(true);
    setStage("Opening…");
    try {
      const r = await fetch(`/api/scans/${item.id}`);
      if (!r.ok) throw new Error("Could not load that scan");
      setOpened((await r.json()) as Record<string, unknown>);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that scan");
    } finally {
      setBusy(false);
    }
  }

  const code = digits.replace(/\D/g, "");

  return (
    <div className="flex flex-col gap-3.5">
      <Rise index={0}>
        <h1 className="screen-title">Scan</h1>
        <p className="text-[13px] muted">A barcode, a nutrition label or your plate</p>
      </Rise>

      <Rise index={1}>
        <Card>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local canvas data URL, not a remote asset
            <img src={preview} alt="What you scanned" className="mb-3 h-[190px] w-full rounded-[14px] object-cover" />
          ) : (
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
                <Scan size={22} />
              </span>
              <p className="text-[13px] leading-snug muted">Point it at a pack&apos;s barcode, its nutrition label, or your plate — it works out which.</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <PillButton disabled={busy} onClick={() => fileRef.current?.click()}>
            <span className="inline-flex items-center gap-2">
              <Scan size={18} />
              {preview ? "Scan another" : "Scan"}
            </span>
          </PillButton>
          {busy ? (
            <>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
                <div className="shimmer h-full w-1/2 rounded-full" style={{ background: "var(--ink)" }} />
              </div>
              <p className="mt-1.5 text-xs muted">{stage}</p>
            </>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-4">
            <button type="button" className="hit press py-2 text-[13px] font-semibold muted" aria-expanded={showDigits} onClick={() => setShowDigits((v) => !v)}>
              Type barcode digits
            </button>
            {res || preview ? (
              <button type="button" className="hit press py-2 text-[13px] font-semibold muted" aria-expanded={showNote} onClick={() => setShowNote((v) => !v)}>
                Add a note
              </button>
            ) : null}
          </div>
          {showDigits ? (
            <div className="mt-1 flex gap-2">
              <input className="field num" inputMode="numeric" value={digits} aria-label="Barcode digits" onChange={(e) => setDigits(e.target.value.replace(/[^\d]/g, "").slice(0, 14))} placeholder="The digits under the bars" />
              <PillButton height={48} className="!w-auto shrink-0 !px-5" disabled={busy || code.length < 8} onClick={() => { setPreview(null); setPayload(null); void run({ kind: "barcode", barcode: code }, null); }}>
                Look up
              </PillButton>
            </div>
          ) : null}
          {showNote ? (
            <div className="mt-1 flex gap-2">
              <input className="field" value={note} aria-label="Note" onChange={(e) => setNote(e.target.value)} placeholder={res?.kind === "plate" ? "e.g. the dal has ghee, two rotis" : "What is it / what do you want to know"} />
              <PillButton height={48} className="!w-auto shrink-0 !px-5" disabled={busy || !note.trim() || (!payload && code.length < 8)} onClick={() => void run({ kind: res?.kind, barcode: code.length >= 8 ? code : undefined })}>
                Redo
              </PillButton>
            </div>
          ) : null}
        </Card>
      </Rise>

      <ErrorNote text={error} />

      {res && payload ? (
        <Rise index={2}>
          <KindChips kind={res.kind} onPick={(k) => void run({ kind: k, barcode: k === "barcode" && code.length >= 8 ? code : undefined })} disabled={busy} />
        </Rise>
      ) : null}
      {res?.notFound ? (
        <Rise index={2}>
          <Card>
            <p className="text-[15px]">{res.notFound}</p>
            <div className="mt-3">
              <PillButton soft height={46} onClick={() => fileRef.current?.click()}>
                Scan again
              </PillButton>
            </div>
          </Card>
        </Rise>
      ) : null}
      {res?.report ? <ReportView key={String(res.report.id ?? res.report.product)} report={res.report} initialLens={lens} /> : null}
      {res?.plate ? <PlateReview key={String(res.plate.id ?? "plate")} plate={res.plate} onSaved={() => setRes(null)} /> : null}
      {opened ? <OpenedScan data={opened} onClose={() => setOpened(null)} /> : null}

      <History items={history} onOpen={open} />
    </div>
  );
}

/** "Looks like a barcode / a label / a plate — change?" The detected one is filled; another re-runs forced. */
export function KindChips({ kind, onPick, disabled }: { kind: ScanKind; onPick: (k: ScanKind) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      <span className="text-[13px] muted">Looks like</span>
      {KIND_CHIPS.map((c) => (
        <button key={c.key} type="button" aria-pressed={c.key === kind} disabled={disabled} className="chip press" style={{ height: 30, fontSize: 12, padding: "0 11px" }} onClick={() => c.key !== kind && onPick(c.key)}>
          {c.label}
        </button>
      ))}
      <span className="text-[13px] muted">— change?</span>
    </div>
  );
}

/** great = green, ok = amber, weak = grey: the dot on each "fits" pill. */
const FIT_DOT: Record<string, { color: string; word: string }> = {
  great: { color: "var(--green)", word: "great" },
  ok: { color: "var(--orange)", word: "OK" },
  weak: { color: "var(--muted)", word: "weak" },
};

/** The fits row: four small pills (Protein / Snack / Cutting / Bulking), each with its verdict dot; tap to read why. */
function LensChips({ value, onChange, fits }: { value: Lens; onChange: (l: Lens) => void; fits?: LabelReport["fits"] }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Judge it for">
      {LENSES.map((l) => {
        const dot = FIT_DOT[fits?.[l.key]?.verdict ?? ""];
        return (
          <button
            key={l.key}
            type="button"
            role="radio"
            aria-checked={l.key === value}
            aria-label={dot ? `${l.label}: ${dot.word}` : l.label}
            className="chip press whitespace-nowrap"
            style={{ height: 30, fontSize: 12, padding: "0 11px", gap: 6 }}
            onClick={() => onChange(l.key)}
          >
            <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: dot?.color ?? "var(--hair)", boxShadow: l.key === value ? "0 0 0 1.5px var(--card)" : undefined }} />
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- the label / barcode report ----

const TRUST: Record<string, { color: string; bg: string; label: string; short: string }> = {
  safe: { color: "var(--green)", bg: "var(--green-bg)", label: "Safe", short: "Trust" },
  caution: { color: "var(--orange)", bg: "var(--orange-bg)", label: "Caution", short: "Caution" },
  unsafe: { color: "var(--red)", bg: "var(--red-bg)", label: "Unsafe", short: "Avoid" },
  misleading: { color: "var(--purple)", bg: "var(--purple-bg)", label: "Misleading", short: "Misleading" },
  fake: { color: "var(--red)", bg: "var(--red-bg)", label: "Likely fake", short: "Fake" },
};

const PER_100 = [
  ["calories", "kcal"],
  ["protein_g", "g P"],
  ["carbs_g", "g C"],
  ["sugar_g", "g sugar"],
  ["fat_g", "g F"],
  ["sodium_mg", "mg Na"],
] as const;

/** The scan report as a food the Quantity sheet can price: per-100 g from the label, one serving = serving_g. */
/** v2.4 "Add to plate": hand the items to the meal flow (sessionStorage) and open it pre-filled. */
function openOnPlate(router: ReturnType<typeof useRouter>, prefill: PlatePrefill) {
  try {
    sessionStorage.setItem(PLATE_PREFILL_KEY, JSON.stringify(prefill));
  } catch {
    // private mode: the meal flow simply opens empty
  }
  router.push(`/log?date=${today()}&mode=meal&prefill=1`);
}

function reportFood(r: LabelReport): QuantityFood | null {
  const p = r.per_100g ?? {};
  if (p.calories == null && p.protein_g == null) return null;
  const serving = r.serving_g && r.serving_g > 0 ? [{ label: "1 serving", grams: r.serving_g }] : [];
  return {
    name: r.product || "Scanned product",
    food_id: null,
    per100: { calories: Number(p.calories ?? 0), protein_g: Number(p.protein_g ?? 0), carbs_g: Number(p.carbs_g ?? 0), fat_g: Number(p.fat_g ?? 0) },
    micros: { ...(p.sugar_g != null ? { sugar_g: Number(p.sugar_g) } : {}), ...(p.fiber_g != null ? { fiber_g: Number(p.fiber_g) } : {}), ...(p.sodium_mg != null ? { sodium_mg: Number(p.sodium_mg) } : {}) },
    servings: serving,
    defaultServing: serving[0]?.label ?? null,
    source: "scan",
  };
}

/** P / C / F share of one serving's calories (4 / 4 / 9 kcal per g), as a donut. */
function MacroDonut({ per100, servingG }: { per100: NonNullable<LabelReport["per_100g"]>; servingG: number | null | undefined }) {
  const g = servingG && servingG > 0 ? servingG : 100;
  const k = g / 100;
  const p = Number(per100.protein_g ?? 0) * k;
  const c = Number(per100.carbs_g ?? 0) * k;
  const f = Number(per100.fat_g ?? 0) * k;
  const kcal = p * 4 + c * 4 + f * 9;
  if (!(kcal > 0)) return null;
  const parts = [
    { v: (p * 4) / kcal, color: "var(--red)", label: "Protein", grams: p },
    { v: (c * 4) / kcal, color: "var(--orange)", label: "Carbs", grams: c },
    { v: (f * 9) / kcal, color: "var(--blue)", label: "Fat", grams: f },
  ];
  const size = 84;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="-rotate-90 shrink-0" aria-label="Macro share of one serving">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {parts.map((part) => {
          const dash = circ * part.v;
          const el = <circle key={part.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={part.color} strokeWidth={stroke} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} />;
          offset += dash;
          return el;
        })}
      </svg>
      <div className="flex flex-col gap-1.5">
        <p className="num text-[15px] font-extrabold leading-tight">
          {Math.round(Number(per100.calories ?? kcal) * k)} kcal <span className="text-xs font-medium muted">/ {servingG && servingG > 0 ? "serving" : "100 g"}</span>
        </p>
        {parts.map((part) => (
          <MacroDot key={part.label} value={`${part.label} ${Math.round(part.v * 100)}% · ${fmt(Math.round(part.grams * 10) / 10)} g`} color={part.color} />
        ))}
      </div>
    </div>
  );
}

const EAT: Record<string, { label: string; color: string }> = {
  great: { label: "Yes", color: "var(--green)" },
  yes: { label: "Yes", color: "var(--green)" },
  ok: { label: "Sometimes", color: "var(--orange)" },
  sometimes: { label: "Sometimes", color: "var(--orange)" },
  weak: { label: "Skip", color: "var(--red)" },
  skip: { label: "Skip", color: "var(--red)" },
};
/** How far along the Trust meter each verdict sits (of 4). */
const TRUST_LEVEL: Record<string, number> = { safe: 4, caution: 2, misleading: 2, unsafe: 1, fake: 1 };

/**
 * The label / barcode report. Hero first — product, score, one-liner, "Eat it?" for the chosen
 * lens and why — then one black "Log 1 serving" button, then everything else behind one Details
 * expander (collapsed by default).
 */
export function ReportView({ report: r, initialLens, defaultOpen = false }: { report: LabelReport; initialLens?: Lens; defaultOpen?: boolean }) {
  const router = useRouter();
  const [lens, setLens] = useState<Lens>(initialLens ?? r.lens ?? "protein");
  const [details, setDetails] = useState(defaultOpen);
  const [logFood, setLogFood] = useState<QuantityFood | null>(null);
  const [logged, setLogged] = useState<string | null>(null);
  const [logErr, setLogErr] = useState<string | null>(null);
  const food = reportFood(r);

  if (!r.readable) {
    return (
      <Rise index={2}>
        <Card>
          <p className="font-bold">Couldn&apos;t read that as a food label</p>
          <p className="mt-0.5 text-[13px] muted">{r.verdict_reason}</p>
        </Card>
      </Rise>
    );
  }

  const fit: Fit | undefined = r.fits?.[lens];
  const info = r.infographic;
  const eat = EAT[fit?.verdict ?? info?.eat_it ?? ""] ?? null;
  const score = info?.score_out_of_10 ?? null;
  const scoreColor = score == null ? "var(--muted)" : score >= 7 ? "var(--green)" : score >= 4 ? "var(--orange)" : "var(--red)";

  async function logServing(item: MealItem) {
    setLogFood(null);
    setLogErr(null);
    try {
      await saveMeal({ date: today(), raw_text: `${r.product || "Scanned product"} (scan)`, items: [item] });
      setLogged(`Logged ${item.servings != null && item.unit === "serving" ? `${fmt(item.servings)} serving${item.servings === 1 ? "" : "s"}` : `${Math.round(item.grams)} g`} · ${Math.round(item.calories)} kcal`);
      router.refresh();
    } catch (e) {
      setLogErr(e instanceof Error ? e.message : "Could not log that");
    }
  }

  return (
    <>
      {/* ---- hero ---- */}
      <Rise index={2}>
        <Card padding={18}>
          <div className="flex items-start gap-3">
            {r.image_url || r.thumb_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Open Food Facts product photo, or the scan's own signed thumbnail
              <img src={(r.image_url || r.thumb_url) as string} alt="" className="h-16 w-16 shrink-0 rounded-[12px] object-cover" style={{ background: "var(--card2)" }} />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-[18px] font-extrabold leading-snug" style={{ overflowWrap: "anywhere", letterSpacing: "-0.02em" }}>
                {r.product || "Unnamed label"}
              </p>
              {info?.one_liner ? <p className="mt-1 text-[13px] leading-snug muted">{info.one_liner}</p> : null}
            </div>
            {score != null ? (
              <Ring fraction={score / 10} color={scoreColor} size={62} stroke={7}>
                <span className="flex flex-col items-center leading-none">
                  <span className="num text-[20px] font-extrabold">{score}</span>
                  <span className="text-[9px] font-semibold muted">/ 10</span>
                </span>
              </Ring>
            ) : null}
          </div>
          {eat || fit ? (
            <div className="mt-3.5 rounded-2xl px-3.5 py-3" style={{ background: "var(--card2)" }}>
              {eat ? (
                <span className="badge" style={{ background: `color-mix(in srgb, ${eat.color} 16%, transparent)`, color: eat.color }}>
                  Eat it? {eat.label}
                </span>
              ) : null}
              {fit?.why ? <p className="mt-1.5 text-sm leading-relaxed">{fit.why}</p> : null}
            </div>
          ) : null}
          {r.fits && Object.keys(r.fits).length ? (
            <div className="mt-3">
              <LensChips value={lens} onChange={setLens} fits={r.fits} />
            </div>
          ) : null}
        </Card>
      </Rise>

      <SummaryGrid r={r} />

      {food ? (
        <Rise index={3}>
          <PillButton onClick={() => setLogFood(food)}>Log 1 serving{r.serving_g ? ` · ${Math.round(r.serving_g)} g` : ""}</PillButton>
          <PillButton
            soft
            height={46}
            className="mt-2"
            onClick={() => {
              const serving = food.servings[0];
              const item = priceItem(food, serving ? { unit: "serving", value: 1 } : { unit: "g", value: 100 });
              openOnPlate(router, { items: [{ ...item, image_url: r.image_url ?? null }], label: `${r.product || "Scanned product"} (scan)`, kind: "product" });
            }}
          >
            Add to plate with other food
          </PillButton>
          {logged ? (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold" style={{ color: "var(--green)" }}>
              <Check size={14} />
              {logged} — on Home
            </p>
          ) : null}
          {logErr ? <p className="mt-2 text-center text-xs" style={{ color: "var(--red)" }}>{logErr}</p> : null}
        </Rise>
      ) : null}

      {/* ---- details ---- */}
      <Rise index={4}>
        <div className="card" style={{ padding: 0 }}>
          <button type="button" aria-expanded={details} className="press flex min-h-[52px] w-full items-center justify-between px-4 text-left" onClick={() => setDetails((d) => !d)}>
            <span className="text-[15px] font-bold">Details</span>
            <span className="flex items-center gap-1.5 text-xs muted">
              {details ? "Hide" : "Trust, macros, ingredients, claims"}
              <motion.span animate={{ rotate: details ? 180 : 0 }} transition={SPRING} className="inline-flex">
                <ChevronDown size={18} />
              </motion.span>
            </span>
          </button>
          <AnimatePresence initial={false}>
            {details ? (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
                <Details r={r} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </Rise>
      <QuantitySheet food={logFood} title="Log from this scan" cta="Log" onClose={() => setLogFood(null)} onDone={(item) => void logServing(item)} />
    </>
  );
}

/**
 * The report's top summary: a 2×2 grid of Protein (g) / Calories (kcal) / Sugar (g) / Fat (g) for
 * one serving — or per 100 g, labelled, when the pack gives no serving size. Big numbers, tiny labels.
 */
function SummaryGrid({ r }: { r: LabelReport }) {
  const p = r.per_100g ?? {};
  const hasServing = !!(r.serving_g && r.serving_g > 0);
  const k = hasServing ? (r.serving_g as number) / 100 : 1;
  const at = (v: number | undefined) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v) * k);
  const protein = hasServing && r.protein?.per_serving_g != null ? Number(r.protein.per_serving_g) : at(p.protein_g);
  const cells: { label: string; value: number | null; unit: string; color: string }[] = [
    { label: "Protein", value: protein, unit: "g", color: "var(--red)" },
    { label: "Calories", value: at(p.calories), unit: "kcal", color: "var(--ink)" },
    { label: "Sugar", value: at(p.sugar_g), unit: "g", color: "var(--orange)" },
    { label: "Fat", value: at(p.fat_g), unit: "g", color: "var(--blue)" },
  ];
  if (cells.every((c) => c.value == null)) return null;
  const show = (v: number, unit: string) => (unit === "kcal" || v >= 10 ? String(Math.round(v)) : fmt(Math.round(v * 10) / 10));
  return (
    <Rise index={3}>
      <Card padding={14}>
        <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] muted">{hasServing ? `Per serving · ${Math.round(r.serving_g as number)} g` : "Per 100 g"}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {cells.map((c) => (
            <div key={c.label} className="rounded-2xl px-3.5 py-3" style={{ background: "var(--card2)" }}>
              <p className="num text-[26px] font-extrabold leading-none" style={{ letterSpacing: "-0.03em", color: c.value == null ? "var(--muted)" : "var(--ink)" }}>
                {c.value == null ? "—" : show(c.value, c.unit)}
                <span className="ml-0.5 text-[13px] font-bold muted">{c.value == null ? "" : c.unit}</span>
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold muted">
                <span className="rounded-full" style={{ width: 6, height: 6, background: c.color }} />
                {c.label}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </Rise>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold muted">{title}</p>
        {right}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Details({ r }: { r: LabelReport }) {
  const t = TRUST[r.verdict] ?? { color: "var(--muted)", bg: "var(--card2)", label: r.verdict };
  const level = TRUST_LEVEL[r.verdict] ?? 2;
  const per100 = r.per_100g ?? {};
  const info = r.infographic;
  const protein = r.protein;
  const proteinColor = protein?.rating === "excellent" || protein?.rating === "good" ? "var(--green)" : protein?.rating === "average" ? "var(--orange)" : "var(--muted)";
  const share = info?.serving_share;
  const spoons = Math.max(0, Math.round((info?.sugar_teaspoons_per_serving ?? 0) * 2) / 2);
  const salt = Math.max(0, Math.min(100, info?.sodium_pct_of_2000mg ?? 0));
  const sections: React.ReactNode[] = [];

  if (r.what_it_is) {
    sections.push(
      <Section key="what" title="What it is">
        <p className="text-sm leading-relaxed">{r.what_it_is}</p>
      </Section>,
    );
  }
  sections.push(
    <Section key="trust" title="Trust" right={<span className="badge" style={{ background: t.bg, color: t.color }}>{t.label}</span>}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-2 flex-1 rounded-full" style={{ background: i <= level ? t.color : "var(--track)" }} />
        ))}
      </div>
      <p className="mt-2 text-sm leading-relaxed">{r.verdict_reason}</p>
    </Section>,
  );
  if (Object.keys(per100).length > 0) {
    sections.push(
      <Section key="serving" title="One serving">
        <MacroDonut per100={per100} servingG={r.serving_g} />
        {share && share.calories_pct + share.protein_pct + share.carbs_pct + share.fat_pct > 0 ? (
          <div className="mt-3.5 flex flex-col gap-2">
            <p className="text-xs muted">…this much of your whole day:</p>
            {(
              [
                ["Calories", share.calories_pct, "var(--ink)"],
                ["Protein", share.protein_pct, "var(--red)"],
                ["Carbs", share.carbs_pct, "var(--orange)"],
                ["Fat", share.fat_pct, "var(--blue)"],
              ] as const
            ).map(([label, pct, color]) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="w-[62px] shrink-0 text-xs font-semibold muted">{label}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
                </span>
                <span className="num w-10 shrink-0 text-right text-[13px] font-bold">{pct}%</span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="mt-3.5 text-xs font-semibold muted">Per 100 g</p>
        <div className="mt-1 flex justify-between gap-2">
          {PER_100.filter(([k]) => per100[k] != null).map(([k, unit]) => (
            <span key={k}>
              <span className="num block text-[15px] font-bold">{Math.round(Number(per100[k]))}</span>
              <span className="block text-[10px] muted">{unit}</span>
            </span>
          ))}
        </div>
      </Section>,
    );
  }
  if (info) {
    sections.push(
      <Section key="sugar-salt" title="Sugar and salt · one serving">
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5" style={{ color: spoons > 0 ? "var(--orange)" : "var(--muted)" }} aria-label={`${spoons} teaspoons of sugar`}>
            {spoons === 0 ? <span className="text-sm muted">No added sugar to speak of</span> : null}
            {Array.from({ length: Math.min(12, Math.ceil(spoons)) }, (_, i) => (
              <Spoon key={i} size={20} style={{ opacity: i + 1 > spoons ? 0.45 : 1 }} />
            ))}
          </span>
          {spoons > 0 ? <span className="num shrink-0 text-[13px] font-bold">{fmt(spoons)} tsp sugar</span> : null}
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="w-[62px] shrink-0 text-xs font-semibold muted">Salt</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
            <span className="block h-full rounded-full" style={{ width: `${salt}%`, background: salt >= 30 ? "var(--red)" : salt >= 15 ? "var(--orange)" : "var(--green)" }} />
          </span>
          <span className="num w-[76px] shrink-0 text-right text-[12px] font-bold">{salt}% of a day</span>
        </div>
      </Section>,
    );
  }
  if (protein) {
    sections.push(
      <Section
        key="protein"
        title="Protein"
        right={
          <span className="badge shrink-0" style={{ background: `color-mix(in srgb, ${proteinColor} 16%, transparent)`, color: proteinColor }}>
            {protein.rating.slice(0, 1).toUpperCase() + protein.rating.slice(1)}
            {protein.per_serving_g != null ? ` · ${Math.round(protein.per_serving_g)} g / serving` : ""}
          </span>
        }
      >
        <p className="text-sm">{protein.quality}</p>
        {protein.note ? <p className="mt-1 text-[13px] muted">{protein.note}</p> : null}
      </Section>,
    );
  }
  if (r.concerns?.length) {
    sections.push(
      <Section key="ingredients" title="Ingredients to know about">
        <ul className="flex list-none flex-col gap-2.5 p-0">
          {r.concerns.map((c, i) => {
            const color = c.severity === "high" ? "var(--red)" : c.severity === "medium" ? "var(--orange)" : "var(--muted)";
            return (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-px grid h-5 w-5 shrink-0 place-items-center" style={{ color }} aria-label={`${c.severity} concern`}>
                  <Alert size={20} />
                </span>
                <span className="min-w-0 text-[13px] leading-snug">
                  <span className="font-semibold">{c.ingredient}</span>
                  <span className="muted"> — {c.issue}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>,
    );
  }
  if (r.claims?.length) {
    sections.push(
      <Section key="claims" title="Claims on the pack">
        {r.claims.map((c, i) => {
          const color = c.status === "supported" ? "var(--green)" : c.status === "unclear" ? "var(--orange)" : "var(--red)";
          return (
            <div key={i} className={`flex items-start gap-2.5${i ? " mt-2.5" : ""}`}>
              <span className="mt-px grid h-5 w-5 shrink-0 place-items-center" style={{ color }} aria-label={c.status}>
                {c.status === "supported" ? <Check size={20} /> : c.status === "unclear" ? <Alert size={20} /> : <Close size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex-1 text-sm font-semibold">&ldquo;{c.claim}&rdquo;</span>
                  <span className="shrink-0 whitespace-nowrap text-xs font-bold" style={{ color }}>
                    {c.status}
                  </span>
                </div>
                <p className="text-[13px] muted">{c.why}</p>
              </div>
            </div>
          );
        })}
      </Section>,
    );
  }
  if (r.suggestions?.length) sections.push(<Bullets key="for-you" title="For you" lines={r.suggestions} strong />);
  if (r.research?.length) sections.push(<Bullets key="web" title="What the web says" lines={r.research} />);
  if (r.alternatives?.length) sections.push(<Bullets key="alt" title="Better options" lines={r.alternatives} />);

  return (
    <div className="px-4 pb-1">
      {sections.map((s, i) => (
        <div key={i}>
          <Hair />
          {s}
        </div>
      ))}
    </div>
  );
}

function Bullets({ title, lines, strong }: { title: string; lines: string[]; strong?: boolean }) {
  return (
    <Section title={title}>
      <ul className="list-none p-0">
        {lines.map((l, i) => (
          <li key={i} className="mt-1 flex gap-2 text-sm leading-relaxed" style={{ color: strong ? "var(--ink)" : "var(--muted)" }}>
            <span aria-hidden="true" className="muted">
              •
            </span>
            {l}
          </li>
        ))}
      </ul>
    </Section>
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
          {plate.portion_hint === "restaurant" ? (
            <p className="mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--orange-bg)", color: "var(--orange)" }}>
              Restaurant portion · ×1.4 + hidden oil
            </p>
          ) : null}
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
                          className="field num text-right"
                          style={{ width: 76, flex: "none", padding: "10px 10px" }}
                          inputMode="decimal"
                          aria-label={`${it.name} grams`}
                          value={it.grams}
                          onChange={(e) => {
                            const g = Number(e.target.value.replace(/[^\d.]/g, ""));
                            if (Number.isFinite(g)) setItems(items.map((x, i) => (i === idx ? scaleItem(x, g) : x)));
                          }}
                        />
                        <span className="text-xs muted">g</span>
                        <button type="button" aria-label={`Remove ${it.name}`} className="hit press grid h-8 w-8 place-items-center rounded-full" style={{ color: "var(--muted)" }} onClick={() => setItems(items.filter((_, i) => i !== idx))}>
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
                      items: items.map(mealItemFromPlate),
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
          <button
            type="button"
            className="hit press mt-1 w-full py-2 text-center text-[13px] font-semibold muted"
            disabled={!items.length}
            onClick={() => openOnPlate(router, { items: items.map(mealItemFromPlate), label: plate.plate_note || "Plate photo", photo_path: plate.photo_path ?? null })}
          >
            Add to plate to change or add food
          </button>
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
          const name = it.product || (it.kind === "photo" ? "Plate photo" : "Unnamed label");
          return (
            <Card key={it.id} padding={12}>
              <div className="flex items-center gap-3">
                <button type="button" className="press flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(it)} aria-label={`Open ${name}`}>
                  <HistoryThumb item={it} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
                      {t ? (
                        <span
                          className="badge shrink-0 justify-center whitespace-nowrap"
                          style={{ background: t.bg, color: t.color, fontSize: 10, minWidth: 54, maxWidth: 84 }}
                          title={t.label}
                        >
                          <span className="min-w-0 truncate">{t.short}</span>
                        </span>
                      ) : null}
                    </span>
                    {it.what_it_is ? <span className="mt-0.5 block truncate text-xs muted">{it.what_it_is}</span> : null}
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] muted">
                      <span>{KIND_LABEL[it.kind]}</span>
                      <span>·</span>
                      <span>{new Date(it.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span>
                      {it.score != null ? <span className="num">· {it.score}/10</span> : null}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete scan"
                  disabled={removing}
                  className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full"
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

/** 44 px history picture: the scan's thumbnail / pack shot / plate photo, else the kind's icon. */
function HistoryThumb({ item }: { item: ScanHistoryItem }) {
  const [broken, setBroken] = useState(false);
  if (item.image_url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL or Open Food Facts image
      <img src={item.image_url} alt="" loading="lazy" onError={() => setBroken(true)} className="h-11 w-11 shrink-0 rounded-[12px] object-cover" style={{ background: "var(--card2)" }} />
    );
  }
  const icon = (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]" style={{ background: "var(--card2)", color: "var(--muted)" }} aria-hidden="true">
      {item.kind === "photo" ? <Camera size={20} /> : item.kind === "barcode" ? <Barcode size={20} /> : <Tag size={20} />}
    </span>
  );
  // v2.4: a named product without its own photo gets the pack shot from the food-image service.
  if (item.kind !== "photo" && item.product.trim()) return <FoodImage name={item.product} kind="product" size={44} fallback={icon} />;
  return icon;
}

/** A stored scan, rendered read-only with the same views. */
function OpenedScan({ data, onClose }: { data: Record<string, unknown>; onClose: () => void }) {
  const kind = String(data.kind ?? "label");
  return (
    <>
      <Rise index={2}>
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold muted">Saved scan · {KIND_LABEL[kind] ?? kind}</p>
          <button type="button" className="hit press text-xs font-semibold" onClick={onClose}>
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
        <ReportView report={data as unknown as LabelReport} />
      )}
    </>
  );
}
