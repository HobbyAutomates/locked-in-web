import { dailyWeights, ewma, lsSlope, type WeighIn } from "../adaptive";

/**
 * v2.18 B5 plateau detective. A plateau = the weight TREND (EWMA, like adaptive targets) moved less
 * than 0.1 kg/week over the last 14+ days while the goal is to lose (or gain). Then it looks for the
 * usual suspects in the same 14 days and names the biggest one with one fix. Pure; Android
 * util/Plateau.kt.
 */

export const FLAT_KG_PER_WEEK = 0.1;
export const PLATEAU_DAYS = 14;

export type PlateauDay = { date: string; kcal: number | null; water: number | null; sodiumMg: number | null };

export type Cause = { key: "gaps" | "weekends" | "over" | "water" | "sodium" | "none"; title: string; detail: string; fix: string; weight: number };

export type Plateau = { flat: false; reason: string } | { flat: true; days: number; trendKgPerWeek: number; causes: Cause[]; top: Cause };

/**
 * `weighIns` any order; `days` = the last 14 days of intake (kcal null = nothing logged).
 * `asOf` = today. Weekend = Saturday / Sunday.
 */
export function detectPlateau(input: { goal: string; weighIns: WeighIn[]; days: PlateauDay[]; target: number; asOf: string }): Plateau {
  if (input.goal !== "lose" && input.goal !== "gain") return { flat: false, reason: "Plateaus matter when you're losing or gaining." };
  const recent = input.weighIns.filter((w) => w.kg > 0);
  const series = dailyWeights(recent, input.asOf, 21);
  const trend = ewma(series).slice(-PLATEAU_DAYS);
  const inWindow = recent.filter((w) => Date.parse(w.date) > Date.parse(input.asOf) - PLATEAU_DAYS * 86_400_000 && w.date <= input.asOf);
  if (inWindow.length < 4) return { flat: false, reason: "Weigh in at least 4 times over 2 weeks so we can see the trend." };
  const first = series.findIndex((v) => v != null);
  const span = first < 0 ? 0 : series.length - first;
  if (span < PLATEAU_DAYS) return { flat: false, reason: "Not enough history yet: 2 weeks of weigh-ins needed." };
  const slopeWeek = Math.round(lsSlope(trend) * 7 * 100) / 100;
  const flat = input.goal === "lose" ? slopeWeek > -FLAT_KG_PER_WEEK : slopeWeek < FLAT_KG_PER_WEEK;
  if (!flat) return { flat: false, reason: `Trend is moving (${slopeWeek > 0 ? "+" : ""}${slopeWeek} kg/week). No plateau.` };
  const causes = plateauCauses(input.days, input.target, input.goal);
  return { flat: true, days: span, trendKgPerWeek: slopeWeek, causes, top: causes[0] };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const wd = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

export function plateauCauses(days: PlateauDay[], target: number, goal = "lose"): Cause[] {
  const out: Cause[] = [];
  const logged = days.filter((d) => d.kcal != null && d.kcal > 0);
  const n = days.length || PLATEAU_DAYS;
  if (logged.length < Math.ceil(n * 0.7)) {
    out.push({
      key: "gaps",
      title: "Logging gaps",
      detail: `Food logged on ${logged.length} of ${n} days. The unlogged days are usually the bigger ones.`,
      fix: "Log every day for the next 7, even a rough guess. Then we'll know the real number.",
      weight: 100 - logged.length,
    });
  }
  const wk = logged.filter((d) => [0, 6].includes(wd(d.date))).map((d) => d.kcal as number);
  const wdays = logged.filter((d) => ![0, 6].includes(wd(d.date))).map((d) => d.kcal as number);
  if (wk.length >= 2 && wdays.length >= 3 && avg(wk) - avg(wdays) >= 300) {
    const diff = Math.round((avg(wk) - avg(wdays)) / 10) * 10;
    out.push({ key: "weekends", title: "Weekends", detail: `Saturdays and Sundays run about ${diff} kcal higher than weekdays.`, fix: "Plan one weekend treat meal instead of the whole weekend. Pre-log it on Friday.", weight: 60 + diff / 20 });
  }
  const avgK = avg(logged.map((d) => d.kcal as number));
  if (goal === "lose" && logged.length >= 5 && avgK > target + 100) {
    const over = Math.round((avgK - target) / 10) * 10;
    out.push({ key: "over", title: "Above target", detail: `On logged days you average about ${over} kcal over your ${target} kcal target.`, fix: "Trim one daily extra (a second chai with sugar, fried snack or large rice portion): about 150–200 kcal.", weight: 50 + over / 10 });
  }
  const water = days.map((d) => d.water).filter((w): w is number => w != null && w > 0);
  if (water.length >= 5 && avg(water) < 2000) {
    out.push({ key: "water", title: "Low water", detail: `You average ${Math.round(avg(water) / 50) * 50} ml of water a day. Dehydration makes the body hold water, hiding fat loss on the scale.`, fix: "Get to 2.5–3 L a day for a week: a bottle by your desk, one glass with every meal.", weight: 40 });
  }
  const sodium = days.map((d) => d.sodiumMg).filter((s): s is number => s != null && s > 0);
  if (sodium.length >= 5 && avg(sodium) > 2300) {
    out.push({ key: "sodium", title: "High salt", detail: `About ${Math.round(avg(sodium) / 100) * 100} mg sodium a day (namkeen, pickles, packaged food). Salt holds water.`, fix: "Swap the packaged snack for fruit or roasted chana this week; the scale often drops within days.", weight: 35 });
  }
  if (!out.length) {
    out.push({
      key: "none",
      title: "Nothing's off",
      detail: "Your logs, weekends, water and salt all look fine. A 2–3 week stall is often water shifting while fat still comes off.",
      fix: goal === "lose" ? "Hold steady one more week. If the trend still hasn't moved, lower your target by 100 kcal." : "Hold steady one more week. If the trend still hasn't moved, add 100 kcal a day.",
      weight: 0,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
