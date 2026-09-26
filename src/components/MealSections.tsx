"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/display";
import { MEAL_TYPES, groupMeals, mealTypeLabel, mealTypeOf, type MealType } from "@/lib/mealType";
import { itemQtyLabel } from "@/lib/quantity";
import { moveMeal } from "@/lib/nutrition-actions";
import type { Meal } from "@/lib/types";
import { Bowl, ChevronRight, MealTypeIcon, Plus } from "./icons";
import FoodImage, { FoodFallback } from "./FoodImage";
import { UndoSnackbar } from "./LogBits";
import { BottomSheet, Hair, Rise, fmt } from "./ui";

type ShownMeal = Meal & { photo_url?: string | null };

const LONG_PRESS_MS = 450;
const MOVE_SLOP_PX = 8;
const noop = () => () => undefined;

/**
 * v2.8: a day's meals in four sections — Breakfast · Lunch · Dinner · Snacks — each with its kcal
 * and protein, its meals (tap one to edit it) and a small "+ Add" that opens Add food with that type
 * picked. An empty section is one slim row. Home and Calendar both use it.
 *
 * v2.13: move a meal to another meal time — long-press a meal and drag it onto another section,
 * or tap its ⋯ for "Move to…" (the accessible path). Only meals.meal_type changes (no squad
 * re-post; that isn't wired for moves). Optimistic, with Undo.
 */
export default function MealSections({ meals, date, back = "/", rise = 6 }: { meals: ShownMeal[]; date: string; back?: "/" | "/calendar"; rise?: number }) {
  const router = useRouter();
  const [override, setOverride] = useState<Record<string, MealType>>({});
  const [menu, setMenu] = useState<ShownMeal | null>(null);
  const [drag, setDrag] = useState<{ meal: ShownMeal; x: number; y: number; over: MealType | null } | null>(null);
  const [snack, setSnack] = useState<{ text: string; undo?: { id: string; to: MealType } } | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => () => void (snackTimer.current && clearTimeout(snackTimer.current)), []);

  const shown = meals.map((m) => (override[m.id] ? { ...m, meal_type: override[m.id] } : m));
  const sections = groupMeals(shown);
  const addHref = (t: MealType) => `/meal?type=${t}&date=${date}${back === "/" ? "" : `&back=${encodeURIComponent(back)}`}`;

  function say(text: string, undo?: { id: string; to: MealType }) {
    setSnack({ text, undo });
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setSnack(null), 5000);
  }

  async function move(meal: ShownMeal, to: MealType, isUndo = false) {
    const from = override[meal.id] ?? mealTypeOf(meal);
    if (from === to) return;
    setOverride((o) => ({ ...o, [meal.id]: to }));
    const r = await moveMeal(meal.id, to);
    if (!r.ok) {
      setOverride((o) => ({ ...o, [meal.id]: from }));
      say(r.error);
      return;
    }
    say(isUndo ? `Back in ${mealTypeLabel(to)}` : `Moved to ${mealTypeLabel(to)}`, isUndo ? undefined : { id: meal.id, to: from });
    router.refresh();
  }

  const byId = new Map(shown.map((m) => [m.id, m]));

  return (
    <>
      {sections.map((s) => {
        const over = drag?.over === s.type && mealTypeOf(drag.meal) !== s.type;
        const ring = over ? { boxShadow: "0 0 0 2px var(--accent), var(--shadow-sm)" } : drag ? { boxShadow: "0 0 0 1.5px var(--hair)" } : {};
        return s.meals.length === 0 ? (
          <Rise key={s.type} index={rise}>
            <div data-meal-drop={s.type} className="card flex items-center justify-between gap-3" style={{ padding: "4px 6px 4px 16px", minHeight: 48, transition: "box-shadow .15s", ...ring }}>
              <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold muted">
                <MealTypeIcon type={s.type} size={18} />
                {s.label}
                {over ? <span className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>Drop here</span> : null}
              </span>
              <AddLink href={addHref(s.type)} label={s.label} />
            </div>
          </Rise>
        ) : (
          <Rise key={s.type} index={rise}>
            <section data-meal-drop={s.type} className="card" style={{ padding: 0, transition: "box-shadow .15s", ...ring }} aria-label={`${s.label}: ${s.kcal} kcal, ${fmt(s.protein)} g protein`}>
              <div className="flex items-center gap-2" style={{ padding: "8px 6px 4px 16px", minHeight: 48 }}>
                <MealTypeIcon type={s.type} size={18} className="shrink-0" />
                <span className="text-[16px] font-extrabold" style={{ letterSpacing: "-0.02em" }}>
                  {s.label}
                </span>
                <span className="num min-w-0 flex-1 truncate text-[13px] muted">
                  {over ? <span style={{ color: "var(--accent)", fontWeight: 600 }}>Drop here</span> : `${s.kcal} kcal · ${fmt(s.protein)} g protein`}
                </span>
                <AddLink href={addHref(s.type)} label={s.label} />
              </div>
              {s.meals.map((m) => (
                <div key={m.id}>
                  <div className="px-3">
                    <Hair />
                  </div>
                  <MealLine
                    meal={m}
                    dragging={drag?.meal.id === m.id}
                    href={`/meal?id=${m.id}${back === "/" ? "" : `&back=${encodeURIComponent(back)}`}`}
                    onMenu={() => setMenu(m)}
                    onDrag={(x, y, over) => setDrag(x < 0 ? null : { meal: m, x, y, over })}
                    onDrop={(to) => {
                      setDrag(null);
                      if (to) void move(m, to);
                    }}
                  />
                </div>
              ))}
            </section>
          </Rise>
        );
      })}

      {mounted && drag
        ? createPortal(
            <div className="pointer-events-none fixed z-[70] flex max-w-[260px] items-center gap-2 rounded-2xl px-3 py-2 text-[14px] font-semibold" style={{ left: drag.x - 40, top: drag.y - 28, background: "var(--card)", color: "var(--ink)", boxShadow: "var(--shadow-lg)", transform: "rotate(-2deg)" }} aria-hidden="true">
              <MealTypeIcon type={drag.over ?? mealTypeOf(drag.meal)} size={16} />
              <span className="truncate">{mealTitle(drag.meal)}</span>
            </div>,
            document.body,
          )
        : null}

      <BottomSheet open={!!menu} title="Move to…" subtitle={menu ? mealTitle(menu) : undefined} onClose={() => setMenu(null)}>
        {menu ? (
          <div className="flex flex-col pb-1" role="radiogroup" aria-label="Meal time">
            {MEAL_TYPES.map((t, i) => {
              const current = (byId.get(menu.id) ? mealTypeOf(byId.get(menu.id) as ShownMeal) : mealTypeOf(menu)) === t.key;
              return (
                <div key={t.key}>
                  {i ? <Hair /> : null}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={current}
                    className="press flex min-h-[52px] w-full items-center gap-3 text-left text-[15px] font-semibold"
                    style={{ background: "none", border: 0, color: "var(--ink)" }}
                    onClick={() => {
                      const m = menu;
                      setMenu(null);
                      if (!current) void move(m, t.key);
                    }}
                  >
                    <MealTypeIcon type={t.key} size={18} />
                    <span className="flex-1">{t.label}</span>
                    {current ? <span className="text-[12px] muted">Now</span> : null}
                  </button>
                </div>
              );
            })}
            <p className="pt-2 text-[12px] muted">Tip: you can also press and hold a meal, then drag it onto another section.</p>
          </div>
        ) : null}
      </BottomSheet>
      <UndoSnackbar text={snack?.text ?? null} onUndo={snack?.undo ? () => { const u = snack.undo as { id: string; to: MealType }; const m = byId.get(u.id); setSnack(null); if (m) void move(m, u.to, true); } : undefined} />
    </>
  );
}

function mealTitle(meal: ShownMeal): string {
  return meal.items.map((i) => i.name).join(", ") || meal.raw_text || "Meal";
}

function AddLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={`Add to ${label}`} className="chip press shrink-0 gap-1 whitespace-nowrap" style={{ height: 34, padding: "0 12px", fontSize: 13, fontWeight: 700 }}>
      <Plus size={14} />
      Add
    </Link>
  );
}

/** The meal section under the pointer (the drag ghost has pointer-events: none). */
function sectionAt(x: number, y: number): MealType | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-meal-drop]");
  const t = el?.dataset.mealDrop;
  return t === "breakfast" || t === "lunch" || t === "dinner" || t === "snack" ? t : null;
}

/** One logged meal: picture, what was in it (with amounts), kcal, time. The row opens the editor; ⋯ moves it. */
function MealLine({
  meal,
  href,
  dragging,
  onMenu,
  onDrag,
  onDrop,
}: {
  meal: ShownMeal;
  href: string;
  dragging: boolean;
  onMenu: () => void;
  /** x < 0 cancels the drag. */
  onDrag: (x: number, y: number, over: MealType | null) => void;
  onDrop: (to: MealType | null) => void;
}) {
  const calories = meal.items.reduce((a, i) => a + Number(i.calories), 0);
  const protein = meal.items.reduce((a, i) => a + Number(i.protein_g), 0);
  const title = mealTitle(meal);
  const detail = meal.items.length === 1 ? itemQtyLabel(meal.items[0]) : `${meal.items.length} items`;
  // The biggest item stands for the meal in its picture.
  const lead = [...meal.items].sort((a, b) => Number(b.calories) - Number(a.calories))[0];
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; active: boolean; el: HTMLElement | null; id: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    // While dragging, a finger move must not scroll the page.
    const stop = (e: TouchEvent) => {
      if (press.current?.active) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => {
      document.removeEventListener("touchmove", stop);
      if (press.current?.timer) clearTimeout(press.current.timer);
    };
  }, []);

  function cancel() {
    const p = press.current;
    if (p?.timer) clearTimeout(p.timer);
    if (p?.active) onDrag(-1, -1, null);
    press.current = null;
  }

  return (
    <div className="flex items-center" style={{ opacity: dragging ? 0.4 : 1, transition: "opacity .15s" }}>
      <Link
        href={href}
        className="press flex min-h-[60px] min-w-0 flex-1 items-center gap-3 text-left"
        style={{ padding: "8px 4px 8px 12px", color: "var(--ink)", WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none" }}
        aria-label={`${title}, ${Math.round(calories)} kcal. Edit`}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            suppressClick.current = false;
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const el = e.currentTarget;
          const id = e.pointerId;
          press.current = { x: e.clientX, y: e.clientY, active: false, el, id, timer: null };
          press.current.timer = setTimeout(() => {
            const p = press.current;
            if (!p) return;
            p.active = true;
            try {
              p.el?.setPointerCapture(p.id);
            } catch {
              // capture is a nicety; moves still arrive while over the row
            }
            navigator.vibrate?.(12);
            onDrag(p.x, p.y, sectionAt(p.x, p.y));
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p) return;
          if (!p.active) {
            if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_SLOP_PX) cancel();
            return;
          }
          onDrag(e.clientX, e.clientY, sectionAt(e.clientX, e.clientY));
        }}
        onPointerUp={(e) => {
          const p = press.current;
          if (p?.timer) clearTimeout(p.timer);
          press.current = null;
          if (p?.active) {
            suppressClick.current = true;
            onDrop(sectionAt(e.clientX, e.clientY));
          }
        }}
        onPointerCancel={cancel}
      >
        {meal.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Storage URL
          <img src={meal.photo_url} alt="" draggable={false} className="h-10 w-10 shrink-0 rounded-[12px] object-cover" />
        ) : lead ? (
          <FoodImage name={lead.name} kind={lead.source === "scan" ? "product" : "generic"} src={lead.image_url} size={40} fallback={<FoodFallback size={40} product={lead.source === "scan"} />} />
        ) : (
          <span className="grid shrink-0 place-items-center rounded-[12px]" style={{ width: 40, height: 40, background: "var(--orange-bg)", color: "var(--orange)" }}>
            <Bowl size={22} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">{title}</span>
          <span className="truncate text-xs muted">
            {detail} · {fmt(Math.round(protein * 10) / 10)} g protein
            {formatTime(meal.created_at) ? ` · ${formatTime(meal.created_at)}` : ""}
          </span>
        </span>
        <span className="num shrink-0 text-[14px] font-bold">{Math.round(calories)} kcal</span>
        <span className="shrink-0" style={{ color: "var(--muted)", display: "inline-flex" }}>
          <ChevronRight size={18} />
        </span>
      </Link>
      <button type="button" aria-label={`Move ${title} to another meal`} className="hit press mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "none", border: 0, color: "var(--muted)" }} onClick={onMenu}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
    </div>
  );
}
