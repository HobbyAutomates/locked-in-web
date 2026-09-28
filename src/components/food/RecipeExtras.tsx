"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/image";
import { saveRecipe } from "@/lib/nutrition-actions";
import { HOME_RECIPES, ingredientFromItem, parseVoiceRecipe } from "@/lib/food/homeRecipes";
import { copySharedRecipe, listSharedRecipes, shareRecipe, type SharedRecipe } from "@/lib/food/foodActions";
import type { ParseResult } from "@/lib/types";
import { LineIcon } from "../lineIcons";
import { MRise } from "../motion";
import { Spinner } from "../icons";
import { BottomSheet, ErrorNote, fmt } from "../ui";
import { PCard } from "../nutrition/kit";
import { HoldMic, LangToggle, useVoiceNote } from "./VoiceHold";

/**
 * v2.18 A2 on the Recipes page: the "Ghar ka khana" library, saving a recipe by voice ("Mom's dal:
 * 1 katori toor dal, 1 spoon ghee, serves 4" → priced by /api/parse-meal → your recipe), and
 * recipes your squads shared (save a copy). Sharing lives on a recipe's own page (ShareRecipeButton).
 */
export function RecipeTopLinks() {
  const [voiceOpen, setVoiceOpen] = useState(false);
  return (
    <>
      <MRise delay={60}>
        <div className="grid grid-cols-2 gap-2.5">
          <Link href="/recipes/library" className="press flex min-h-[64px] items-center gap-2.5 rounded-[18px] px-3.5 py-2.5" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)", color: "var(--ink)" }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--card2)" }}>
              <LineIcon name="bowl" size={18} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[14px] font-semibold leading-tight">Ghar ka khana</span>
              <span className="text-[12px] muted">{HOME_RECIPES.length} home recipes</span>
            </span>
          </Link>
          <button type="button" onClick={() => setVoiceOpen(true)} className="press flex min-h-[64px] items-center gap-2.5 rounded-[18px] px-3.5 py-2.5 text-left" style={{ background: "var(--card)", boxShadow: "var(--pcard-ring)", color: "var(--ink)", border: 0 }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>
              <LineIcon name="spark" size={17} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[14px] font-semibold leading-tight">Say a recipe</span>
              <span className="text-[12px] muted">Mom&apos;s dal, by voice</span>
            </span>
          </button>
        </div>
      </MRise>
      <VoiceRecipeSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </>
  );
}

export function VoiceRecipeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const voice = useVoiceNote();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = voice.dictation.listening ? voice.value : text || voice.value;
  const parsed = parseVoiceRecipe(shown);

  async function build() {
    const r = parseVoiceRecipe(shown);
    if (!r.ingredients.trim()) {
      setError("Say the ingredients too: “1 katori toor dal, 1 spoon ghee”.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<ParseResult>("/api/parse-meal", { text: r.ingredients });
      const items = (res.items ?? []).filter((i) => Number(i.grams) > 0).map(ingredientFromItem);
      if (!items.length) throw new Error("Couldn't work out those ingredients. Try naming amounts: “2 katori rice, 1 spoon ghee”.");
      const saved = await saveRecipe({ name: r.name || "My recipe", servings: r.servings ?? 2, cooked_weight_g: null, items, note: `Said: ${shown.slice(0, 200)}` });
      if (!saved.ok) throw new Error(saved.error);
      onClose();
      router.push(`/recipes/${saved.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} title="Say a recipe" subtitle="Name, then the ingredients with amounts, then how many it serves." onClose={onClose} primary={{ label: busy ? "Working it out…" : "Work it out and save", onClick: () => void build(), disabled: busy || !shown.trim() }}>
      <div className="flex flex-col gap-2.5 pb-1">
        <div className="flex items-center gap-2">
          <HoldMic dictation={voice.dictation} label="Hold to say the recipe" size={44} />
          <LangToggle dictation={voice.dictation} />
          <span className="text-[12px] muted">{voice.dictation.supported ? (voice.dictation.listening ? "Listening…" : "Hold the mic, or type below") : "Type it below"}</span>
        </div>
        <textarea
          className="field"
          rows={3}
          style={{ minHeight: 88, paddingTop: 10 }}
          value={shown}
          readOnly={voice.dictation.listening}
          onChange={(e) => {
            setText(e.target.value);
            voice.setValue(e.target.value);
          }}
          placeholder="Mom's dal: 1 katori toor dal, 1 spoon ghee, 1 tomato, serves 4"
          aria-label="The recipe"
        />
        {parsed.name || parsed.servings ? (
          <p className="px-1 text-[12px] muted">
            {parsed.name ? <b style={{ color: "var(--ink)" }}>{parsed.name}</b> : "No name yet"}
            {parsed.servings ? ` · serves ${parsed.servings}` : " · serves 2 (change it after)"}
          </p>
        ) : null}
        {busy ? (
          <p className="flex items-center gap-2 px-1 text-[12px] muted">
            <Spinner size={14} /> Pricing each ingredient (the web checks anything the food table doesn&apos;t know)…
          </p>
        ) : null}
        <ErrorNote text={error} />
      </div>
    </BottomSheet>
  );
}

/** Recipes squadmates shared (hidden before schema_v42 or when there are none). */
export function SquadRecipes({ hideNumbers = false }: { hideNumbers?: boolean }) {
  const router = useRouter();
  const [list, setList] = useState<SharedRecipe[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void listSharedRecipes().then((r) => live && setList(r.ok ? r.recipes.filter((x) => !x.mine) : []));
    return () => {
      live = false;
    };
  }, []);
  if (!list?.length) return null;
  async function copy(id: string) {
    setBusy(id);
    setError(null);
    const r = await copySharedRecipe(id);
    setBusy(null);
    if (!r.ok) setError(r.error);
    else router.push(`/recipes/${r.id}`);
  }
  return (
    <MRise delay={180}>
      <PCard label="From your squads" padding={6}>
        <p className="px-3.5 pt-2.5 text-[13px] font-semibold muted">From your squads</p>
        {list.map((r, i) => (
          <div key={r.id} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold leading-tight">{r.name}</span>
              <span className="num truncate text-[12px] muted">
                {r.author_name ?? "A squadmate"} · {r.squad} · {hideNumbers ? "" : `${r.per_serving.kcal} kcal · `}
                {fmt(r.per_serving.protein_g)} g protein
              </span>
            </span>
            <button type="button" className="chip press shrink-0" style={{ height: 34, padding: "0 12px", fontWeight: 700 }} disabled={busy === r.id} onClick={() => void copy(r.id)}>
              {busy === r.id ? <Spinner size={14} /> : "Save a copy"}
            </button>
          </div>
        ))}
        {error ? <p className="px-3.5 pb-2 text-[12px]" style={{ color: "var(--danger)" }}>{error}</p> : null}
      </PCard>
    </MRise>
  );
}

/** "Share to squad" on a saved recipe (hidden when there are no squads or schema_v42 isn't there). */
export function ShareRecipeButton({ recipeId }: { recipeId: string }) {
  const [squads, setSquads] = useState<{ id: string; name: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void listSharedRecipes().then((r) => live && setSquads(r.ok ? r.squads : []));
    return () => {
      live = false;
    };
  }, []);
  if (!squads?.length) return null;
  async function share(groupId: string, name: string) {
    setBusy(true);
    setError(null);
    const r = await shareRecipe(recipeId, groupId);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setDone(`Shared with ${name}`);
      setOpen(false);
    }
  }
  return (
    <>
      <button type="button" className="press inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} onClick={() => setOpen(true)}>
        <LineIcon name="share" size={16} />
        {done ?? "Share to squad"}
      </button>
      <BottomSheet open={open} title="Share to a squad" subtitle="Squadmates see it under Recipes and can save a copy." onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-1.5 pb-1">
          {squads.map((s) => (
            <button key={s.id} type="button" disabled={busy} className="press flex min-h-[48px] items-center justify-between rounded-xl px-3.5 text-left text-[15px] font-semibold" style={{ background: "var(--card2)", color: "var(--ink)", border: 0 }} onClick={() => void share(s.id, s.name)}>
              {s.name}
              <LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} />
            </button>
          ))}
          <ErrorNote text={error} />
        </div>
      </BottomSheet>
    </>
  );
}
