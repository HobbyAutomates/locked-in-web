"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "./icons";
import { Segmented } from "./ui";
import ExerciseForm from "./ExerciseForm";
import MealForm from "./MealForm";
import WorkoutForm from "./WorkoutForm";
import type { Profile, SavedMeal, Workout } from "@/lib/types";

/** Full-screen Log page: Workout / Meal / Exercise segments (opened from the + FAB or a workout row). */
export default function LogScreen({
  existing,
  date,
  startOnMeal,
  startOnExercise = false,
  savedMeals,
  profile,
}: {
  existing: Workout | null;
  date: string;
  startOnMeal: boolean;
  startOnExercise?: boolean;
  savedMeals: SavedMeal[];
  profile: Profile;
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
        <WorkoutForm existing={existing} initialDate={date} target={profile.weekly_workout_target} onClose={close} />
      ) : seg === 1 ? (
        <MealForm date={date} savedMeals={savedMeals} onClose={close} />
      ) : (
        <ExerciseForm date={date} weightKg={profile.weight_kg ?? null} onClose={close} />
      )}
    </div>
  );
}
