/**
 * v2.18 E5 data export: CSV (meals with their items, workouts, activities, weights, water) and a
 * printable page the browser saves as PDF. Pure CSV building; the route is /api/export.
 * Android: util/ExportData.kt writes the same columns (CSV via the share sheet, PDF via PdfDocument).
 */
export type Csv = { name: string; header: string[]; rows: (string | number | null | undefined)[][] };

/** RFC 4180-ish: quote when needed, double the quotes; CRLF line ends; a BOM so Excel reads UTF-8. */
export function toCsv(c: Pick<Csv, "header" | "rows">, bom = true): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return "";
    const s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "") : String(v);
    // Formula injection guard for spreadsheet apps.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [c.header.map(cell).join(","), ...c.rows.map((r) => r.map(cell).join(","))];
  return (bom ? "﻿" : "") + lines.join("\r\n") + "\r\n";
}

export const EXPORT_KINDS = ["meals", "workouts", "activities", "weights", "water"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function parseExportKind(v: unknown): ExportKind | "all" {
  return (EXPORT_KINDS as readonly string[]).includes(v as string) ? (v as ExportKind) : "all";
}

export const EXPORT_HEADERS: Record<ExportKind, string[]> = {
  meals: ["date", "meal", "item", "grams", "kcal", "protein_g", "carbs_g", "fat_g", "meal_text"],
  workouts: ["date", "kind", "minutes", "muscles", "exercises", "notes"],
  activities: ["date", "name", "minutes", "intensity", "kcal", "steps", "distance_km", "source"],
  weights: ["date", "weight_kg", "note"],
  water: ["date", "ml", "vessel"],
};

type Item = { name?: unknown; grams?: unknown; calories?: unknown; protein_g?: unknown; carbs_g?: unknown; fat_g?: unknown };

export function mealRows(meals: { date: string; raw_text?: string | null; meal_type?: string | null; items?: Item[] }[]): Csv["rows"] {
  const out: Csv["rows"] = [];
  for (const m of meals) {
    const items = m.items?.length ? m.items : [{}];
    for (const it of items) out.push([m.date, m.meal_type ?? "", String(it.name ?? ""), num(it.grams), num(it.calories), num(it.protein_g), num(it.carbs_g), num(it.fat_g), m.raw_text ?? ""]);
  }
  return out;
}

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function exportFilename(kind: ExportKind | "all", today: string, ext: "csv" | "zip" | "html" = "csv"): string {
  return `locked-in-${kind}-${today}.${ext}`;
}

/** One CSV with every section stacked, each under a "# section" line (what "all" downloads). */
export function combinedCsv(parts: Csv[]): string {
  return "﻿" + parts.map((p) => `# ${p.name}\r\n${toCsv(p, false)}`).join("\r\n");
}
