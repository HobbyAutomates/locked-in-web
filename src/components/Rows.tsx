"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMeal } from "@/lib/actions";
import type { Meal, Workout } from "@/lib/types";
import { formatTime, relativeDay } from "@/lib/display";
import { Bowl, Dumbbell, Flame, Spinner, ThumbDown, ThumbUp, Trash } from "./icons";
import { Card, CardButton, IconTile, MacroDot, fmt } from "./ui";

export function WorkoutRow({ workout, onOpen }: { workout: Workout; onOpen: () => void }) {
  const w = workout;
  return (
    <CardButton onClick={onOpen} ariaLabel={`Edit workout on ${relativeDay(w.date)}`}>
      <div className="flex items-center gap-3">
        <IconTile>
          <Dumbbell size={26} />
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-semibold">{relativeDay(w.date)}</span>
            <span className="text-xs muted">
              {w.band_level}
              {w.resistance_kg != null ? ` · ${fmt(Number(w.resistance_kg))} kg` : ""}
            </span>
          </div>
          <span className="truncate text-[15px] font-bold">{w.muscles.join(" · ")}</span>
          <span className="flex gap-2.5 truncate text-xs muted">
            {w.minutes != null ? <span>{w.minutes} mins</span> : null}
            {w.exercises ? <span className="truncate">{w.exercises}</span> : null}
          </span>
        </div>
      </div>
    </CardButton>
  );
}

export function MealRow({ meal, feedback = true }: { meal: Meal; feedback?: boolean }) {
  const router = useRouter();
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  const [busy, startDelete] = useTransition();
  const calories = meal.items.reduce((a, i) => a + Number(i.calories), 0);
  const protein = meal.items.reduce((a, i) => a + Number(i.protein_g), 0);
  const carbs = meal.items.reduce((a, i) => a + Number(i.carbs_g), 0);
  const fat = meal.items.reduce((a, i) => a + Number(i.fat_g), 0);

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

  return (
    <Card padding={14}>
      <div className="flex items-center gap-3">
        <IconTile tint="var(--orange)" bg="var(--orange-bg)">
          <Bowl size={26} />
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-semibold">{meal.items.map((i) => i.name).join(", ") || "Meal"}</span>
            <span className="shrink-0 text-xs muted">{formatTime(meal.created_at)}</span>
          </div>
          <span className="flex items-center gap-1.5 text-[15px] font-bold">
            <Flame size={15} />
            {Math.round(calories)} calories
          </span>
          <span className="flex flex-wrap gap-2.5">
            <MacroDot value={`${fmt(protein)}g`} color="var(--red)" />
            <MacroDot value={`${fmt(carbs)}g`} color="var(--orange)" />
            <MacroDot value={`${fmt(fat)}g`} color="var(--blue)" />
          </span>
        </div>
        <button
          type="button"
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ color: "var(--muted)" }}
          aria-label="Delete meal"
          disabled={busy}
          onClick={() =>
            startDelete(async () => {
              await deleteMeal(meal.id);
              router.refresh();
            })
          }
        >
          {busy ? <Spinner size={16} /> : <Trash size={18} />}
        </button>
      </div>
      {feedback ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs muted">{voted === null ? "How did the AI do?" : "Thanks — noted"}</span>
          <span className="flex gap-1.5">
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
                  className="press grid h-[30px] w-[30px] place-items-center rounded-full"
                  style={{ background: sel ? "var(--btn)" : "var(--card2)", color: sel ? "var(--btn-ink)" : "var(--muted)" }}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </span>
        </div>
      ) : null}
    </Card>
  );
}

/** Shimmering placeholder while a quick-logged meal is being priced. */
export function PendingMealRow({ text }: { text: string }) {
  return (
    <Card padding={14}>
      <div className="flex items-center gap-3">
        <span className="tile shimmer" style={{ color: "var(--muted)" }}>
          <Spinner size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-[15px] font-semibold">{text}</span>
          <span className="shimmer h-3 w-1/2 rounded-full" style={{ background: "var(--card2)" }} />
          <span className="text-xs muted">Working out the calories… you can leave this page.</span>
        </div>
      </div>
    </Card>
  );
}
