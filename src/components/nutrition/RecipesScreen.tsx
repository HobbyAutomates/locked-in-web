"use client";

import Link from "next/link";
import { ProNote } from "../platform/kit";
import type { Recipe } from "@/lib/recipes";
import SubPage from "../SubPage";
import { LineIcon } from "../lineIcons";
import { MRise } from "../motion";
import { fmt } from "../ui";
import { ComingSoon, PCard } from "./kit";

/** v2.13 Log → Recipes (spec §8): your recipes with per-serving numbers, and "New recipe". */
export default function RecipesScreen({ available, recipes, hideNumbers = false }: { available: boolean; recipes: Recipe[]; hideNumbers?: boolean }) {
  return (
    <SubPage title="Recipes">
      <ProNote className="mb-3" />
      {!available ? (
        <MRise>
          <ComingSoon what="Recipe builder" />
        </MRise>
      ) : (
        <>
          <MRise>
            <Link href="/recipes/new" className="press flex h-[52px] items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
              <LineIcon name="plus" size={18} stroke={2} />
              New recipe
            </Link>
          </MRise>
          {recipes.length === 0 ? (
            <MRise delay={120}>
              <PCard label="No recipes yet">
                <p className="text-[15px] font-semibold">Build what you cook</p>
                <p className="text-[13px] leading-[19px] muted">Add the ingredients once, set how many servings it makes, and log a serving in one tap from then on.</p>
              </PCard>
            </MRise>
          ) : (
            <MRise delay={120}>
              <PCard label="Your recipes" padding={6}>
                {recipes.map((r, i) => (
                  <Link key={r.id} href={`/recipes/${r.id}`} className="press flex min-h-[64px] items-center gap-3 px-3.5 py-2.5" style={{ color: "var(--ink)", borderTop: i ? "1px solid var(--hair)" : "none" }}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px]" style={{ background: "var(--card2)" }}>
                      <LineIcon name="bowl" size={20} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-semibold leading-tight" style={{ overflowWrap: "anywhere" }}>
                        {r.name}
                      </span>
                      <span className="num text-[12px] muted">
                        {hideNumbers ? "" : `${r.per_serving.kcal} kcal · `}
                        {fmt(r.per_serving.protein_g)} g protein a serving · makes {fmt(r.servings)}
                      </span>
                    </span>
                    <LineIcon name="chev" size={16} style={{ color: "var(--muted)" }} />
                  </Link>
                ))}
              </PCard>
            </MRise>
          )}
        </>
      )}
    </SubPage>
  );
}
