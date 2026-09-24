"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "./icons";
import { Segmented } from "./ui";
import ExerciseForm, { recentActivities } from "./ExerciseForm";
import MealForm from "./MealForm";
import WorkoutForm from "./WorkoutForm";
import type { ExerciseEntry, FoodPreset, Profile, SavedMeal, Workout } from "@/lib/types";

/** Full-screen Log page: Workout / Meal / Exercise segments (opened from the + FAB or a workout row). The Meal segment is Add food. */
export default function LogScreen({
  existing,
  last = null,
  date,
  startOnMeal,
  startOnExercise = false,
  savedMeals,
  presets,
  usage = {},
  profile,
  recentExercises = [],
}: {
  existing: Workout | null;
  /** The most recent workout, for "Same as last time" on a new one. */
  last?: Workout | null;
  date: string;
  startOnMeal: boolean;
  startOnExercise?: boolean;
  savedMeals: SavedMeal[];
  presets: FoodPreset[];
  usage?: Record<string, number>;
  profile: Profile;
  /** v2.3: the last ~60 days of exercise rows, for the Exercise form's Recent row. */
  recentExercises?: ExerciseEntry[];
}) {
  const router = useRouter();
  const [seg, setSeg] = useState(startOnExercise ? 2 : startOnMeal ? 1 : 0);
  const close = () => router.push("/");

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col" style={{ paddingTop: "calc(8px + env(safe-area-inset-top, 0px))" }}>
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          type="button"
          onClick={close}
          aria-label="Back"
          className="press grid h-10 w-10 place-items-center rounded-full"
          style={{ background: "var(--card)", boxShadow: "var(--shadow-sm)" }}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-bold">{existing ? "Edit workout" : "Log"}</h1>
        <span className="w-10" />
      </div>
      {!existing ? (
        <div className="px-4 py-2">
          <Segmented options={["Workout", "Meal", "Exercise"]} selected={seg} onSelect={setSeg} label="What are you logging" />
        </div>
      ) : null}
      {existing || seg === 0 ? (
        <WorkoutForm existing={existing} last={existing ? null : last} initialDate={date} target={profile.weekly_workout_target} onClose={close} />
      ) : seg === 1 ? (
        <MealForm date={date} savedMeals={savedMeals} presets={presets} usage={usage} onClose={close} />
      ) : (
        <ExerciseForm date={date} weightKg={profile.weight_kg ?? null} onClose={close} recent={recentActivities(recentExercises, profile.weight_kg ?? null)} />
      )}
    </div>
  );
}
