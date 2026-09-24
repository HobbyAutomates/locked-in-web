"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { createSavedMeal, saveMeal, searchFoodsForPicker } from "@/lib/actions";
import { postJson } from "@/lib/image";
import { looksLikeSentence } from "@/lib/mealText";
import { applyRestaurant, foodFromItem, priceItem, restaurantOil, wantsCookedIn, type Quantity, type QuantityFood } from "@/lib/quantity";
import { useDictation } from "@/lib/speech";
import { PLATE_PREFILL_KEY, type PlatePrefill } from "@/lib/platePrefill";
import type { FoodPreset, FoodSearchHit, MealItem, ParseResult, PresetCategory, PresetServing, SavedMeal } from "@/lib/types";
import { Close, Drop, Mic, Search, Spinner } from "./icons";
import FoodImage, { FoodFallback, type FoodImageKind } from "./FoodImage";
import QuantitySheet from "./QuantitySheet";
import { saveWhenReady, type PlateJob } from "./PendingMeals";
import { BottomSheet, ErrorNote, Hair, MacroDot, PillButton, fmt } from "./ui";

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
type Cat = PresetCategory | "yours";

const SOURCE_LABEL: Record<string, string> = { dish: "INDB", ifct: "IFCT", usda: "USDA", custom: "Curated", off: "OFF" };

/**
 * One plate row: the priced item plus the serving sizes it came with (so the Quantity sheet can
 * offer them again). v2.4: `image` / `imageKind` are the row's picture (display only).
 */
type Row = { key: number; item: MealItem; servings?: PresetServing[]; servingLabel?: string | null; category?: string | null; image?: string | null; imageKind?: FoodImageKind };
type Job = { id: number; kind: "parse" | "photo"; label: string };

async function parseMeal(text: string, correction?: string, previous?: MealItem[]): Promise<ParseResult> {
  return postJson<ParseResult>("/api/parse-meal", { text, correction, previous });
}

/** Parsed items carry `input` / `matched_from`; the plate and saved meals only want the MealItem. */
function plain(items: (MealItem & { input?: string; matched_from?: string })[]): MealItem[] {
  return items.map(({ input, matched_from, ...rest }) => {
    void input;
    void matched_from;
    return rest;
  });
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
    defaultServing: h.units[0]?.label ?? null,
    source: "table",
  };
}

/** The default serving of a food: its preset / first unit, else 100 g. */
function defaultOf(f: QuantityFood): { q: Quantity; label: string | null } {
  const s = f.servings.find((x) => x.label === f.defaultServing) ?? f.servings[0];
  return s && s.grams > 0 ? { q: { unit: "serving", value: 1 }, label: s.label } : { q: { unit: "g", value: 100 }, label: null };
}

function qtyText(r: Row): string {
  const it = r.item;
  if (it.unit === "serving" && it.servings != null && r.servingLabel) return `${fmt(it.servings)} ${r.servingLabel.replace(/^1\s+/, "")}`;
  return `${fmt(Math.round(it.grams))} g`;
}

/**
 * Add food — one screen. A search bar (type, or tap the mic and say it — v2.4: scanning lives only
 * in the Scan tab), the preset grid underneath, and the plate as a sticky panel at the bottom. Tapping a preset or a
 * search hit adds it at its default serving; amounts are changed on the plate row. A sentence
 * ("2 roti, ek katori dal") gets a "Work it out" button that parses and appends. Saving while a
 * parse or photo is still running closes the form and finishes the save in the background.
 */
export default function MealForm({
  date,
  savedMeals,
  presets,
  usage,
  onClose,
  search = searchFoodsForPicker,
  prefill = false,
}: {
  date: string;
  savedMeals: SavedMeal[];
  presets: FoodPreset[];
  /** food_id → times eaten in the last 60 days. */
  usage: Record<string, number>;
  onClose: () => void;
  search?: (q: string, limit?: number) => Promise<FoodSearchHit[]>;
  /** Opened from a scan's "Add to plate": start with those items on the plate. */
  prefill?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [rawParts, setRawParts] = useState<string[]>([]);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [editKey, setEditKey] = useState<number | null>(null);
  const [cookedKey, setCookedKey] = useState<number | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixText, setFixText] = useState("");
  const [fixing, setFixing] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatName, setRepeatName] = useState("");
  const seq = useRef(1);
  const tapped = useRef<string[]>([]);
  const promises = useRef(new Map<number, Promise<PlateJob>>());
  const handedOff = useRef(false);
  const barRef = useRef<HTMLInputElement>(null);

  const items = rows.map((r) => r.item);
  const totalKcal = items.reduce((a, i) => a + Number(i.calories), 0);
  const totalProtein = items.reduce((a, i) => a + Number(i.protein_g), 0);
  const fats = useMemo(() => presets.filter((p) => p.category === "fat"), [presets]);
  const editing = rows.find((r) => r.key === editKey) ?? null;
  const sentence = looksLikeSentence(text);
  const typing = text.trim().length >= 2;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  // Scan → "Add to plate": the report's serving (or the plate's items) arrive on the plate.
  useEffect(() => {
    if (!prefill) return;
    let data: PlatePrefill | null = null;
    try {
      data = JSON.parse(sessionStorage.getItem(PLATE_PREFILL_KEY) || "null") as PlatePrefill | null;
      sessionStorage.removeItem(PLATE_PREFILL_KEY);
    } catch {
      data = null;
    }
    if (!data?.items?.length) return;
    const d = data;
    // Hydrating from storage once on mount is the point of this effect.
    setRows((cur) => [...cur, ...d.items.map((item) => ({ item, key: seq.current++, image: item.image_url ?? null, imageKind: d.kind ?? "generic" }))]);
    if (d.photo_path) setPhotoPath(d.photo_path);
    tapped.current.push(d.label);
  }, [prefill]);

  function addRows(next: Omit<Row, "key">[]) {
    setRows((cur) => [...cur, ...next.map((r) => ({ ...r, key: seq.current++ }))]);
    setError(null);
  }

  function say(msg: string) {
    setToast({ id: seq.current++, text: msg });
  }

  /** Tap = on the plate at the default serving (a Restaurant preset as a restaurant portion). */
  function addFood(f: QuantityFood, restaurant = false, image: { src?: string | null; kind?: FoodImageKind } = {}) {
    const d = defaultOf(f);
    const base = priceItem(f, d.q);
    const item = restaurant ? applyRestaurant(base, restaurantOil(f.name, f.category)) : base;
    addRows([{ item, servings: f.servings, servingLabel: d.label, category: f.category ?? null, image: image.src ?? null, imageKind: image.kind ?? "generic" }]);
    tapped.current.push(f.name);
    say(`Added · ${d.label ?? "100 g"}${restaurant ? " · restaurant" : ""} · ${Math.round(item.calories)} kcal`);
  }

  function addSaved(sm: SavedMeal) {
    addRows(sm.items.map((item) => ({ item, image: item.image_url ?? null })));
    tapped.current.push(sm.name);
    say(`Added ${sm.name} · ${Math.round(sm.calories)} kcal`);
  }

  function startJob(kind: Job["kind"], label: string, p: Promise<PlateJob>) {
    const id = seq.current++;
    promises.current.set(id, p);
    setJobs((j) => [...j, { id, kind, label }]);
    p.then((r) => {
      if (handedOff.current) return;
      addRows(r.items.map((item) => ({ item, image: item.image_url ?? null })));
      if (r.notes?.length) setNotes((n) => [...n, ...(r.notes ?? [])]);
      if (r.photo_path) setPhotoPath((pp) => pp ?? r.photo_path ?? null);
    })
      .catch((e) => {
        if (!handedOff.current) setError(e instanceof Error ? e.message : "Could not work that out");
      })
      .finally(() => {
        promises.current.delete(id);
        setJobs((j) => j.filter((x) => x.id !== id));
      });
  }

  /** "Work it out": parse the bar's sentence and append; the words stay for the meal's raw_text. */
  function workItOut(input: string) {
    const t = input.trim();
    if (!t) return;
    setText("");
    setRawParts((p) => [...p, t]);
    startJob(
      "parse",
      t,
      parseMeal(t).then((r) => ({ items: plain(r.items), notes: [...r.assumptions, ...r.unparsed.map((u) => `Ignored: ${u}`)] })),
    );
  }

  const dictation = useDictation((chunk) => {
    const cur = text.trim();
    const next = (cur ? cur + (/[,।]$/.test(cur) ? " " : ", ") : "") + chunk;
    if (looksLikeSentence(next)) workItOut(next);
    else setText(next);
  });

  async function save() {
    const raw = [...rawParts, ...tapped.current].join(", ") || items.map((i) => i.name).join(", ") || "Meal";
    if (promises.current.size) {
      // Still working something out: close now, Home shows the pending row, the save lands when it's done.
      handedOff.current = true;
      saveWhenReady({ label: jobs.map((j) => j.label).join(", ") || raw, date, raw_text: raw, items, photo_path: photoPath, jobs: [...promises.current.values()] });
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveMeal({ date, raw_text: raw, items, photo_path: photoPath });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  }

  async function fix() {
    setFixing(true);
    setError(null);
    try {
      const r = await parseMeal(rawParts.join(", ") || items.map((i) => i.name).join(", "), fixText, items);
      setRows(plain(r.items).map((item) => ({ item, key: seq.current++, image: item.image_url ?? null })));
      setNotes([...r.assumptions, ...r.unparsed.map((u) => `Ignored: ${u}`)]);
      setFixText("");
      setFixOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not redo that");
    } finally {
      setFixing(false);
    }
  }

  async function saveRepeat() {
    try {
      await createSavedMeal({ name: repeatName.trim(), items });
      setRepeatOpen(false);
      say(`Saved "${repeatName.trim()}" — it's under Yours`);
      setRepeatName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that meal");
      setRepeatOpen(false);
    }
  }

  /** "Cooked in…": the fat becomes its own row right after the dish, and the dish remembers which one. */
  function cookedIn(key: number, fat: FoodPreset) {
    const tsp = fat.servings.find((s) => /1 tsp/i.test(s.label)) ?? fat.servings[0];
    const food = { ...presetFood(fat), defaultServing: tsp?.label ?? null };
    const fatItem = priceItem(food, tsp ? { unit: "serving", value: 1 } : { unit: "g", value: 5 });
    setRows((cur) => {
      const idx = cur.findIndex((r) => r.key === key);
      if (idx < 0) return cur;
      const next = cur.map((r) => (r.key === key ? { ...r, item: { ...r.item, cooked_in: fat.id } } : r));
      next.splice(idx + 1, 0, { key: seq.current++, item: fatItem, servings: fat.servings, servingLabel: tsp?.label ?? null, category: "fat" });
      return next;
    });
    tapped.current.push(`${fat.label} (cooked in)`);
    setCookedKey(null);
  }

  const showPlate = rows.length > 0 || jobs.length > 0;
  const editFood = editing ? { ...foodFromItem(editing.item, editing.servings ?? []), defaultServing: editing.servingLabel ?? null } : null;
  const editInitial: Quantity | undefined = editing
    ? editing.item.unit === "serving" && editing.item.servings && editing.servingLabel
      ? { unit: "serving", value: editing.item.servings }
      : { unit: "g", value: Math.round(editing.item.grams) }
    : undefined;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3 px-4 pb-5 pt-1.5">
        {/* ---- the bar: search / say it / photo ---- */}
        <div className="flex items-center gap-2">
          <div className="searchbar min-w-0 flex-1">
            <Search size={17} className="muted shrink-0" />
            <input
              ref={barRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 300))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && sentence) workItOut(text);
              }}
              placeholder="Search or say what you ate…"
              aria-label="Search or say what you ate"
              enterKeyHint={sentence ? "done" : "search"}
            />
            {text ? (
              <button type="button" aria-label="Clear" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full muted" onClick={() => setText("")}>
                <Close size={15} />
              </button>
            ) : null}
            {dictation.supported ? (
              <button type="button" onClick={dictation.toggleLang} className="hit press shrink-0 px-1 text-[12px] font-bold muted" aria-label={`Dictation language: ${dictation.lang === "hi-IN" ? "Hindi" : "English"}. Tap to switch.`}>
                {dictation.lang === "hi-IN" ? "हिं" : "EN"}
              </button>
            ) : null}
            <button
              type="button"
              aria-label={dictation.listening ? "Stop listening" : "Say what you ate"}
              aria-pressed={dictation.listening}
              onClick={dictation.toggle}
              className="press grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{ background: dictation.listening ? "var(--red)" : "var(--card2)", color: dictation.listening ? "#fff" : "var(--ink)" }}
            >
              <Mic size={18} className={dictation.listening ? "flame-breathe" : undefined} />
            </button>
          </div>
        </div>
        {dictation.listening ? <p className="-mt-1 px-1 text-xs muted">Listening in {dictation.lang === "hi-IN" ? "Hindi" : "English"}… tap the mic to stop.</p> : null}
        {dictation.error ? <p className="-mt-1 px-1 text-xs" style={{ color: "var(--orange)" }}>{dictation.error}</p> : null}

        {sentence ? (
          <PillButton height={48} onClick={() => workItOut(text)}>
            Work it out
          </PillButton>
        ) : null}

        <ErrorNote text={error} />

        {typing ? (
          <SearchResults key="results" query={text} search={search} sentence={sentence} onPick={(h) => addFood(hitFood(h), false, { src: h.image_url ?? null, kind: h.source === "off" ? "product" : "generic" })} onWorkItOut={() => workItOut(text)} />
        ) : (
          <PresetGrid presets={presets} savedMeals={savedMeals} usage={usage} onPreset={(p) => addFood(presetFood(p), p.category === "restaurant", { src: p.image_url ?? null, kind: "preset" })} onSaved={addSaved} onEmpty={() => barRef.current?.focus()} />
        )}
      </div>

      {/* ---- the plate ---- */}
      {showPlate ? (
        <div className="plate-panel">
          <AnimatePresence>
            {toast ? (
              <motion.div
                key={toast.id}
                className="pointer-events-none absolute inset-x-0 flex justify-center"
                style={{ bottom: "calc(100% + 10px)" }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
              >
                <span role="status" className="badge" style={{ background: "var(--btn)", color: "var(--btn-ink)", padding: "8px 14px", fontSize: 13, boxShadow: "var(--shadow)" }}>
                  {toast.text}
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <p className="text-[15px] font-bold">
              Your plate <span className="font-medium muted">· {rows.length}</span>
            </p>
            <span className="flex items-center gap-3">
              {rawParts.length && rows.length ? (
                <button type="button" className="hit press text-[13px] font-semibold muted" onClick={() => setFixOpen(true)}>
                  Fix
                </button>
              ) : null}
              {rows.length ? (
                <button type="button" className="hit press text-[13px] font-semibold muted" onClick={() => setRepeatOpen(true)}>
                  Save as a repeat meal
                </button>
              ) : null}
            </span>
          </div>
          <div className="overflow-y-auto px-4" style={{ maxHeight: "max(120px, calc(45vh - 128px))" }}>
            {rows.map((r, idx) => (
              <PlateRow
                key={r.key}
                row={r}
                first={idx === 0}
                fatLabel={r.item.cooked_in && r.item.cooked_in !== "restaurant" ? fats.find((f) => f.id === r.item.cooked_in)?.label ?? r.item.cooked_in : null}
                showCookedIn={fats.length > 0 && !r.item.cooked_in && r.item.source !== "scan" && r.category !== "fat" && wantsCookedIn(r.item.name, r.category) && !fats.some((f) => f.food_id === r.item.food_id)}
                onCookedIn={() => setCookedKey(r.key)}
                onOpen={() => setEditKey(r.key)}
                onRemove={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
              />
            ))}
            {jobs.map((j, i) => (
              <div key={j.id}>
                {rows.length || i > 0 ? <Hair /> : null}
                <div className="flex items-center gap-2.5 py-3">
                  <Spinner size={16} />
                  <span className="min-w-0 flex-1 truncate text-[13px] muted">{j.kind === "photo" ? "Estimating your plate…" : `Working out “${j.label}”…`}</span>
                </div>
              </div>
            ))}
            {notes.length ? <p className="pb-2 text-xs muted">{notes.join(" · ")}</p> : null}
          </div>
          <div className="flex items-center gap-3 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-2.5">
            <div className="shrink-0">
              <p className="num text-xl font-extrabold leading-tight">{Math.round(totalKcal)} kcal</p>
              <p className="text-xs muted">{fmt(Math.round(totalProtein * 10) / 10)} g protein</p>
            </div>
            <PillButton onClick={save} disabled={saving || (rows.length === 0 && jobs.length === 0)}>
              {saving ? "Saving…" : `Save · ${rows.length + jobs.length} item${rows.length + jobs.length === 1 ? "" : "s"}`}
            </PillButton>
          </div>
        </div>
      ) : null}

      <QuantitySheet
        food={editFood}
        initial={editInitial}
        title="Change the amount"
        cta="Update"
        onClose={() => setEditKey(null)}
        onDone={(item) => {
          const key = editKey;
          setEditKey(null);
          setRows((cur) => cur.map((r) => (r.key === key ? { ...r, item: { ...item, cooked_in: item.cooked_in ?? r.item.cooked_in ?? null, source: r.item.source, food_id: r.item.food_id } } : r)));
        }}
      />

      <BottomSheet open={cookedKey !== null} title="Cooked in…" subtitle="Adds 1 tsp of it as its own item on the plate." onClose={() => setCookedKey(null)}>
        <div className="flex flex-col">
          {fats.map((f, i) => {
            const tsp = f.servings.find((s) => /1 tsp/i.test(s.label)) ?? f.servings[0];
            const kcal = Math.round((f.calories * (tsp?.grams ?? 5)) / 100);
            return (
              <div key={f.id}>
                {i > 0 ? <Hair /> : null}
                <button type="button" className="press flex min-h-[48px] w-full items-center gap-3 py-2 text-left" onClick={() => cookedKey !== null && cookedIn(cookedKey, f)}>
                  <span style={{ color: "var(--orange)" }}>
                    <Drop size={18} />
                  </span>
                  <span className="flex-1 text-[15px] font-semibold">
                    {f.label}
                    {f.label_hi ? <span className="ml-1.5 text-[13px] font-medium muted">{f.label_hi}</span> : null}
                  </span>
                  <span className="text-xs muted">
                    {tsp?.label ?? "5 g"} · {kcal} kcal
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet open={fixOpen} title="Fix the plate" subtitle="Say what's wrong and it's redone." onClose={() => setFixOpen(false)} primary={{ label: fixing ? "Redoing…" : "Redo", onClick: () => void fix(), disabled: !fixText.trim() || fixing }}>
        <input className="field" value={fixText} autoFocus aria-label="What's wrong" onChange={(e) => setFixText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fixText.trim() && !fixing && void fix()} placeholder="e.g. it was two scoops, and the rice was raw" />
      </BottomSheet>

      <BottomSheet open={repeatOpen} title="Save as a repeat meal" subtitle="It shows up first under Yours, one tap to add." onClose={() => setRepeatOpen(false)} primary={{ label: "Save", onClick: () => void saveRepeat(), disabled: !repeatName.trim() }}>
        <input className="field" value={repeatName} autoFocus maxLength={40} aria-label="Name for this repeat meal" onChange={(e) => setRepeatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && repeatName.trim() && void saveRepeat()} placeholder="Name it, e.g. Dinner usual" />
      </BottomSheet>
    </div>
  );
}

/** The item that stands for a saved meal in its picture: the biggest one. */
function topItem(sm: SavedMeal): MealItem | undefined {
  return [...sm.items].sort((a, b) => Number(b.calories) - Number(a.calories))[0];
}
function topItemName(sm: SavedMeal): string {
  return topItem(sm)?.name ?? sm.name;
}
function topItemImage(sm: SavedMeal): string | null {
  return topItem(sm)?.image_url ?? null;
}

// ---- the preset grid (bar empty) ----

function PresetGrid({
  presets,
  savedMeals,
  usage,
  onPreset,
  onSaved,
  onEmpty,
}: {
  presets: FoodPreset[];
  savedMeals: SavedMeal[];
  usage: Record<string, number>;
  onPreset: (p: FoodPreset) => void;
  onSaved: (sm: SavedMeal) => void;
  onEmpty: () => void;
}) {
  const freq = (p: FoodPreset) => usage[p.food_id] ?? 0;
  const bySort = (a: FoodPreset, b: FoodPreset) => freq(b) - freq(a) || a.sort - b.sort;
  const model = useMemo(() => {
    const seen = new Set<string>();
    const yours = presets
      .filter((p) => p.category !== "fat" && (usage[p.food_id] ?? 0) > 0)
      .sort((a, b) => (usage[b.food_id] ?? 0) - (usage[a.food_id] ?? 0) || a.sort - b.sort)
      .filter((p) => (seen.has(p.food_id) ? false : (seen.add(p.food_id), true)))
      .slice(0, 8);
    const catUse = new Map<string, number>();
    for (const p of presets) catUse.set(p.category, (catUse.get(p.category) ?? 0) + (usage[p.food_id] ?? 0));
    const cats = CATEGORIES.filter((c) => presets.some((p) => p.category === c.key)).sort((a, b) => (catUse.get(b.key) ?? 0) - (catUse.get(a.key) ?? 0));
    const restaurant = presets.some((p) => p.category === "restaurant");
    const chips: { key: Cat; label: string }[] = [...(yours.length || savedMeals.length ? [{ key: "yours" as Cat, label: "Yours" }] : []), ...cats, ...(restaurant ? [{ key: "restaurant" as Cat, label: "Restaurant" }] : [])];
    const first: Cat = yours.length || savedMeals.length ? "yours" : cats[0] && (catUse.get(cats[0].key) ?? 0) > 0 ? cats[0].key : "breakfast";
    return { yours, chips, first };
  }, [presets, usage, savedMeals]);
  const [picked, setPicked] = useState<Cat | null>(null);
  const cat: Cat = picked && model.chips.some((c) => c.key === picked) ? picked : model.first;

  if (!presets.length && !savedMeals.length) {
    return (
      <div className="card flex flex-col items-start gap-3">
        <p className="text-[15px]">Search for a food or say what you ate.</p>
        <PillButton soft height={44} onClick={onEmpty}>
          Start typing
        </PillButton>
      </div>
    );
  }

  const list = cat === "yours" ? model.yours : presets.filter((p) => p.category === cat).sort(bySort);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="-mx-4 overflow-x-auto px-4 py-1" style={{ scrollbarWidth: "none" }}>
        <div className="flex w-max gap-1.5" role="radiogroup" aria-label="Food categories">
          {model.chips.map((c) => (
            <button key={c.key} type="button" role="radio" aria-checked={cat === c.key} className="chip press" style={{ height: 36 }} onClick={() => setPicked(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cat === "yours"
          ? savedMeals.map((sm) => (
              <button key={sm.id} type="button" className="card press flex w-full items-center gap-2.5 text-left" style={{ padding: 10, borderRadius: 16, minHeight: 60 }} onClick={() => onSaved(sm)}>
                <FoodImage name={topItemName(sm)} src={sm.image_url ?? topItemImage(sm)} size={40} fallback={<FoodFallback size={40} />} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{sm.name}</span>
                  <span className="block truncate text-[12px] muted">
                    Repeat meal · {Math.round(sm.calories)} kcal · {fmt(sm.protein_g)} g P
                  </span>
                </span>
              </button>
            ))
          : null}
        {list.map((p) => {
          const def = p.servings.find((s) => s.label === p.default_serving) ?? p.servings[0];
          const kcal = Math.round((p.calories * (def?.grams ?? 100)) / 100);
          return (
            <button key={p.id} type="button" className="card press flex w-full items-center gap-2.5 text-left" style={{ padding: 10, borderRadius: 16, minHeight: 60 }} onClick={() => onPreset(p)} aria-label={`Add ${p.label}, ${def?.label ?? "100 g"}, ${kcal} kcal`}>
              <FoodImage name={p.label} kind="preset" src={p.image_url} size={40} fallback={<FoodFallback size={40} category={p.category} />} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{p.label}</span>
                <span className="block truncate text-[12px] muted">
                  {p.label_hi ? `${p.label_hi} · ` : ""}
                  {def?.label ?? "100 g"} · {kcal} kcal
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- search results (bar has text) ----

function SearchResults({
  query,
  search,
  sentence,
  onPick,
  onWorkItOut,
}: {
  query: string;
  search: (q: string, limit?: number) => Promise<FoodSearchHit[]>;
  sentence: boolean;
  onPick: (h: FoodSearchHit) => void;
  onWorkItOut: () => void;
}) {
  const [hits, setHits] = useState<FoodSearchHit[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setBusy(true);
      setErr(null);
      search(query.slice(0, 60), 14)
        .then((r) => live && setHits(r))
        .catch((e) => live && setErr(e instanceof Error ? e.message : "Search failed"))
        .finally(() => live && setBusy(false));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, search]);

  if (!busy && !err && hits.length === 0) {
    return sentence ? null : (
      <div className="card flex flex-col items-start gap-3">
        <p className="text-[15px]">Nothing in the food table matches “{query.trim()}” — it can still be estimated.</p>
        <PillButton soft height={44} onClick={onWorkItOut}>
          Estimate it
        </PillButton>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="px-4">
        {err ? <p className="py-3 text-[13px]" style={{ color: "var(--red)" }}>{err}</p> : null}
        {busy && hits.length === 0 ? (
          <p className="flex items-center gap-2 py-3.5 text-[13px] muted">
            <Spinner size={14} /> Searching 3,000+ foods…
          </p>
        ) : null}
        {hits.map((h, i) => {
          const u = h.units[0];
          const kcal = Math.round((h.calories * (u?.grams ?? 100)) / 100);
          return (
            <div key={h.id}>
              {i > 0 ? <Hair /> : null}
              <button type="button" className="press flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left" style={{ background: "none", border: 0, color: "var(--ink)" }} onClick={() => onPick(h)}>
                <FoodImage name={h.name} kind={h.source === "off" ? "product" : "generic"} src={h.image_url} size={40} fallback={<FoodFallback size={40} />} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold">
                    {h.name}
                    {h.name_hi ? <span className="ml-1.5 text-[13px] font-medium muted">{h.name_hi}</span> : null}
                  </span>
                  <span className="text-xs muted">
                    {u ? u.label : "100 g"} · {kcal} kcal · {fmt(Math.round(((h.protein_g * (u?.grams ?? 100)) / 100) * 10) / 10)} g P
                  </span>
                </span>
                <span className="badge shrink-0" style={{ background: "var(--card2)", color: "var(--muted)", fontSize: 10 }}>
                  {SOURCE_LABEL[h.source] ?? h.source}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- a plate row ----

function PlateRow({
  row,
  first,
  fatLabel,
  showCookedIn,
  onCookedIn,
  onOpen,
  onRemove,
}: {
  row: Row;
  first: boolean;
  fatLabel: string | null;
  showCookedIn: boolean;
  onCookedIn: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const item = row.item;
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

  return (
    <>
      {first ? null : <Hair />}
      <div className="flex items-center gap-2.5 py-2.5">
        <FoodImage name={item.name} kind={row.imageKind ?? (item.source === "scan" ? "product" : "generic")} src={row.image ?? item.image_url} size={40} fallback={<FoodFallback size={40} category={row.category} />} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">
            {item.name}
            {item.source === "estimated" ? " ~" : ""}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs muted">{Math.round(item.calories)} kcal</span>
            <MacroDot value={`${fmt(item.protein_g)}g`} color="var(--red)" />
            <MacroDot value={`${fmt(item.carbs_g)}g`} color="var(--orange)" />
            <MacroDot value={`${fmt(item.fat_g)}g`} color="var(--blue)" />
            {showCookedIn ? (
              <button type="button" className="chip press" style={{ height: 26, fontSize: 11, padding: "0 9px", gap: 4 }} onClick={onCookedIn}>
                <Drop size={12} />
                Cooked in…
              </button>
            ) : null}
          </span>
          {item.cooked_in === "restaurant" ? <span className="text-[11px] muted">Restaurant portion · oil included</span> : fatLabel ? <span className="text-[11px] muted">Cooked in {fatLabel}</span> : null}
        </div>
        <AnimatePresence>
          {delta !== null ? (
            <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 420, damping: 22 }} className="badge shrink-0" style={{ background: delta > 0 ? "var(--btn)" : "var(--card2)", color: delta > 0 ? "var(--btn-ink)" : "var(--ink)" }}>
              {delta > 0 ? "+" : ""}
              {delta} kcal
            </motion.span>
          ) : null}
        </AnimatePresence>
        <button type="button" onClick={onOpen} aria-label={`Change the amount of ${item.name}`} className="chip press shrink-0" style={{ height: 34, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
          {qtyText(row)}
        </button>
        <button type="button" onClick={onRemove} aria-label={`Remove ${item.name}`} className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ color: "var(--muted)" }}>
          <Close size={16} />
        </button>
      </div>
    </>
  );
}
