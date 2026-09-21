"use client";

import { useTransition } from "react";
import { deleteMeal } from "@/lib/actions";
import type { Meal } from "@/lib/types";

export default function MealList({ meals }: { meals: Meal[] }) {
  const [pending, start] = useTransition();
  if (!meals.length) return null;
  return (
    <section className="card">
      <h2 className="text-lg font-bold mb-3">Logged today</h2>
      <div className="flex flex-col gap-3">
        {meals.map((m) => {
          const cal = m.items.reduce((a, i) => a + Number(i.calories), 0);
          const p = m.items.reduce((a, i) => a + Number(i.protein_g), 0);
          return (
            <div key={m.id} className="bg-surface-2 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm">
                  {m.items.map((i) => (
                    <span key={i.id ?? i.name} className="inline-block mr-2">
                      {i.name} <span className="muted">{i.grams} g</span>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => { if (confirm("Delete this meal?")) start(() => deleteMeal(m.id)); }}
                  aria-label="Delete meal"
                >
                  ×
                </button>
              </div>
              <div className="text-xs muted mt-1">
                <span className="num text-ink font-bold">{Math.round(cal)}</span> kcal · <span className="num text-ink font-bold">{Math.round(p)}</span> g protein
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
