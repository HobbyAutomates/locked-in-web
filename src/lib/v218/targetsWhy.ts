/**
 * v2.18 B3 "why it changed": the adaptive check-in (adaptive.ts) explained in plain English and
 * plain Hindi, no jargon (no "TDEE", no "EWMA"). Pure; Android util/TargetsWhy.kt.
 */

export type WhyInput = { oldTarget: number; newTarget: number; trendKgPerWeek: number; goalRateKgPerWeek: number; avgKcal: number };

const n = (v: number) => Math.round(v).toLocaleString("en-IN");
const kg = (v: number) => Math.abs(Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");

export type Why = { en: string[]; hi: string[]; direction: "up" | "down" | "same" };

export function targetsWhy(w: WhyInput): Why {
  const delta = w.newTarget - w.oldTarget;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const moving = w.trendKgPerWeek < -0.05 ? "down" : w.trendKgPerWeek > 0.05 ? "up" : "flat";
  const wantMove = w.goalRateKgPerWeek < -0.05 ? "lose" : w.goalRateKgPerWeek > 0.05 ? "gain" : "hold";

  const en: string[] = [];
  const hi: string[] = [];
  en.push(moving === "flat" ? "Your weight has stayed about the same for 2 weeks." : `Your weight is going ${moving} about ${kg(w.trendKgPerWeek)} kg a week.`);
  hi.push(moving === "flat" ? "पिछले 2 हफ़्तों से आपका वज़न लगभग एक जैसा है।" : `आपका वज़न हर हफ़्ते लगभग ${kg(w.trendKgPerWeek)} kg ${moving === "down" ? "घट" : "बढ़"} रहा है।`);
  en.push(wantMove === "hold" ? "Your goal is to stay where you are." : `Your goal is to ${wantMove} about ${kg(w.goalRateKgPerWeek)} kg a week.`);
  hi.push(wantMove === "hold" ? "आपका लक्ष्य वज़न को वैसा ही रखना है।" : `आपका लक्ष्य हर हफ़्ते ${kg(w.goalRateKgPerWeek)} kg ${wantMove === "lose" ? "कम" : "ज़्यादा"} करना है।`);
  en.push(`You ate about ${n(w.avgKcal)} kcal a day.`);
  hi.push(`आपने रोज़ लगभग ${n(w.avgKcal)} kcal खाया।`);
  if (direction === "same") {
    en.push(`That's right on track, so your target stays at ${n(w.oldTarget)} kcal.`);
    hi.push(`सब सही चल रहा है, इसलिए टारगेट ${n(w.oldTarget)} kcal ही रहेगा।`);
  } else if (direction === "down") {
    en.push(`You're moving slower than planned, so we're trimming ${n(-delta)} kcal: ${n(w.oldTarget)} → ${n(w.newTarget)}. About one roti less a day.`);
    hi.push(`प्रगति प्लान से धीमी है, इसलिए टारगेट ${n(-delta)} kcal कम कर रहे हैं: ${n(w.oldTarget)} → ${n(w.newTarget)}। यानी दिन में लगभग एक रोटी कम।`);
  } else {
    en.push(`You're moving faster than planned (or your body needs more), so we're adding ${n(delta)} kcal: ${n(w.oldTarget)} → ${n(w.newTarget)}. Safer and easier to keep up.`);
    hi.push(`आप प्लान से तेज़ चल रहे हैं (या शरीर को ज़्यादा चाहिए), इसलिए ${n(delta)} kcal बढ़ा रहे हैं: ${n(w.oldTarget)} → ${n(w.newTarget)}। यह ज़्यादा सुरक्षित और आसान है।`);
  }
  en.push("We only ever move it by 150 kcal at most, and never below your safe minimum.");
  hi.push("हम एक बार में 150 kcal से ज़्यादा नहीं बदलते, और कभी सुरक्षित सीमा से नीचे नहीं जाते।");
  return { en, hi, direction };
}
