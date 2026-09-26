"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { searchFoodsForPicker } from "@/lib/actions";
import { deleteRecipe, logRecipe, saveRecipe } from "@/lib/nutrition-actions";
import { perServing, priceIngredient, recipeTotals, type Recipe, type RecipeIngredient } from "@/lib/recipes";
import { MEAL_TYPES, defaultMealType, type MealType } from "@/lib/mealType";
import type { FoodSearchHit } from "@/lib/types";
import SubPage from "../SubPage";
import FoodImage, { FoodFallback } from "../FoodImage";
import { LineIcon } from "../lineIcons";
import { Close, Search, Spinner } from "../icons";
import { MRise, STAGGER } from "../motion";
import { BottomSheet, ErrorNote, fmt } from "../ui";
import { AccentButton, ComingSoon, GhostButton, Label, PCard } from "./kit";

function fromHit(h: FoodSearchHit): RecipeIngredient {
  const base: RecipeIngredient = {
    name: h.name,
    grams: 100,
    kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    food_id: h.id,
    per100: { kcal: h.calories, protein_g: h.protein_g, carbs_g: h.carbs_g, fat_g: h.fat_g, micros: h.micros ?? {} },
  };
  return priceIngredient(base, h.units[0]?.grams ?? 100);
}

/**
 * v2.13 recipe builder (spec §8): ingredients from the same food search as logging, with grams;
 * servings and an optional cooked weight; totals and per-serving numbers worked out here and
 * stored with the recipe. An existing recipe can be logged ("Your recipe"), edited or deleted.
 */
export default function RecipeEditor({ available, recipe }: { available: boolean; recipe: Recipe | null }) {
  const router = useRouter();
  const [name, setName] = useState(recipe?.name ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 2));
  const [cooked, setCooked] = useState(recipe?.cooked_weight_g ? String(recipe.cooked_weight_g) : "");
  const [items, setItems] = useState<RecipeIngredient[]>(recipe?.items ?? []);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FoodSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logServings, setLogServings] = useState(1);
  const [logType, setLogType] = useState<MealType>(() => defaultMealType());
  const [logged, setLogged] = useState(false);

  const n = Math.max(0.25, Number(servings) || 1);
  const cookedG = Number(cooked) > 0 ? Number(cooked) : null;
  const totals = recipeTotals(items);
  const ps = perServing(items, n, cookedG);
  const dirty = !recipe || name !== recipe.name || n !== recipe.servings || cookedG !== recipe.cooked_weight_g || JSON.stringify(items) !== JSON.stringify(recipe.items);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      setSearching(true);
      searchFoodsForPicker(q.slice(0, 60), 8)
        .then((r) => live && setHits(r))
        .catch(() => live && setHits([]))
        .finally(() => live && setSearching(false));
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  async function save() {
    setBusy(true);
    setError(null);
    const r = await saveRecipe({ id: recipe?.id ?? null, name, servings: n, cooked_weight_g: cookedG, items });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (!recipe) router.replace(`/recipes/${r.id}`);
    else router.refresh();
  }
  async function remove() {
    if (!recipe) return;
    setBusy(true);
    const r = await deleteRecipe(recipe.id);
    setBusy(false);
    if (!r.ok) {
      setConfirmDelete(false);
      return setError(r.error);
    }
    router.replace("/recipes");
  }
  async function log() {
    if (!recipe) return;
    setBusy(true);
    setError(null);
    const r = await logRecipe({ id: recipe.id, servings: logServings, mealType: logType });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setLogged(true);
    setLogOpen(false);
  }

  if (!available) {
    return (
      <SubPage title="Recipe" back="/recipes">
        <ComingSoon what="Recipe builder" />
      </SubPage>
    );
  }

  return (
    <SubPage title={recipe ? "Recipe" : "New recipe"} back="/recipes">
      <MRise>
        <PCard label="Recipe">
          <input className="field" value={name} maxLength={60} aria-label="Recipe name" placeholder="Name, e.g. Mum's rajma" onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold muted">Makes (servings)</span>
              <input className="field num" inputMode="decimal" value={servings} aria-label="Servings" onChange={(e) => setServings(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold muted">Cooked weight (optional)</span>
              <input className="field num" inputMode="decimal" value={cooked} placeholder="g" aria-label="Cooked weight in grams" onChange={(e) => setCooked(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} />
            </label>
          </div>
          <p className="text-[11px] leading-4 muted">A serving is {fmt(ps.grams)} g {cookedG ? "of the cooked dish" : "of the raw ingredients"}. Weigh the pot after cooking for the best numbers.</p>
        </PCard>
      </MRise>

      <MRise delay={STAGGER}>
        <PCard label="Ingredients">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold">Ingredients</p>
            <span className="num text-[12px] muted">
              {items.length} · {fmt(totals.grams)} g
            </span>
          </div>
          <div className="searchbar">
            <Search size={17} className="muted shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value.slice(0, 80))} placeholder="Add an ingredient…" aria-label="Search for an ingredient" />
            {query ? (
              <button type="button" aria-label="Clear" className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full muted" onClick={() => setQuery("")}>
                <Close size={15} />
              </button>
            ) : null}
          </div>
          {query.trim().length >= 2 ? (
            <div className="flex flex-col rounded-2xl" style={{ background: "var(--card2)" }}>
              {searching && !hits.length ? (
                <p className="flex items-center gap-2 px-3 py-3 text-[13px] muted">
                  <Spinner size={14} /> Searching…
                </p>
              ) : null}
              {!searching && !hits.length ? <p className="px-3 py-3 text-[13px] muted">No match in the food table.</p> : null}
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="press flex min-h-[48px] items-center gap-2.5 px-3 py-2 text-left"
                  style={{ background: "none", border: 0, color: "var(--ink)" }}
                  onClick={() => {
                    setItems((cur) => [...cur, fromHit(h)]);
                    setQuery("");
                    setHits([]);
                  }}
                >
                  <FoodImage name={h.name} kind={h.source === "off" ? "product" : "generic"} src={h.image_url} size={32} fallback={<FoodFallback size={32} />} />
                  <span className="min-w-0 flex-1 text-[14px] font-semibold">{h.name}</span>
                  <span className="num shrink-0 text-[12px] muted">{Math.round(h.calories)} kcal/100 g</span>
                </button>
              ))}
            </div>
          ) : null}
          {items.length === 0 ? <p className="text-[13px] muted">Search above to add the first ingredient.</p> : null}
          <div className="flex flex-col">
            {items.map((it, i) => (
              <div key={`${it.food_id ?? it.name}-${i}`} className="flex items-center gap-2.5 py-2" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-semibold leading-tight" style={{ overflowWrap: "anywhere" }}>
                    {it.name}
                  </span>
                  <span className="num text-[12px] muted">
                    {it.kcal} kcal · {fmt(it.protein_g)} g P
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <input
                    className="numfield num"
                    style={{ width: 64 }}
                    inputMode="decimal"
                    aria-label={`Grams of ${it.name}`}
                    value={String(it.grams)}
                    onChange={(e) => {
                      const g = Number(e.target.value.replace(/[^\d.]/g, "")) || 0;
                      setItems((cur) => cur.map((x, j) => (j === i ? priceIngredient(x, Math.min(5000, g)) : x)));
                    }}
                  />
                  <span className="text-[12px] muted">g</span>
                </span>
                <button type="button" aria-label={`Remove ${it.name}`} className="hit press grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ color: "var(--muted)" }} onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))}>
                  <Close size={15} />
                </button>
              </div>
            ))}
          </div>
        </PCard>
      </MRise>

      <MRise delay={STAGGER * 2}>
        <PCard label="Per serving">
          <Label>Per serving · whole recipe</Label>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["kcal", ps.kcal, totals.kcal, "var(--ink)"],
                ["Protein", ps.protein_g, totals.protein_g, "var(--red)"],
                ["Carbs", ps.carbs_g, totals.carbs_g, "var(--orange)"],
                ["Fat", ps.fat_g, totals.fat_g, "var(--blue)"],
              ] as const
            ).map(([label, a, b, color]) => (
              <div key={label} className="rounded-2xl px-2.5 py-2" style={{ background: "var(--card2)" }}>
                <p className="num text-[17px] font-semibold leading-tight" style={{ color }}>
                  {fmt(a)}
                  {label === "kcal" ? "" : " g"}
                </p>
                <p className="text-[11px] muted">{label}</p>
                <p className="num text-[10px] muted">all: {fmt(b)}</p>
              </div>
            ))}
          </div>
          {ps.fiber_g ? <p className="num text-[12px] muted">Fibre {fmt(ps.fiber_g)} g a serving</p> : null}
        </PCard>
      </MRise>

      <ErrorNote text={error} />
      {logged ? (
        <p role="status" className="flex items-center gap-2 rounded-2xl px-3.5 py-3 text-[14px] font-semibold" style={{ background: "var(--green-bg)", color: "var(--green-ink)" }}>
          <LineIcon name="check" size={16} /> Logged. It shows under {MEAL_TYPES.find((t) => t.key === logType)?.label} on Home.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {recipe ? (
          <GhostButton onClick={() => setLogOpen(true)} disabled={busy || dirty}>
            Log a serving
          </GhostButton>
        ) : null}
        <AccentButton onClick={() => void save()} disabled={busy || !dirty || !name.trim() || !items.length} className={recipe ? "" : "col-span-2"}>
          {busy ? "Saving…" : recipe ? (dirty ? "Save changes" : "Saved") : "Save recipe"}
        </AccentButton>
      </div>
      {recipe && dirty ? <p className="-mt-2 text-center text-[11px] muted">Save your changes to log a serving.</p> : null}
      {recipe ? (
        <button type="button" className="press self-center py-2 text-[13px] font-semibold" style={{ background: "none", border: 0, color: "var(--red)" }} onClick={() => setConfirmDelete(true)}>
          Delete recipe
        </button>
      ) : null}

      <BottomSheet open={confirmDelete} title="Delete this recipe?" subtitle="Meals you already logged from it stay as they are." onClose={() => setConfirmDelete(false)}>
        <div className="grid grid-cols-2 gap-2 pb-1">
          <GhostButton onClick={() => setConfirmDelete(false)}>Keep</GhostButton>
          <button type="button" className="press h-[46px] rounded-2xl text-[15px] font-semibold" style={{ background: "var(--red)", color: "#fff", border: 0 }} disabled={busy} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={logOpen} title={`Log ${recipe?.name ?? "a serving"}`} subtitle={`${Math.round(ps.kcal * logServings)} kcal · ${fmt(Math.round(ps.protein_g * logServings * 10) / 10)} g protein`} onClose={() => setLogOpen(false)}>
        <div className="flex flex-col gap-3 pb-1">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold">Servings</span>
            <span className="flex items-center gap-2">
              <button type="button" aria-label="Half a serving less" className="press grid h-9 w-9 place-items-center rounded-full text-[18px] font-bold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => setLogServings((v) => Math.max(0.5, v - 0.5))}>
                −
              </button>
              <span className="num w-10 text-center text-[17px] font-semibold">{fmt(logServings)}</span>
              <button type="button" aria-label="Half a serving more" className="press grid h-9 w-9 place-items-center rounded-full text-[18px] font-bold" style={{ background: "var(--card2)", border: 0, color: "var(--ink)" }} onClick={() => setLogServings((v) => Math.min(20, v + 0.5))}>
                +
              </button>
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Which meal">
            {MEAL_TYPES.map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={logType === t.key} className="chip press" style={{ height: 36, fontSize: 12.5, padding: "0 4px" }} onClick={() => setLogType(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <AccentButton onClick={() => void log()} disabled={busy}>
            {busy ? "Logging…" : "Log it"}
          </AccentButton>
        </div>
      </BottomSheet>
    </SubPage>
  );
}
