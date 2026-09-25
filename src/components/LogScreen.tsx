"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "./icons";
import { Segmented } from "./ui";
import MealForm from "./MealForm";
import WorkoutForm from "./WorkoutForm";
import type { ExerciseEntry, FoodPreset, Profile, SavedMeal, Workout } from "@/lib/types";

/**
 * Full-screen Log page. v2.8: Food · Activity (the old Workout and Exercise segments are one
 * "Log activity" flow). A tapped workout or activity row opens here as its editor. Back returns to
 * wherever you came from.
 */
export default function LogScreen({
  existing,
  editingExercise = null,
  date,
  startOnMeal,
  savedMeals,
  presets,
  usage = {},
  profile,
  recentExercises = [],
  recentWorkouts = [],
  liftHistory = [],
  prefill = false,
}: {
  existing: Workout | null;
  /** v2.8: a logged run / activity to edit. */
  editingExercise?: ExerciseEntry | null;
  date: string;
  startOnMeal: boolean;
  savedMeals: SavedMeal[];
  presets: FoodPreset[];
  usage?: Record<string, number>;
  profile: Profile;
  /** The last ~60 days of exercise rows ("Same as last time", Recent). */
  recentExercises?: ExerciseEntry[];
  /** v2.8: recent workouts of every kind ("Same as last time", the default type). */
  recentWorkouts?: Workout[];
  /** v2.5: recent gym / bodyweight sessions (the set grid's last-time values). */
  liftHistory?: Workout[];
  /** v2.4: opened from a scan's "Add to plate" — the Meal form starts with those items. */
  prefill?: boolean;
}) {
  const router = useRouter();
  const editing = !!existing || !!editingExercise;
  const [seg, setSeg] = useState(startOnMeal && !editing ? 0 : 1);
  // Back goes where you came from (Calendar, Progress, …); a cold open falls back to Home.
  const close = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

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
        <h1 className="flex-1 text-center text-[17px] font-bold">{existing ? "Edit workout" : editingExercise ? "Edit activity" : seg === 0 ? "Log food" : "Log activity"}</h1>
        <span className="w-10" />
      </div>
      {!editing ? (
        <div className="px-4 py-2">
          <Segmented options={["Food", "Activity"]} selected={seg} onSelect={setSeg} label="What are you logging" />
        </div>
      ) : null}
      {editing || seg === 1 ? (
        <WorkoutForm
          existing={existing}
          editingExercise={editingExercise}
          initialDate={editingExercise?.date ?? date}
          target={profile.weekly_workout_target}
          onClose={close}
          onCreated={() => router.replace("/?celebrate=1")}
          weightKg={profile.weight_kg ?? null}
          workouts={recentWorkouts}
          entries={recentExercises}
          history={liftHistory.filter((w) => w.id !== existing?.id)}
        />
      ) : (
        <MealForm date={date} savedMeals={savedMeals} presets={presets} usage={usage} onClose={close} prefill={prefill} />
      )}
    </div>
  );
}
