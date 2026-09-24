"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { deleteExercise, deleteMeal } from "@/lib/actions";
import { RUN_CODE, intensityLabel } from "@/lib/burn";
import type { ExerciseEntry, Meal, Workout } from "@/lib/types";
import { formatTime } from "@/lib/display";
import { Band, Bowl, ChevronDown, ChevronRight, Dumbbell, Pushup, Run, Spinner, ThumbDown, ThumbUp, Trash } from "./icons";
import { workoutTitle } from "@/lib/exercises";
import { Hair, MacroDot, SPRING, fmt } from "./ui";
import FoodImage, { FoodFallback } from "./FoodImage";

/**
 * Logged rows on Home and Calendar: one line each (icon, title, kcal, time) and a chevron. Meals
 * and exercise expand in place for the details and delete; a workout row opens its editor.
 */

function Tile({ children, tint = "var(--ink)", bg = "var(--card2)" }: { children: React.ReactNode; tint?: string; bg?: string }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[12px]" style={{ width: 40, height: 40, background: bg, color: tint }}>
      {children}
    </span>
  );
}

/** The one-line summary every logged row shares. */
function Summary({ icon, title, kcal, time, open, expands, onClick, ariaLabel }: { icon: React.ReactNode; title: string; kcal: number | null; time: string; open?: boolean; expands: boolean; onClick: () => void; ariaLabel: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={expands ? !!open : undefined} aria-label={ariaLabel} className="press flex min-h-[56px] w-full items-center gap-3 text-left" style={{ padding: "8px 12px", background: "none", border: 0, color: "var(--ink)" }}>
      {icon}
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</span>
      {kcal != null ? <span className="num shrink-0 text-[14px] font-bold">{Math.round(kcal)} kcal</span> : null}
      {time ? <span className="shrink-0 text-xs muted">{time}</span> : null}
      <span className="shrink-0" style={{ color: "var(--muted)", display: "inline-flex" }}>
        {expands ? (
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING} className="inline-flex">
            <ChevronDown size={18} />
          </motion.span>
        ) : (
          <ChevronRight size={18} />
        )}
      </span>
    </button>
  );
}

function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: "hidden" }}>
          <div className="px-3">
            <Hair />
          </div>
          <div className="px-3 pb-3 pt-2.5">{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DeleteButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" className="press inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold" style={{ background: "var(--red-bg)", color: "var(--red)" }} aria-label={label} disabled={busy} onClick={onClick}>
      {busy ? <Spinner size={14} /> : <Trash size={15} />}
      Delete
    </button>
  );
}

/** Optimistic delete: the row hides now, "Deleted · Undo" shows for ~5s, and the real delete only
 * happens if Undo isn't tapped in time. */
function useUndoDelete(action: () => Promise<void>) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    setPending(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      void action()
        .then(() => router.refresh())
        .catch((e) => console.error("[useUndoDelete] delete failed:", e));
    }, 5000);
  }
  function undo() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPending(false);
  }
  return { pending, start, undo };
}

function UndoRow({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="card flex min-h-[56px] items-center justify-between gap-3" style={{ padding: "8px 16px" }}>
      <span className="text-[14px] font-semibold muted">Deleted · Undo</span>
      <button type="button" className="hit press text-[13px] font-bold" style={{ color: "var(--btn)", background: "none", border: 0 }} onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}

export function WorkoutRow({ workout, onOpen, burnKcal }: { workout: Workout; onOpen: () => void; burnKcal?: number | null }) {
  const w = workout;
  return (
    <div className="card" style={{ padding: 0 }}>
      <Summary
        icon={<Tile>{w.kind === "gym" ? <Dumbbell size={22} /> : w.kind === "bodyweight" ? <Pushup size={22} /> : <Band size={22} />}</Tile>}
        title={workoutTitle(w)}
        kcal={burnKcal != null && burnKcal > 0 ? burnKcal : null}
        time={w.minutes != null ? `${w.minutes} min` : ""}
        expands={false}
        onClick={onOpen}
        ariaLabel={`Edit workout: ${workoutTitle(w)}`}
      />
    </div>
  );
}

export function MealRow({ meal, feedback = true }: { meal: Meal & { photo_url?: string | null }; feedback?: boolean }) {
  const [open, setOpen] = useState(false);
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  const del = useUndoDelete(() => deleteMeal(meal.id));
  const calories = meal.items.reduce((a, i) => a + Number(i.calories), 0);
  const protein = meal.items.reduce((a, i) => a + Number(i.protein_g), 0);
  const carbs = meal.items.reduce((a, i) => a + Number(i.carbs_g), 0);
  const fat = meal.items.reduce((a, i) => a + Number(i.fat_g), 0);
  const title = meal.items.map((i) => i.name).join(", ") || meal.raw_text || "Meal";
  // v2.4: the biggest item stands for the meal in its picture.
  const lead = [...meal.items].sort((a, b) => Number(b.calories) - Number(a.calories))[0];

  function vote(rating: "up" | "down") {
    setVoted(rating);
    void fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meal_id: meal.id, raw_text: meal.raw_text, rating }),
    }).catch(() => {
      // Feedback is best-effort; never block the row on it.
    });
  }

  if (del.pending) return <UndoRow onUndo={del.undo} />;

  return (
    <div className="card" style={{ padding: 0 }}>
      <Summary
        icon={
          meal.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Storage URL
            <img src={meal.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-[12px] object-cover" />
          ) : lead ? (
            <FoodImage name={lead.name} kind={lead.source === "scan" ? "product" : "generic"} src={lead.image_url} size={40} fallback={<FoodFallback size={40} product={lead.source === "scan"} />} />
          ) : (
            <Tile tint="var(--orange)" bg="var(--orange-bg)">
              <Bowl size={22} />
            </Tile>
          )
        }
        title={title}
        kcal={calories}
        time={formatTime(meal.created_at)}
        open={open}
        expands
        onClick={() => setOpen((o) => !o)}
        ariaLabel={`${title}, ${Math.round(calories)} kcal. ${open ? "Hide" : "Show"} details`}
      />
      <Expand open={open}>
        <ul className="flex list-none flex-col gap-1.5 p-0">
          {meal.items.map((i, idx) => (
            <li key={i.id ?? idx} className="flex items-center justify-between gap-3 text-[13px]">
              <FoodImage name={i.name} kind={i.source === "scan" ? "product" : "generic"} src={i.image_url} size={28} radius={8} fallback={<FoodFallback size={28} product={i.source === "scan"} />} />
              <span className="min-w-0 flex-1 truncate">
                {i.name}
                <span className="muted"> · {i.unit === "serving" && i.servings != null ? `${fmt(i.servings)} serving${i.servings === 1 ? "" : "s"}` : `${fmt(Math.round(Number(i.grams)))} g`}</span>
              </span>
              <span className="num shrink-0 font-semibold">{Math.round(Number(i.calories))} kcal</span>
            </li>
          ))}
        </ul>
        <span className="mt-2.5 flex flex-wrap gap-2.5">
          <MacroDot value={`${fmt(Math.round(protein * 10) / 10)}g protein`} color="var(--red)" />
          <MacroDot value={`${fmt(Math.round(carbs * 10) / 10)}g carbs`} color="var(--orange)" />
          <MacroDot value={`${fmt(Math.round(fat * 10) / 10)}g fat`} color="var(--blue)" />
        </span>
        <div className="mt-3 flex items-center justify-between gap-2">
          {feedback ? (
            <span className="flex items-center gap-1.5">
              <span className="mr-1 text-xs muted">{voted === null ? "AI right?" : "Thanks"}</span>
              {(["up", "down"] as const).map((r) => {
                const sel = voted === r;
                const Icon = r === "up" ? ThumbUp : ThumbDown;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={voted !== null}
                    onClick={() => vote(r)}
                    aria-label={r === "up" ? "The AI got this right" : "The AI got this wrong"}
                    className="hit press grid h-9 w-9 place-items-center rounded-full"
                    style={{ background: sel ? "var(--btn)" : "var(--card2)", color: sel ? "var(--btn-ink)" : "var(--muted)" }}
                  >
                    <Icon size={15} />
                  </button>
                );
              })}
            </span>
          ) : (
            <span />
          )}
          <DeleteButton label="Delete meal" busy={false} onClick={del.start} />
        </div>
      </Expand>
    </div>
  );
}

/** A logged burn (run / activity / described / manual). */
export function ExerciseRow({ entry }: { entry: ExerciseEntry }) {
  const [open, setOpen] = useState(false);
  const del = useUndoDelete(() => deleteExercise(entry.id));
  const e = entry;
  const lower = e.name.toLowerCase();
  const isRun = e.activity_code === RUN_CODE || lower.includes("run") || lower.includes("jog");
  const isBands = (e.activity_code ?? "").startsWith("LI-BAND") || lower.includes("lifting") || lower.includes("band");
  const neutral = isRun || isBands;
  const title = e.name.charAt(0).toUpperCase() + e.name.slice(1);
  if (del.pending) return <UndoRow onUndo={del.undo} />;
  return (
    <div className="card" style={{ padding: 0 }}>
      <Summary
        icon={
          <Tile tint={neutral ? "var(--ink)" : "var(--green)"} bg={neutral ? "var(--card2)" : "var(--green-bg)"}>
            {isBands ? <Dumbbell size={22} /> : <Run size={22} />}
          </Tile>
        }
        title={title}
        kcal={e.kcal}
        time={formatTime(e.created_at)}
        open={open}
        expands
        onClick={() => setOpen((o) => !o)}
        ariaLabel={`${title}, ${Math.round(e.kcal)} kcal. ${open ? "Hide" : "Show"} details`}
      />
      <Expand open={open}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] muted">
            {e.source === "manual" && !e.activity_code ? "Entered by hand" : `Intensity: ${intensityLabel(e.intensity)}`} · {e.minutes} min
          </span>
          <DeleteButton label="Delete exercise" busy={false} onClick={del.start} />
        </div>
      </Expand>
    </div>
  );
}
