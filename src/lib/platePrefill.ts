import type { MealItem } from "./types";
import type { MealMethod } from "./analytics";

/**
 * v2.4: Scan → "Add to plate" hands its items to the meal flow through sessionStorage, then opens
 * /log?mode=meal&prefill=1; MealForm picks them up once on mount and clears the key.
 */
export const PLATE_PREFILL_KEY = "li.plate.prefill";
export type PlatePrefill = { items: MealItem[]; label: string; photo_path?: string | null; kind?: "preset" | "product" | "generic"; method?: MealMethod };
