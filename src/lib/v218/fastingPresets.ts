/**
 * v2.18 B10 Indian fasting presets on top of the fasting timer: Navratri, Ramadan, Ekadashi and
 * Jain (chauvihar), each with timings and what's usually eaten. Timings use an approximate
 * sunrise / sunset (NOAA formula) for a city, default New Delhi. Religious practice varies a lot by
 * family and community, so the copy says "commonly" and lets people pick hours themselves.
 * Pure; Android util/FastingPresets.kt.
 */

export type PresetKey = "navratri" | "ramadan" | "ekadashi" | "jain" | "somvar";

export type FastPreset = {
  key: PresetKey;
  name: string;
  sub: string;
  /** How the window is set: sunrise→sunset, sunset→sunrise, a fixed number of hours from now… */
  window: "sun_day" | "sun_night" | "sunrise_to_sunrise" | "fixed";
  fixedHours?: number;
  eat: string[];
  avoid: string[];
  note: string;
};

export const PRESETS: FastPreset[] = [
  {
    key: "navratri",
    name: "Navratri vrat",
    sub: "Sunrise to sunset, phalahar allowed · 9 days",
    window: "sun_day",
    eat: ["Fruits, dates", "Sabudana khichdi / vada", "Kuttu or singhara atta roti", "Rajgira, samak (sama) rice", "Makhana, peanuts", "Curd, paneer, milk, lassi", "Aloo, shakarkandi, lauki", "Sendha namak"],
    avoid: ["Grains (wheat, rice), dal", "Onion, garlic", "Regular salt"],
    note: "Paneer, curd and makhana keep protein up on vrat days; fried sabudana and pakoras add up fast.",
  },
  {
    key: "ramadan",
    name: "Ramadan roza",
    sub: "Sehri before dawn, iftar at sunset",
    window: "sun_day",
    eat: ["Sehri: oats / roti with eggs or paneer, curd, dates, lots of water", "Iftar: dates and water first, then fruit, then a proper meal", "Haleem, grilled kebabs, dal, chana"],
    avoid: ["Only fried snacks at iftar", "Salty food at sehri (thirst)", "Too much sugar at once"],
    note: "Drink 2–3 L between iftar and sehri. Train an hour after iftar, lighter than usual.",
  },
  {
    key: "ekadashi",
    name: "Ekadashi",
    sub: "Sunrise to next sunrise, no grains or beans",
    window: "sunrise_to_sunrise",
    eat: ["Fruits, milk, curd", "Sabudana, kuttu, singhara", "Aloo, shakarkandi, pumpkin", "Nuts, makhana"],
    avoid: ["Rice, wheat, all grains", "Dal and beans"],
    note: "Some keep nirjala (no water). If you do, skip hard training that day.",
  },
  {
    key: "jain",
    name: "Jain chauvihar",
    sub: "No food or water after sunset until sunrise",
    window: "sun_night",
    eat: ["Dinner before sunset", "Dal, roti, sabzi without root vegetables", "Curd, paneer, moong, chana for protein"],
    avoid: ["Onion, garlic, potato and other root vegetables", "Eating after sunset"],
    note: "An early dinner works like a 12–14 h overnight fast. Make that last meal protein-rich.",
  },
  {
    key: "somvar",
    name: "Somvar / weekly vrat",
    sub: "One-meal or phalahar day · 12–16 h",
    window: "fixed",
    fixedHours: 14,
    eat: ["Fruits, milk, curd", "Sabudana, makhana", "One simple meal in the evening"],
    avoid: ["Grains until the evening meal (varies by family)"],
    note: "Keep water up; a glass of lassi or chaas helps with protein and salt.",
  },
];

export const isPresetKey = (v: unknown): v is PresetKey => typeof v === "string" && PRESETS.some((p) => p.key === v);

export const CITIES: { key: string; name: string; lat: number; lng: number }[] = [
  { key: "delhi", name: "Delhi", lat: 28.61, lng: 77.21 },
  { key: "mumbai", name: "Mumbai", lat: 19.08, lng: 72.88 },
  { key: "bengaluru", name: "Bengaluru", lat: 12.97, lng: 77.59 },
  { key: "kolkata", name: "Kolkata", lat: 22.57, lng: 88.36 },
  { key: "chennai", name: "Chennai", lat: 13.08, lng: 80.27 },
  { key: "hyderabad", name: "Hyderabad", lat: 17.39, lng: 78.49 },
  { key: "pune", name: "Pune", lat: 18.52, lng: 73.86 },
  { key: "ahmedabad", name: "Ahmedabad", lat: 23.02, lng: 72.57 },
  { key: "jaipur", name: "Jaipur", lat: 26.91, lng: 75.79 },
  { key: "lucknow", name: "Lucknow", lat: 26.85, lng: 80.95 },
];

const rad = Math.PI / 180;

/**
 * Sunrise and sunset in minutes after midnight IST (UTC+5:30) for `date` at lat/lng. NOAA's
 * general solar position formula; good to a couple of minutes, which is all a vrat timer needs.
 */
export function sunTimes(date: string, lat: number, lng: number): { sunrise: number; sunset: number } {
  const d = new Date(`${date}T00:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const doy = Math.floor((d.getTime() - start) / 86_400_000);
  const g = ((2 * Math.PI) / 365) * (doy - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) / rad;
  const noonUtc = 720 - 4 * lng - eqt;
  const ist = 330;
  return { sunrise: Math.round(noonUtc - 4 * ha + ist), sunset: Math.round(noonUtc + 4 * ha + ist) };
}

export const hhmm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "am" : "pm"}`;
};

export type PresetWindow = { startMin: number; endMin: number; hours: number; label: string; sehri?: string; iftar?: string };

/** Today's window for a preset (start/end in IST minutes; end may pass midnight). */
export function presetWindow(p: FastPreset, date: string, lat = CITIES[0].lat, lng = CITIES[0].lng): PresetWindow {
  const s = sunTimes(date, lat, lng);
  if (p.window === "sun_day") {
    // Ramadan: sehri ends ~at dawn (sunrise − 1 h 20 min is a common suhoor cut-off).
    const start = p.key === "ramadan" ? s.sunrise - 80 : s.sunrise;
    const hours = Math.round(((s.sunset - start) / 60) * 2) / 2;
    return { startMin: start, endMin: s.sunset, hours, label: `${hhmm(start)} → ${hhmm(s.sunset)}`, ...(p.key === "ramadan" ? { sehri: hhmm(start), iftar: hhmm(s.sunset) } : {}) };
  }
  if (p.window === "sun_night") {
    const next = sunTimes(nextDay(date), lat, lng);
    const hours = Math.round(((next.sunrise + 1440 - s.sunset) / 60) * 2) / 2;
    return { startMin: s.sunset, endMin: next.sunrise + 1440, hours, label: `${hhmm(s.sunset)} → ${hhmm(next.sunrise)} (next day)` };
  }
  if (p.window === "sunrise_to_sunrise") {
    const next = sunTimes(nextDay(date), lat, lng);
    return { startMin: s.sunrise, endMin: next.sunrise + 1440, hours: Math.round(((next.sunrise + 1440 - s.sunrise) / 60) * 2) / 2, label: `${hhmm(s.sunrise)} → ${hhmm(next.sunrise)} next day` };
  }
  const h = p.fixedHours ?? 14;
  return { startMin: -1, endMin: -1, hours: h, label: `${h} h from when you start` };
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * When to start the timer: now if we're inside the window (backdated to its start), otherwise now
 * (the person is starting it themselves). Returns hours remaining-to-target measured from start.
 */
export function startPlan(w: PresetWindow, nowMin: number): { backdateMin: number; hours: number } {
  if (w.startMin < 0) return { backdateMin: 0, hours: w.hours };
  const inWindow = nowMin >= w.startMin && nowMin < w.endMin;
  return inWindow ? { backdateMin: nowMin - w.startMin, hours: w.hours } : { backdateMin: 0, hours: w.hours };
}
