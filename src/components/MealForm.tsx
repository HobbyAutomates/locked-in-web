"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { createSavedMeal, saveMeal, searchFoodsForPicker } from "@/lib/actions";
import { foodFromItem, priceItem, wantsCookedIn, type Quantity, type QuantityFood } from "@/lib/quantity";
import { useDictation } from "@/lib/speech";
import type { FoodPreset, FoodSearchHit, MealItem, ParseResult, PresetCategory, SavedMeal } from "@/lib/types";
import { Camera, Drop, Grid, Mic, Search, Spinner, Trash } from "./icons";
import QuantitySheet from "./QuantitySheet";
import { quickLogMeal } from "./PendingMeals";
import { Card, CardButton, ErrorNote, Hair, MacroDot, PillButton, Rise, fmt } from "./ui";

type Tab = "dictate" | "search" | "presets" | "photo";
const TABS: { key: Tab; label: string; Icon: (p: { size?: number }) => React.ReactNode }[] = [
  { key: "dictate", label: "Dictate", Icon: Mic },
  { key: "search", label: "Search", Icon: Search },
  { key: "presets", label: "Presets", Icon: Grid },
  { key: "photo", label: "Photo", Icon: Camera },
];

const CATEGORIES: { key: PresetCategory; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "staple", label: "Staples" },
  { key: "dal", label: "Dal" },
  { key: "sabzi", label: "Sabzi" },
  { key: "protein", label: "Protein" },
  { key: "snack", label: "Snacks" },
  { key: "drink", label: "Drinks" },
  { key: "sweet", label: "Sweets" },
  { key: "fruit", label: "Fruit" },
];

/** Re-price an item after a grams edit (scales linearly, exactly like Android's withGrams). */
function withGrams(item: MealItem, grams: number): MealItem {
  if (!item.grams || item.grams <= 0) return { ...item, grams };
  const k = grams / item.grams;
  const micros: MealItem["micros"] = {};
  for (const [key, v] of Object.entries(item.micros ?? {})) if (v != null) micros[key as keyof NonNullable<MealItem["micros"]>] = Math.round(v * k * 10) / 10;
  return {
    ...item,
    grams,
    calories: item.calories * k,
    protein_g: item.protein_g * k,
    carbs_g: item.carbs_g * k,
    fat_g: item.fat_g * k,
    micros,
    servings: item.servings != null ? Math.round(item.servings * k * 100) / 100 : item.servings,
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

function presetFood(p: FoodPreset): QuantityFood {
  return {
    name: p.label,
    name_hi: p.label_hi,
    food_id: p.food_id,
    per100: { calories: p.calories, protein_g: p.protein_g, carbs_g: p.carbs_g, fat_g: p.fat_g },
    micros: p.micros,
    servings: p.servings,
    defaultServing: p.default_serving,
    source: "table",
    category: p.category,
  };
}

function hitFood(h: FoodSearchHit): QuantityFood {
  return {
    name: h.name,
    name_hi: h.name_hi,
    food_id: h.id,
    per100: { calories: h.calories, protein_g: h.protein_g, carbs_g: h.carbs_g, fat_g: h.fat_g },
    micros: h.micros,
    servings: h.units,
    source: "table",
  };
}

export default function MealForm({ date, savedMeals, presets, onClose }: { date: string; savedMeals: SavedMeal[]; presets: FoodPreset[]; onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dictate");
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
  // The Quantity sheet: which food, and (for a review-row edit) which index it replaces.
  const [sheet, setSheet] = useState<{ food: QuantityFood; initial?: Quantity; replace?: number; cookedFor?: number; restaurant?: boolean } | null>(null);
  const added = useRef<string[]>([]);

  const totalKcal = items.reduce((a, i) => a + Number(i.calories), 0);
  const totalProtein = items.reduce((a, i) => a + Number(i.protein_g), 0);
  const showReview = result !== null || items.length > 0;
  const fats = useMemo(() => presets.filter((p) => p.category === "fat"), [presets]);

  function addItem(item: MealItem, label?: string) {
    setItems((cur) => [...cur, item]);
    if (label) added.current.push(label);
    setError(null);
  }

  async function run() {
    setParsing(true);
    setError(null);
    try {
      const r = await parseMeal(text);
      setResult(r);
      // Dictated items land after anything already picked from presets / search.
      setItems((cur) => [...cur.filter((i) => i.source !== "estimated" || !r.items.some((x) => x.name === i.name)), ...r.items]);
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
      const raw = text.trim() || added.current.join(", ") || savedName || "Meal";
      await saveMeal({ date, raw_text: raw, items });
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

  /** "Cooked in…": the fat becomes its own item and the dish remembers which one. */
  function cookedIn(dishIdx: number, fat: FoodPreset) {
    const tsp = fat.servings.find((s) => /1 tsp/i.test(s.label)) ?? fat.servings[0];
    const fatItem = priceItem({ ...presetFood(fat), defaultServing: tsp?.label ?? null }, tsp ? { unit: "serving", value: 1 } : { unit: "g", value: 5 });
    setItems((cur) => {
      const next = cur.map((x, i) => (i === dishIdx ? { ...x, cooked_in: fat.id } : x));
      next.splice(dishIdx + 1, 0, fatItem);
      return next;
    });
    added.current.push(`${fat.label} (cooked in)`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-3.5 px-4 pb-4 pt-1.5">
        {/* ---- Dictate · Search · Presets · Photo ---- */}
        <Rise index={0}>
          <div className="seg" role="tablist" aria-label="How to add food">
            {TABS.map(({ key, label, Icon }) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="press flex items-center justify-center gap-1.5">
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </Rise>

        {savedMeals.length > 0 && !showReview && tab === "dictate" ? (
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

        {tab === "dictate" ? (
          <DictateCard
            text={text}
            setText={setText}
            parsing={parsing}
            onRun={run}
            showQuick={result === null && items.length === 0}
            onQuick={() => {
              quickLogMeal(text.trim(), date);
              onClose();
            }}
          />
        ) : null}
        {tab === "search" ? <SearchCard onPick={(h) => setSheet({ food: hitFood(h) })} /> : null}
        {tab === "presets" ? (
          <PresetsCard
            presets={presets}
            onPick={(p, q) => {
              const f = presetFood(p);
              if (q) addItem(priceItem(f, q), p.label);
              else setSheet({ food: f });
            }}
            onRestaurant={(p) => setSheet({ food: presetFood(p), restaurant: true })}
          />
        ) : null}
        {tab === "photo" ? (
          <Rise index={1}>
            <Card>
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "var(--btn)", color: "var(--btn-ink)" }}>
                  <Camera size={18} />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold">Photograph your plate</span>
                  <span className="block text-xs muted">Every item with grams, calories, macros and micros — then save it as a meal.</span>
                </span>
              </div>
              <div className="mt-3">
                <Link href="/scan?mode=photo" className="pill press">
                  Open the plate camera
                </Link>
              </div>
            </Card>
          </Rise>
        ) : null}

        <ErrorNote text={error} />

        {showReview ? (
          <>
            <Rise index={2}>
              <p className="px-1 text-[13px] font-semibold muted">Review · tap a quantity to change it</p>
            </Rise>
            <Rise index={3}>
              <Card padding={0}>
                <div className="px-4">
                  {items.map((item, idx) => (
                    <ReviewRow
                      key={`${item.name}-${idx}`}
                      item={item}
                      first={idx === 0}
                      fats={fats}
                      showCookedIn={!item.cooked_in && item.source !== "scan" && wantsCookedIn(item.name) && !fats.some((f) => f.id === item.food_id || f.label === item.name)}
                      onCookedIn={(fat) => cookedIn(idx, fat)}
                      onOpen={() => setSheet({ food: foodFromItem(item), initial: { unit: (item.unit as Quantity["unit"]) === "serving" && item.servings ? "serving" : "g", value: (item.unit as Quantity["unit"]) === "serving" && item.servings ? item.servings : Math.round(item.grams) }, replace: idx })}
                      onGrams={(g) => setItems((cur) => cur.map((x, i) => (i === idx ? withGrams(x, g) : x)))}
                      onRemove={() => setItems((cur) => cur.filter((_, i) => i !== idx))}
                    />
                  ))}
                  {items.length === 0 ? <p className="py-4 text-[13px] muted">No items left. Add some from Dictate, Search or Presets.</p> : null}
                </div>
              </Card>
            </Rise>

            {result && (result.assumptions.length > 0 || result.unparsed.length > 0) ? (
              <Rise index={4}>
                <p className="px-1 text-xs muted">{[...result.assumptions, ...result.unparsed.map((u) => `Ignored: ${u}`)].join(" · ")}</p>
              </Rise>
            ) : null}

            {result ? (
              <Rise index={5}>
                <Card padding={12}>
                  <label className="text-[13px] font-semibold muted" htmlFor="fix">
                    Something wrong? Tell me and I&apos;ll redo it
                  </label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input id="fix" className="field" value={fixText} onChange={(e) => setFixText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fixText.trim() && !fixing && fix()} placeholder="e.g. it was two scoops, and the rice was raw" />
                    <PillButton onClick={fix} disabled={!fixText.trim() || fixing} height={40} className="!w-auto shrink-0 !px-5">
                      {fixing ? "…" : "Fix"}
                    </PillButton>
                  </div>
                </Card>
              </Rise>
            ) : null}

            <Rise index={6}>
              {showSaveAs ? (
                <div className="flex items-center gap-2">
                  <input className="field" value={savedName} aria-label="Name for this repeat meal" onChange={(e) => setSavedName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savedName.trim() && saveRepeat()} placeholder="Name it, e.g. Dinner usual" />
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

      {showReview ? (
        <div className="sticky bottom-0 flex items-center gap-3 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3" style={{ background: "var(--bg)" }}>
          <div className="shrink-0">
            <p className="num text-xl font-extrabold leading-tight">{Math.round(totalKcal)} kcal</p>
            <p className="text-xs muted">{fmt(totalProtein)} g protein</p>
          </div>
          <PillButton onClick={save} disabled={items.length === 0 || saving}>
            {saving ? "Saving…" : `Save meal · ${items.length} item${items.length === 1 ? "" : "s"}`}
          </PillButton>
        </div>
      ) : null}

      <QuantitySheet
        food={sheet?.food ?? null}
        initial={sheet?.initial}
        title={sheet?.replace != null ? "Change the amount" : "How much?"}
        cta={sheet?.replace != null ? "Update" : "Add"}
        restaurant={sheet?.restaurant ?? false}
        onClose={() => setSheet(null)}
        onDone={(item) => {
          const s = sheet;
          setSheet(null);
          if (!s) return;
          if (s.replace != null) setItems((cur) => cur.map((x, i) => (i === s.replace ? { ...item, cooked_in: item.cooked_in ?? x.cooked_in ?? null, source: x.source, food_id: x.food_id } : x)));
          else addItem(item, item.name);
        }}
      />
    </div>
  );
}

// ---- Dictate ----

function DictateCard({ text, setText, parsing, onRun, showQuick, onQuick }: { text: string; setText: (v: string) => void; parsing: boolean; onRun: () => void; showQuick: boolean; onQuick: () => void }) {
  const dictation = useDictation((chunk) => setText((text ? text.replace(/\s+$/, "") + (/[,।]$/.test(text.trim()) ? " " : ", ") : "") + chunk));
  return (
    <Rise index={1}>
      <Card>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label={dictation.listening ? "Stop listening" : "Dictate"}
            aria-pressed={dictation.listening}
            onClick={dictation.toggle}
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: dictation.listening ? "var(--red)" : "var(--btn)", color: dictation.listening ? "#fff" : "var(--btn-ink)" }}
          >
            <Mic size={18} className={dictation.listening ? "flame-breathe" : undefined} />
          </button>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Describe what you ate</span>
            <span className="block text-xs muted">
              {dictation.listening ? `Listening in ${dictation.lang === "hi-IN" ? "Hindi" : "English"}… tap the mic to stop` : dictation.supported ? "Tap the mic, or type. Hindi works too." : "Type, or use your keyboard's mic. Hindi works too."}
            </span>
          </span>
          {dictation.supported ? (
            <button type="button" onClick={dictation.toggleLang} className="chip press shrink-0" style={{ height: 30, fontSize: 12 }} aria-label="Switch dictation language">
              {dictation.lang === "hi-IN" ? "हिंदी" : "EN"}
            </button>
          ) : null}
        </div>
        <textarea className="field mt-3" rows={3} value={text} aria-label="What you ate" onChange={(e) => setText(e.target.value)} placeholder="150 g rice, 100 g dal, 2 eggs — or: दो रोटी, एक कटोरी दाल" />
        {dictation.error ? <p className="mt-1.5 text-xs" style={{ color: "var(--orange)" }}>{dictation.error}</p> : null}
        <div className="mt-3">
          <PillButton onClick={onRun} disabled={!text.trim() || parsing} height={48}>
            {parsing ? "Working out the calories…" : "Work out the calories"}
          </PillButton>
        </div>
        {showQuick ? (
          <div className="mt-2">
            <PillButton soft height={44} disabled={!text.trim() || parsing} onClick={onQuick}>
              Log now, review later
            </PillButton>
          </div>
        ) : null}
        {parsing ? (
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
            <div className="shimmer h-full w-1/2 rounded-full" style={{ background: "var(--ink)" }} />
          </div>
        ) : null}
      </Card>
    </Rise>
  );
}

// ---- Search ----

const SOURCE_LABEL: Record<string, string> = { dish: "INDB", ifct: "IFCT", usda: "USDA", custom: "Curated", off: "OFF" };

function SearchCard({ onPick }: { onPick: (h: FoodSearchHit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FoodSearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    // Debounced; a short query clears the list inside the same timer so no state is set synchronously here.
    const t = setTimeout(() => {
      if (q.trim().length < 2) {
        setHits([]);
        return;
      }
      setBusy(true);
      searchFoodsForPicker(q, 14)
        .then((r) => live && setHits(r))
        .catch((e) => live && setErr(e instanceof Error ? e.message : "Search failed"))
        .finally(() => live && setBusy(false));
    }, q.trim().length < 2 ? 0 : 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <Rise index={1}>
      <Card padding={0}>
        <div className="px-4 pb-1 pt-3.5">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--card2)" }}>
            <Search size={16} className="muted" />
            <input className="w-full bg-transparent text-[15px] outline-none" style={{ border: 0, color: "var(--ink)" }} value={q} autoFocus onChange={(e) => setQ(e.target.value.slice(0, 60))} placeholder="Roti, dal tadka, paneer, अंडा, Maggi…" aria-label="Search foods" enterKeyHint="search" />
            {busy ? <Spinner size={14} /> : null}
          </div>
          <p className="mt-1.5 text-[11px] muted">3,000+ Indian and Western foods · English, Hinglish or हिंदी</p>
        </div>
        <div className="px-4">
          {err ? <p className="py-3 text-[13px]" style={{ color: "var(--red)" }}>{err}</p> : null}
          {q.trim().length >= 2 && !busy && hits.length === 0 && !err ? <p className="py-3.5 text-[13px] muted">Nothing matches “{q}” — try Dictate, which can estimate it.</p> : null}
          {hits.map((h, i) => (
            <div key={h.id}>
              {i > 0 ? <Hair /> : null}
              <button type="button" className="press flex w-full items-center gap-3 py-3 text-left" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => onPick(h)}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold">
                    {h.name}
                    {h.name_hi ? <span className="ml-1.5 text-[13px] font-medium muted">{h.name_hi}</span> : null}
                  </span>
                  <span className="text-xs muted">
                    {Math.round(h.calories)} kcal · {fmt(h.protein_g)} g P per 100 g{h.units[0] ? ` · ${h.units[0].label} ${Math.round(h.units[0].grams)} g` : ""}
                  </span>
                </span>
                <span className="badge shrink-0" style={{ background: "var(--card2)", color: "var(--muted)", fontSize: 10 }}>
                  {SOURCE_LABEL[h.source] ?? h.source}
                </span>
              </button>
            </div>
          ))}
        </div>
      </Card>
    </Rise>
  );
}

// ---- Presets ----

function PresetsCard({ presets, onPick, onRestaurant }: { presets: FoodPreset[]; onPick: (p: FoodPreset, q: Quantity | null) => void; onRestaurant: (p: FoodPreset) => void }) {
  const [cat, setCat] = useState<PresetCategory>("breakfast");
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => presets.filter((p) => p.category === cat).sort((a, b) => a.sort - b.sort), [presets, cat]);
  // v2.0: common outside dishes, shown at the top of Snacks and Protein; each opens as a restaurant portion.
  const outside = useMemo(() => presets.filter((p) => p.category === "restaurant").sort((a, b) => a.sort - b.sort), [presets]);
  if (!presets.length) {
    return (
      <Rise index={1}>
        <Card>
          <p className="text-[15px] font-semibold">Presets are loading in</p>
          <p className="mt-1 text-[13px] muted">The Indian food presets are not on this account yet — use Search or Dictate for now.</p>
        </Card>
      </Rise>
    );
  }
  return (
    <Rise index={1}>
      <div className="-mx-4 overflow-x-auto px-4" style={{ scrollbarWidth: "none" }}>
        <div className="flex w-max gap-1.5 pb-1">
          {CATEGORIES.map((c) => (
            <button key={c.key} type="button" aria-pressed={cat === c.key} className="chip press" style={{ height: 34 }} onClick={() => { setCat(c.key); setOpen(null); }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {(cat === "snack" || cat === "protein") && outside.length ? (
        <div className="mt-2.5">
          <p className="px-1 text-[12px] font-bold muted">Restaurant</p>
          <div className="-mx-4 mt-1.5 overflow-x-auto px-4" style={{ scrollbarWidth: "none" }}>
            <div className="flex w-max gap-1.5 pb-1">
              {outside.map((p) => (
                <button key={p.id} type="button" className="chip press" style={{ height: 34, border: "1.5px solid var(--hair)", background: "var(--card)" }} onClick={() => onRestaurant(p)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {list.map((p) => {
          const isOpen = open === p.id;
          const def = p.servings.find((s) => s.label === p.default_serving) ?? p.servings[0];
          const defKcal = def ? Math.round((p.calories * def.grams) / 100) : null;
          return (
            <div key={p.id} className={isOpen ? "col-span-2" : ""}>
              <button type="button" aria-expanded={isOpen} className="card press w-full text-left" style={{ padding: 12, borderRadius: 16 }} onClick={() => setOpen(isOpen ? null : p.id)}>
                <span className="block truncate text-[14px] font-semibold">{p.label}</span>
                <span className="block truncate text-[12px] muted">
                  {p.label_hi ? `${p.label_hi} · ` : ""}
                  {def ? `${def.label}${defKcal != null ? ` · ${defKcal} kcal` : ""}` : "per 100 g"}
                </span>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.span className="mt-2.5 flex flex-wrap gap-1.5" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.16 }}>
                      {p.servings.map((s) => (
                        <span
                          key={s.label}
                          role="button"
                          tabIndex={0}
                          className="chip press"
                          style={{ height: 32, fontSize: 12, background: s.label === p.default_serving ? "var(--btn)" : "var(--card2)", color: s.label === p.default_serving ? "var(--btn-ink)" : "var(--ink)" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPick({ ...p, default_serving: s.label }, { unit: "serving", value: 1 });
                            setOpen(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              onPick({ ...p, default_serving: s.label }, { unit: "serving", value: 1 });
                              setOpen(null);
                            }
                          }}
                        >
                          {s.label} · {Math.round((p.calories * s.grams) / 100)} kcal
                        </span>
                      ))}
                      <span
                        role="button"
                        tabIndex={0}
                        className="chip press"
                        style={{ height: 32, fontSize: 12, border: "1.5px dashed var(--hair)", background: "transparent" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPick(p, null);
                          setOpen(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            onPick(p, null);
                            setOpen(null);
                          }
                        }}
                      >
                        Custom…
                      </span>
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </button>
            </div>
          );
        })}
      </div>
    </Rise>
  );
}

// ---- Review row ----

function ReviewRow({
  item,
  first,
  fats,
  showCookedIn,
  onCookedIn,
  onOpen,
  onGrams,
  onRemove,
}: {
  item: MealItem;
  first: boolean;
  fats: FoodPreset[];
  showCookedIn: boolean;
  onCookedIn: (fat: FoodPreset) => void;
  onOpen: () => void;
  onGrams: (g: number) => void;
  onRemove: () => void;
}) {
  const [delta, setDelta] = useState<number | null>(null);
  // Derived-state pattern: when the priced calories change, remember the jump for a moment.
  const [prevCal, setPrevCal] = useState(item.calories);
  if (item.calories !== prevCal) {
    const d = Math.round(item.calories - prevCal);
    setPrevCal(item.calories);
    if (d !== 0) setDelta(d);
  }
  useEffect(() => {
    if (delta === null) return;
    const t = setTimeout(() => setDelta(null), 1400);
    return () => clearTimeout(t);
  }, [delta]);
  void onGrams;

  const qty = item.unit === "serving" && item.servings ? `${fmt(item.servings)} serving${item.servings === 1 ? "" : "s"}` : `${fmt(Math.round(item.grams))} g`;
  return (
    <>
      {first ? null : <Hair />}
      <div className="flex items-center gap-2 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold">
            {item.name}
            {item.source === "estimated" ? " ~" : ""}
            {item.source === "scan" ? <span className="badge ml-1.5" style={{ background: "var(--card2)", color: "var(--muted)", fontSize: 10, padding: "2px 7px" }}>scan</span> : null}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs muted">{Math.round(item.calories)} kcal</span>
            <MacroDot value={`${fmt(item.protein_g)}g`} color="var(--red)" />
            <MacroDot value={`${fmt(item.carbs_g)}g`} color="var(--orange)" />
            <MacroDot value={`${fmt(item.fat_g)}g`} color="var(--blue)" />
          </span>
          {showCookedIn && fats.length ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-[11px] muted">
                <Drop size={12} />
                Cooked in…
              </span>
              {fats.slice(0, 4).map((f) => (
                <button key={f.id} type="button" className="chip press" style={{ height: 26, fontSize: 11, padding: "0 10px" }} onClick={() => onCookedIn(f)}>
                  {f.label}
                </button>
              ))}
            </span>
          ) : null}
          {item.cooked_in ? <span className="text-[11px] muted">{item.cooked_in === "restaurant" ? "Restaurant portion · oil included" : `Cooked in ${fats.find((f) => f.id === item.cooked_in)?.label ?? item.cooked_in}`}</span> : null}
        </div>
        <AnimatePresence>
          {delta !== null ? (
            <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 420, damping: 22 }} className="badge shrink-0" style={{ background: delta > 0 ? "var(--btn)" : "var(--card2)", color: delta > 0 ? "var(--btn-ink)" : "var(--ink)" }}>
              {delta > 0 ? "+" : ""}
              {delta} kcal
            </motion.span>
          ) : null}
        </AnimatePresence>
        <button type="button" onClick={onOpen} aria-label={`Change the amount of ${item.name}`} className="numfield num press shrink-0" style={{ width: "auto", minWidth: 66, maxWidth: 120, fontSize: 13, whiteSpace: "nowrap" }}>
          {qty}
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${item.name}`} className="press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ color: "var(--muted)" }}>
          <Trash size={18} />
        </button>
      </div>
    </>
  );
}

