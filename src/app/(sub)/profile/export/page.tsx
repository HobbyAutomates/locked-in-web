import SubPage from "@/components/SubPage";
import ExportScreen from "@/components/social/ExportScreen";
import { getDashboard, getWeights } from "@/lib/data";
import { addDays } from "@/lib/dates";
import { totalsFor } from "@/lib/totals";
import { getLang } from "@/lib/social/lang";
import { t } from "@/lib/social/i18n";

export const dynamic = "force-dynamic";

/** v2.18 E5 /profile/export: CSV downloads (/api/export) and a printable report (Save as PDF). */
export default async function ExportPage() {
  const [lang, dash, weights] = await Promise.all([getLang(), getDashboard(), getWeights()]);
  const from = addDays(dash.today, -89);
  const days: { date: string; kcal: number; protein: number; meals: number }[] = [];
  for (let d = dash.today; d >= from; d = addDays(d, -1)) {
    const meals = dash.meals.filter((m) => m.date === d).length;
    if (!meals) continue;
    const tt = totalsFor(dash.meals, d);
    days.push({ date: d, kcal: Math.round(tt.calories), protein: Math.round(tt.protein), meals });
  }
  return (
    <SubPage title={t("export.title", lang)} back="/profile/preferences/account">
      <ExportScreen
        name={dash.profile.name ?? ""}
        today={dash.today}
        hideNumbers={!!dash.profile.hide_numbers}
        targets={{ kcal: dash.profile.calorie_target, protein: dash.profile.protein_target_g }}
        days={days}
        weights={weights.filter((w) => w.date >= from).map((w) => ({ date: w.date, kg: w.weight_kg }))}
        workouts={dash.workouts.filter((w) => w.date >= from).map((w) => ({ date: w.date, kind: w.kind ?? "gym", minutes: w.minutes ?? null }))}
      />
    </SubPage>
  );
}
