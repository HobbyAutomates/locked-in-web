"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { createSavedMeal, saveMeal } from "@/lib/actions";
import type { MealItem, ParseResult, SavedMeal } from "@/lib/types";
import { Mic, Trash } from "./icons";
import { quickLogMeal } from "./PendingMeals";
import { Card, CardButton, ErrorNote, Hair, MacroDot, NumberField, PillButton, Rise, fmt } from "./ui";

/** Re-price an item after a grams edit (scales linearly, exactly like Android's withGrams). */
function withGrams(item: MealItem, grams: number): MealItem {
  if (!item.grams || item.grams <= 0) return { ...item, grams };
  const k = grams / item.grams;
  return {
    ...item,
    grams,
    calories: item.calories * k,
    protein_g: item.protein_g * k,
    carbs_g: item.carbs_g * k,
    fat_g: item.fat_g * k,
  };
}

async function parseMeal(text: string, correction?: string, previous?: MealItem[]): Promise<ParseResult> {
  const res = await fetch("/api/parse-meal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, correction, previous }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Could not work that out (${res.status})`);
  return (await res.json()) as ParseResult;
}

export default function MealForm({ date, savedMeals, onClose }: { date: string; savedMeals: SavedMeal[]; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [items, setItems] = useState<MealItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fixText, setFixText] = useState("");
  const [fixing, setFixing] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [savedName, setSavedName] = useState("");

  const totalKcal = items.reduce((a, i) => a + Number(i.calories), 0);
  const totalProtein = items.reduce((a, i) => a + Number(i.protein_g), 0);

  async function run() {
    setParsing(true);
    setError(null);
    setResult(null);
    try {
      const r = await parseMeal(text);
      setResult(r);
      setItems(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not work that out");
    } finally {
      setParsing(false);
    }
  }

  async function fix() {
    setFixing(true);
    setError(null);
    try {
      const r = await parseMeal(text, fixText, items);
      setResult(r);
      setItems(r.items);
      setFixText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not redo that");
    } finally {
      setFixing(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveMeal({ date, raw_text: text.trim() || savedName || "Meal", items });
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  }

  async function saveRepeat() {
    try {
      await createSavedMeal({ name: savedName.trim(), items });
      setShowSaveAs(false);
      setSavedName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that meal");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-3.5 px-4 pb-4 pt-1.5">
        {savedMeals.length > 0 && result === null ? (
          <Rise index={0}>
            <p className="mb-2 pl-1 text-[13px] font-semibold muted">Saved meals · one tap</p>
            <div className="grid grid-cols-2 gap-2">
              {savedMeals.map((sm) => (
                <CardButton
                  key={sm.id}
                  padding={12}
                  onClick={() => {
                    setText(sm.name);
                    setItems(sm.items);
                    setResult({ items: sm.items.map((i) => ({ ...i, input: sm.name })), assumptions: [], unparsed: [] });
                  }}
                >
                  <span className="block truncate text-sm font-semibold">{sm.name}</span>
                  <span className="block text-xs muted">
                    {Math.round(sm.calories)} kcal · {fmt(sm.protein_g)} g P
                  </span>
                </CardButton>
              ))}
            </div>
          </Rise>
        ) : null}

        <Rise index={1}>
          <Card>
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: "var(--btn)", color: "var(--btn-ink)" }}>
                <Mic size={18} />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">Describe what you ate</span>
                <span className="block text-xs muted">Tap the box and dictate with your keyboard mic</span>
              </span>
            </div>
            <textarea
              className="field mt-3"
              rows={3}
              value={text}
              aria-label="What you ate"
              onChange={(e) => setText(e.target.value)}
              placeholder="150 g rice, 100 g dal, 2 eggs and a scoop of whey"
            />
            <div className="mt-3">
              <PillButton onClick={run} disabled={!text.trim() || parsing} height={48}>
                {parsing ? "Working out the calories…" : "Work out the calories"}
              </PillButton>
            </div>
            {result === null ? (
              <div className="mt-2">
                <PillButton
                  soft
                  height={44}
                  disabled={!text.trim() || parsing}
                  onClick={() => {
                    quickLogMeal(text.trim(), date);
                    onClose();
                  }}
                >
                  Log now, review later
                </PillButton>
              </div>
            ) : null}
            {parsing ? <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}><div className="shimmer h-full w-1/2 rounded-full" style={{ background: "var(--ink)" }} /></div> : null}
          </Card>
        </Rise>

        <ErrorNote text={error} />

        {result ? (
          <>
            <Rise index={2}>
              <p className="px-1 text-[13px] font-semibold muted">Review · edit grams if needed</p>
            </Rise>
            <Rise index={3}>
              <Card padding={0}>
                <div className="px-4">
                  {items.map((item, idx) => (
                    <ReviewRow
                      key={`${item.name}-${idx}`}
                      item={item}
                      first={idx === 0}
                      onGrams={(g) => setItems((cur) => cur.map((x, i) => (i === idx ? withGrams(x, g) : x)))}
                      onRemove={() => setItems((cur) => cur.filter((_, i) => i !== idx))}
                    />
                  ))}
                  {items.length === 0 ? <p className="py-4 text-[13px] muted">No items left. Add some words above and work it out again.</p> : null}
                </div>
              </Card>
            </Rise>

            {result.assumptions.length > 0 || result.unparsed.length > 0 ? (
              <Rise index={4}>
                <p className="px-1 text-xs muted">
                  {[...result.assumptions, ...result.unparsed.map((u) => `Ignored: ${u}`)].join(" · ")}
                </p>
              </Rise>
            ) : null}

            <Rise index={5}>
              <Card padding={12}>
                <label className="text-[13px] font-semibold muted" htmlFor="fix">
                  Something wrong? Tell me and I&apos;ll redo it
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="fix"
                    className="field"
                    value={fixText}
                    onChange={(e) => setFixText(e.target.value)}
                    placeholder="e.g. it was two scoops, and the rice was raw"
                  />
                  <PillButton onClick={fix} disabled={!fixText.trim() || fixing} height={40} className="!w-auto shrink-0 !px-5">
                    {fixing ? "…" : "Fix"}
                  </PillButton>
                </div>
              </Card>
            </Rise>

            <Rise index={6}>
              {showSaveAs ? (
                <div className="flex items-center gap-2">
                  <input
                    className="field"
                    value={savedName}
                    aria-label="Name for this repeat meal"
                    onChange={(e) => setSavedName(e.target.value)}
                    placeholder="Name it, e.g. Dinner usual"
                  />
                  <PillButton onClick={saveRepeat} disabled={!savedName.trim()} height={40} className="!w-auto shrink-0 !px-5">
                    Save
                  </PillButton>
                </div>
              ) : (
                <button type="button" onClick={() => setShowSaveAs(true)} className="press py-1 text-[13px] muted" style={{ background: "none", border: 0 }}>
                  Save as a repeat meal
                </button>
              )}
            </Rise>
          </>
        ) : null}
      </div>

      {result ? (
        <div
          className="sticky bottom-0 flex items-center gap-3 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3"
          style={{ background: "var(--bg)" }}
        >
          <div className="shrink-0">
            <p className="num text-xl font-extrabold leading-tight">{Math.round(totalKcal)} kcal</p>
            <p className="text-xs muted">{fmt(totalProtein)} g protein</p>
          </div>
          <PillButton onClick={save} disabled={items.length === 0 || saving}>
            {saving ? "Saving…" : "Save meal"}
          </PillButton>
        </div>
      ) : null}
    </div>
  );
}

function ReviewRow({
  item,
  first,
  onGrams,
  onRemove,
}: {
  item: MealItem;
  first: boolean;
  onGrams: (g: number) => void;
  onRemove: () => void;
}) {
  const [grams, setGrams] = useState(fmt(item.grams));
  const [delta, setDelta] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function change(v: string) {
    setGrams(v);
    const g = Number(v);
    if (!v || Number.isNaN(g)) return;
    const next = withGrams(item, g);
    const d = Math.round(next.calories - item.calories);
    onGrams(g);
    if (d !== 0) {
      setDelta(d);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDelta(null), 1400);
    }
  }

  return (
    <>
      {first ? null : <Hair />}
      <div className="flex items-center gap-2 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold">
            {item.name}
            {item.source === "estimated" ? " ~" : ""}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs muted">{Math.round(item.calories)} kcal</span>
            <MacroDot value={`${fmt(item.protein_g)}g`} color="var(--red)" />
            <MacroDot value={`${fmt(item.carbs_g)}g`} color="var(--orange)" />
            <MacroDot value={`${fmt(item.fat_g)}g`} color="var(--blue)" />
          </span>
        </div>
        <AnimatePresence>
          {delta !== null ? (
            <motion.span
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
              className="badge shrink-0"
              style={{
                background: delta > 0 ? "var(--btn)" : "var(--card2)",
                color: delta > 0 ? "var(--btn-ink)" : "var(--ink)",
              }}
            >
              {delta > 0 ? "+" : ""}
              {delta} kcal
            </motion.span>
          ) : null}
        </AnimatePresence>
        <NumberField value={grams} onChange={change} unit="g" label={`Grams of ${item.name}`} decimal />
        <button type="button" onClick={onRemove} aria-label={`Remove ${item.name}`} className="press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ color: "var(--muted)" }}>
          <Trash size={18} />
        </button>
      </div>
    </>
  );
}
