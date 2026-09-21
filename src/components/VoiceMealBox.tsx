"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { saveMeal } from "@/lib/actions";
import type { ParseResult, ParsedItem } from "@/lib/types";

export default function VoiceMealBox({ date }: { date: string }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function parse() {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/parse-meal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Parse failed");
      setParsed(json as ParseResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  function setGrams(i: number, grams: number) {
    if (!parsed) return;
    const items = parsed.items.map((it, idx) => {
      if (idx !== i) return it;
      const k = it.grams > 0 ? grams / it.grams : 0;
      return {
        ...it,
        grams,
        calories: Math.round(it.calories * k),
        protein_g: Math.round(it.protein_g * k * 10) / 10,
        carbs_g: Math.round(it.carbs_g * k * 10) / 10,
        fat_g: Math.round(it.fat_g * k * 10) / 10,
      };
    });
    setParsed({ ...parsed, items });
  }

  function removeItem(i: number) {
    if (!parsed) return;
    setParsed({ ...parsed, items: parsed.items.filter((_, idx) => idx !== i) });
  }

  const totals = (parsed?.items ?? []).reduce(
    (a, i) => ({ cal: a.cal + i.calories, p: a.p + i.protein_g }),
    { cal: 0, p: 0 },
  );

  function save() {
    if (!parsed || !parsed.items.length) return;
    start(async () => {
      try {
        await saveMeal({ date, raw_text: text, items: parsed.items });
        setParsed(null);
        setText("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <section className="card">
      <h2 className="text-lg font-bold mb-1">What did you eat?</h2>
      <p className="text-sm muted mb-3">Tap the box and dictate. Grams or household units both work.</p>
      <textarea
        id="meal-text"
        rows={3}
        placeholder="150 g rice, a bowl of dal, 200 g chicken, 2 eggs, one scoop whey"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex justify-end mt-3">
        <button className="btn btn-primary" type="button" onClick={parse} disabled={busy || !text.trim()}>
          {busy ? "Reading…" : "Parse"}
        </button>
      </div>
      {err && <p className="text-sm text-warn mt-2">{err}</p>}

      <AnimatePresence>
        {parsed && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mt-4 border-t border-line pt-4">
            {parsed.items.length === 0 && <p className="muted text-sm">No food found in that text.</p>}
            <ul className="flex flex-col gap-2">
              {parsed.items.map((it: ParsedItem, i) => (
                <li key={i} className="flex items-center gap-3 bg-surface-2 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{it.name}</div>
                    <div className="text-xs muted">
                      {it.calories} kcal · {it.protein_g} g protein
                      {it.source === "estimated" && <span className="text-warn"> · estimated</span>}
                    </div>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={`Grams of ${it.name}`}
                    value={it.grams}
                    onChange={(e) => setGrams(i, Number(e.target.value) || 0)}
                    className="!w-20 text-right"
                  />
                  <span className="text-xs muted">g</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeItem(i)} aria-label={`Remove ${it.name}`}>×</button>
                </li>
              ))}
            </ul>
            {parsed.assumptions.length > 0 && (
              <p className="text-xs muted mt-3">Assumed: {parsed.assumptions.join(" · ")}</p>
            )}
            {parsed.unparsed.length > 0 && (
              <p className="text-xs text-warn mt-1">Skipped: {parsed.unparsed.join(", ")}</p>
            )}
            <div className="flex items-center justify-between mt-4">
              <div>
                <span className="num text-2xl font-extrabold">{Math.round(totals.cal)}</span>
                <span className="muted text-sm"> kcal · </span>
                <span className="num text-2xl font-extrabold">{Math.round(totals.p)}</span>
                <span className="muted text-sm"> g protein</span>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setParsed(null)}>Discard</button>
                <button className="btn btn-primary btn-sm" type="button" onClick={save} disabled={pending || !parsed.items.length}>
                  {pending ? "Saving…" : "Save meal"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
