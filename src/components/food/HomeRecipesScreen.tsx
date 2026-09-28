"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HOME_CATEGORIES, homeRecipeItem, searchHomeRecipes, servingStep, unitLabel, type HomeRecipe } from "@/lib/food/homeRecipes";
import { copyHomeRecipe, logHomeRecipe } from "@/lib/food/foodActions";
import { defaultMealType, mealTypeLabel, type MealType } from "@/lib/mealType";
import SubPage from "../SubPage";
import { LineIcon } from "../lineIcons";
import { MRise } from "../motion";
import { Search } from "../icons";
import { BottomSheet, ErrorNote, fmt } from "../ui";
import { PCard } from "../nutrition/kit";
import { MealSlotChips } from "../scan/LogIt";

/**
 * v2.18 A2 "Ghar ka khana": the built-in library of common Indian home recipes. Search or browse by
 * category; tap one for its ingredients, pick servings in its own unit (½-katori steps, whole rotis)
 * and a meal, then Log in one tap. "Make it mine" copies it into your recipes to tweak.
 */
export default function HomeRecipesScreen({ hideNumbers = false }: { hideNumbers?: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<HomeRecipe["category"] | "all">("all");
  const [open, setOpen] = useState<HomeRecipe | null>(null);
  const list = useMemo(() => searchHomeRecipes(q).filter((r) => cat === "all" || r.category === cat), [q, cat]);

  return (
    <SubPage title="Ghar ka khana" back="/recipes">
      <MRise>
        <p className="px-1 text-[13px] leading-[19px] muted">Home-style numbers (with the usual oil and ghee) for one serving in the unit you&apos;d eat it in. Tap one to log it.</p>
      </MRise>
      <MRise delay={40}>
        <label className="flex h-[46px] items-center gap-2 rounded-2xl px-3.5" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)" }}>
          <Search size={16} />
          <input className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: dal, roti, poha, rajma…" aria-label="Search home recipes" />
        </label>
      </MRise>
      <MRise delay={80}>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Category">
          {[{ key: "all" as const, label: "All" }, ...HOME_CATEGORIES].map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={cat === c.key} className="chip press shrink-0 whitespace-nowrap" style={{ height: 32, fontSize: 13 }} onClick={() => setCat(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </MRise>
      <MRise delay={120}>
        <PCard label="Recipes" padding={6}>
          {list.length === 0 ? <p className="px-3.5 py-4 text-[14px] muted">Nothing by that name. Try another word, or save your own recipe.</p> : null}
          {list.map((r, i) => (
            <button key={r.id} type="button" onClick={() => setOpen(r)} className="press flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2 text-left" style={{ color: "var(--ink)", borderTop: i ? "1px solid var(--hair)" : "none", background: "none", borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold leading-tight">{r.name}</span>
                <span className="num truncate text-[12px] muted">
                  {r.local !== r.name ? `${r.local} · ` : ""}1 {r.unit} ({r.unit_grams} g){hideNumbers ? "" : ` · ${r.kcal} kcal`} · {fmt(r.protein_g)} g protein
                </span>
              </span>
              <LineIcon name="plus" size={18} style={{ color: "var(--muted)" }} />
            </button>
          ))}
        </PCard>
      </MRise>
      <RecipeSheet recipe={open} onClose={() => setOpen(null)} hideNumbers={hideNumbers} />
    </SubPage>
  );
}

function RecipeSheet({ recipe, onClose, hideNumbers }: { recipe: HomeRecipe | null; onClose: () => void; hideNumbers: boolean }) {
  const router = useRouter();
  const [servings, setServings] = useState(1);
  const [slot, setSlot] = useState<MealType>(() => defaultMealType());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  // Derived-state reset when a different recipe opens.
  if ((recipe?.id ?? null) !== shownId) {
    setShownId(recipe?.id ?? null);
    setServings(1);
    setError(null);
    setDone(null);
  }
  if (!recipe) return <BottomSheet open={false} title="" onClose={onClose} />;
  const step = servingStep(recipe);
  const item = homeRecipeItem(recipe, servings);

  async function log() {
    if (!recipe) return;
    setBusy(true);
    setError(null);
    const r = await logHomeRecipe({ id: recipe.id, servings, mealType: slot });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setDone(`Logged ${unitLabel(recipe, servings)} to ${mealTypeLabel(slot)}`);
      router.refresh();
    }
  }
  async function mine() {
    if (!recipe) return;
    setBusy(true);
    const r = await copyHomeRecipe(recipe.id);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else router.push(`/recipes/${r.id}`);
  }

  return (
    <BottomSheet open title={recipe.name} subtitle={`${recipe.local} · ${recipe.ingredients.join(", ")}`} onClose={onClose} primary={{ label: busy ? "Saving…" : done ? "Logged" : `Log ${unitLabel(recipe, servings)} to ${mealTypeLabel(slot)}`, onClick: () => void log(), disabled: busy || !!done }}>
      <div className="flex flex-col gap-3 pb-1">
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="chip press" style={{ width: 44, height: 44, padding: 0, fontSize: 20 }} aria-label="Fewer" disabled={servings <= step} onClick={() => setServings((n) => Math.max(step, n - step))}>
            −
          </button>
          <div className="flex flex-col items-center">
            <span className="num text-[22px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
              {unitLabel(recipe, servings)}
            </span>
            <span className="num text-[12px] muted">
              {item.grams} g{hideNumbers ? "" : ` · ${item.calories} kcal`} · {fmt(item.protein_g)} g P · {fmt(item.carbs_g)} g C · {fmt(item.fat_g)} g F
            </span>
          </div>
          <button type="button" className="chip press" style={{ width: 44, height: 44, padding: 0, fontSize: 20 }} aria-label="More" disabled={servings >= 10} onClick={() => setServings((n) => Math.min(10, n + step))}>
            +
          </button>
        </div>
        <MealSlotChips value={slot} onChange={setSlot} />
        {done ? <p className="text-center text-[13px] font-semibold" style={{ color: "var(--green)" }}>{done}</p> : null}
        <button type="button" className="hit press py-1 text-center text-[13px] font-semibold muted" style={{ background: "none", border: 0 }} disabled={busy} onClick={() => void mine()}>
          Make it mine (copy to your recipes to tweak)
        </button>
        <ErrorNote text={error} />
      </div>
    </BottomSheet>
  );
}
