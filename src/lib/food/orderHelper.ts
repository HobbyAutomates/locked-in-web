import type { MealItem } from "@/lib/types";
import { dishMealItem, midKcal, midProtein, type MenuDish } from "@/lib/menuScan";
import type { Remaining } from "@/lib/whatToEat";

/**
 * v2.18 A4 restaurant and delivery helper, pure. A pasted Swiggy / Zomato order (or a screenshot the
 * model reads) becomes dishes with a quantity; the plan says how much of each to eat for what's left
 * today, and "Pre-log" saves exactly that plan. Android: util/OrderHelper.kt.
 *
 *   parseOrderText   "2 x Butter Naan ₹120", "Paneer Tikka x 1", "Veg Biryani (Qty 1)" → name + qty;
 *                    fees, taxes, totals, coupons and addresses are skipped.
 *   orderPlan        the whole order when it fits (≤ 110 % of the kcal left); otherwise dishes in
 *                    protein-density order, each at the biggest quarter that still fits, so protein
 *                    stays and the naan / rice / dessert shrink first. The rest is "share or save".
 */

export type OrderLine = { name: string; qty: number };
export type OrderDish = MenuDish & { qty: number };
export type PlanRow = { index: number; eat: number; kcal: number; protein: number; line: string };
export type OrderPlan = { total_kcal: number; total_protein: number; plan_kcal: number; plan_protein: number; fits: boolean; rows: PlanRow[]; headline: string };

const SKIP = /\b(item total|sub ?total|total|grand total|to pay|paid|bill|delivery|packing|packaging|platform|gst|tax|taxes|charges?|fee|fees|discount|coupon|offer|saved|savings|tip|donation|order\s*#?|order id|ordered on|delivered|address|phone|payment|upi|card|cash|rating|rate|help|support|swiggy one|zomato gold|restaurant|km|mins?)\b/i;
const QTY_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function cleanName(s: string): string {
  return s
    .replace(/₹\s?[\d,.]+|rs\.?\s?[\d,.]+|inr\s?[\d,.]+/gi, " ")
    .replace(/\b(veg|non[- ]?veg)\s+icon\b/gi, " ")
    .replace(/[•·●▪■◼◾|*]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:-]+|[\s,.:-]+$/g, "")
    .trim();
}

/** Order text → dish lines with quantities (max 20). Lines that are prices, fees or totals are skipped. */
export function parseOrderText(text: string): OrderLine[] {
  const out: OrderLine[] = [];
  for (const rawLine of String(text ?? "").split(/\r?\n|;/)) {
    const line = rawLine.trim();
    if (!line || line.length > 120) continue;
    if (SKIP.test(line) && !/\b\d+\s*[x×]\b|\b[x×]\s*\d+\b/i.test(line)) continue;
    let qty = 1;
    let name = line;
    let m = line.match(/^\s*(\d{1,2})\s*[x×]\s*(.+)$/i) ?? line.match(/^\s*(\d{1,2})\s+(?!g\b|ml\b|kg\b|pcs?\b|pieces?\b)(.+)$/i);
    if (m) {
      qty = Number(m[1]);
      name = m[2];
    } else if ((m = line.match(/^(.+?)\s*[x×]\s*(\d{1,2})\b/i))) {
      qty = Number(m[2]);
      name = m[1];
    } else if ((m = line.match(/^(.+?)\s*\(\s*(?:qty[:\s]*)?(\d{1,2})\s*\)/i))) {
      qty = Number(m[2]);
      name = m[1];
    } else if ((m = line.match(/^(one|two|three|four|five|six)\s+(.+)$/i))) {
      qty = QTY_WORDS[m[1].toLowerCase()];
      name = m[2];
    }
    name = cleanName(name);
    // A line that is only a price / number / symbol isn't a dish.
    if (!/[a-z]{3,}/i.test(name) || SKIP.test(name)) continue;
    qty = Math.max(1, Math.min(20, qty || 1));
    const same = out.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (same) same.qty += qty;
    else out.push({ name: name.slice(0, 80), qty });
    if (out.length >= 20) break;
  }
  return out;
}

const STEPS = [1, 0.75, 0.5, 0.25, 0];

function eatLine(eat: number): string {
  if (eat >= 1) return "Have all of it";
  if (eat === 0) return "Skip, share or save it";
  const part = eat === 0.75 ? "¾" : eat === 0.5 ? "Half" : "A quarter";
  return `${part}, then share or save the rest`;
}

export function orderPlan(dishes: OrderDish[], remaining: Pick<Remaining, "kcal" | "protein">): OrderPlan {
  const kcalOf = (d: OrderDish) => midKcal(d) * d.qty;
  const protOf = (d: OrderDish) => midProtein(d) * d.qty;
  const total_kcal = Math.round(dishes.reduce((a, d) => a + kcalOf(d), 0));
  const total_protein = Math.round(dishes.reduce((a, d) => a + protOf(d), 0));
  const budget = Math.max(0, remaining.kcal);
  if (!dishes.length) return { total_kcal: 0, total_protein: 0, plan_kcal: 0, plan_protein: 0, fits: true, rows: [], headline: "No dishes found in that order." };
  if (total_kcal <= budget * 1.1) {
    const rows = dishes.map((d, index) => ({ index, eat: 1, kcal: Math.round(kcalOf(d)), protein: Math.round(protOf(d)), line: eatLine(1) }));
    return { total_kcal, total_protein, plan_kcal: total_kcal, plan_protein: total_protein, fits: true, rows, headline: `The whole order fits: ${total_kcal} of the ${Math.round(budget)} kcal you have left.` };
  }
  const density = (d: OrderDish) => (midKcal(d) > 0 ? midProtein(d) / midKcal(d) : 0);
  const order = dishes.map((d, i) => i).sort((a, b) => density(dishes[b]) - density(dishes[a]) || a - b);
  const eat = new Array<number>(dishes.length).fill(0);
  let used = 0;
  for (const i of order) {
    const k = kcalOf(dishes[i]);
    const step = STEPS.find((s) => used + k * s <= budget) ?? 0;
    eat[i] = step;
    used += k * step;
  }
  // Nothing fits at all (a big order late in the day): still suggest half the most protein-dense dish.
  if (used === 0 && order.length) eat[order[0]] = 0.5;
  const rows = dishes.map((d, index) => ({ index, eat: eat[index], kcal: Math.round(kcalOf(d) * eat[index]), protein: Math.round(protOf(d) * eat[index]), line: eatLine(eat[index]) }));
  const plan_kcal = rows.reduce((a, r) => a + r.kcal, 0);
  const plan_protein = rows.reduce((a, r) => a + r.protein, 0);
  return {
    total_kcal,
    total_protein,
    plan_kcal,
    plan_protein,
    fits: false,
    rows,
    headline: `The order is ~${total_kcal} kcal and you have ${Math.round(budget)} left. This plan keeps the protein: ${plan_kcal} kcal, ${plan_protein} g protein.`,
  };
}

/** The plan as meal items to pre-log (quantity × what to eat; skipped dishes left out). */
export function planItems(dishes: OrderDish[], plan: OrderPlan): MealItem[] {
  const out: MealItem[] = [];
  for (const r of plan.rows) {
    const d = dishes[r.index];
    if (!d || !(r.eat > 0)) continue;
    const one = dishMealItem(d);
    const k = d.qty * r.eat;
    const lo = Math.round(d.kcal_low * k);
    const hi = Math.round(d.kcal_high * k);
    out.push({
      ...one,
      name: d.qty > 1 ? `${d.name} ×${d.qty}` : d.name,
      grams: Math.round(one.grams * k),
      calories: Math.round(one.calories * k),
      protein_g: Math.round(one.protein_g * k * 10) / 10,
      carbs_g: Math.round(one.carbs_g * k * 10) / 10,
      fat_g: Math.round(one.fat_g * k * 10) / 10,
      kcal_low: lo,
      kcal_high: hi,
    });
  }
  return out;
}
