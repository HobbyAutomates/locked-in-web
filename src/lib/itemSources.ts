import { foodMeta, searchFoods, type FoodHit } from "@/lib/foodSearch";
import { sourceInfoFor, type SourceInfo } from "@/lib/sourceInfo";
import { findVariants, kcalPer100, type FoodVariant } from "@/lib/variants";

/** The fields enrichment reads from a parsed / plate / logged item. */
type Enrichable = { name: string; food_id: string | null; grams: number; calories: number; source: string; source_info?: SourceInfo | null; variants?: FoodVariant[] };

/** How many items per response get variants looked up (a plate rarely has more). */
const MAX_ENRICHED = 12;

/**
 * v2.9: adds the optional `source_info` and `variants` to items AFTER their numbers are final — the
 * sanity gates, plateMatch and the parser's own pricing have all run by the time this is called, and
 * nothing here changes a number. Best-effort and backward compatible: a failed lookup just leaves the
 * item as it was, and `variants` is only set when the item is really ambiguous.
 *
 *   queryOf  the words the person used for the item (the parse chunk), else its name
 *   search   injectable for tests; defaults to the search_foods RPC
 */
export async function enrichItems<T extends Enrichable>(
  items: T[],
  opts: { queryOf?: (it: T) => string | null | undefined; search?: (q: string, n: number) => Promise<FoodHit[]>; sourceOf?: (it: T) => string | null | undefined } = {},
): Promise<T[]> {
  const search = opts.search ?? searchFoods;
  const meta = await foodMeta(items.map((i) => i.food_id ?? "").filter(Boolean)).catch(() => new Map());
  return Promise.all(
    items.map(async (it, idx) => {
      const m = it.food_id ? meta.get(it.food_id) : undefined;
      const source_info =
        !it.food_id && it.source_info
          ? it.source_info
          : sourceInfoFor({ name: m?.name ?? it.name, food_id: it.food_id, source: m?.source ?? opts.sourceOf?.(it) ?? null, item_source: it.source, barcode: m?.barcode, source_ref: m?.source_ref });
      if (idx >= MAX_ENRICHED || it.source === "scan") return { ...it, source_info };
      const query = (opts.queryOf?.(it) ?? "").trim() || it.name;
      const variants = await findVariants({ query, name: it.name, chosenId: it.food_id, chosenKcal: kcalPer100(it), search }).catch(() => [] as FoodVariant[]);
      return variants.length ? { ...it, source_info, variants } : { ...it, source_info };
    }),
  );
}
