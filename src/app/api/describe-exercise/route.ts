import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { apiUser } from "@/lib/apiAuth";
import { run } from "@/lib/ai/router";
import type { JsonSchema } from "@/lib/ai/types";
import { burnKcal, DEFAULT_WEIGHT_KG } from "@/lib/burn";
import type { Activity, DescribedExercise } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * "played badminton for an hour then walked home 20 min" → activities with minutes, intensity and
 * calories. Candidates come from bandlog.activities (the MET table): every word of the text is
 * matched against name / description / tags and the hits go into the prompt, so Haiku PICKS a
 * code and only estimates a MET when nothing in the table fits. Pricing happens here, never in
 * the model: kcal = MET × weight × hours, ×0.85 / ×1.15 for low / high intensity.
 */

type HaikuItem = { input: string; name: string; activity_code?: string | null; minutes: number; intensity?: string; est_met?: number };

const TOOL: Anthropic.Tool = {
  name: "log_activities",
  description: "Return the physical activities mentioned in the text as structured items.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            input: { type: "string", description: "The words from the text this item came from" },
            name: { type: "string", description: "Short activity name (the candidate's name when activity_code is set)" },
            activity_code: { type: "string", description: "The code of the CANDIDATE you picked, or omit when none of the candidates is the same activity" },
            minutes: { type: "number", description: "Duration in minutes" },
            intensity: { type: "string", enum: ["low", "medium", "high"], description: "low = not breaking a sweat, medium = breaking a sweat, high = breathing heavily / to failure" },
            est_met: { type: "number", description: "Only when activity_code is NOT set: your MET estimate for this activity" },
          },
          required: ["input", "name", "minutes"],
        },
      },
      unparsed: { type: "array", items: { type: "string" } },
    },
    required: ["items", "unparsed"],
  },
};

const SYSTEM = `You convert a person's description of exercise — English, Hindi or Hinglish, often dictated — into structured activities.

CANDIDATES FIRST. The user message lists CANDIDATES from the activity table: "code | name · description | MET". When a candidate is the same activity the person means, set activity_code to that code and name to that name (prefer the plainest match: "walked home" → walking moderate pace, "ran" → running general, "gym" / "weights" / "bands" → resistance training or resistance bands). Only when NO candidate fits, omit activity_code and give est_met from your own knowledge.

Durations: "an hour" = 60, "half an hour" = 30, "ek ghanta" = 60, "aadha ghanta" = 30, "20 min" = 20. When a duration is missing, use 30 and mention it in unparsed as "assumed 30 min for <activity>". Split "then" / "and" / "after that" into separate items. Intensity: default medium; "easy" / "slow" / "stroll" / "light" → low; "hard" / "sprint" / "match" / "to failure" / "brutal" → high.
Put anything that is not exercise into "unparsed". Always call the log_activities tool exactly once.`;

const STOP = new Set(["the", "and", "then", "for", "with", "a", "an", "of", "to", "in", "on", "at", "my", "i", "we", "home", "min", "mins", "minutes", "hour", "hours", "half", "some", "did", "went", "played", "play", "back", "after", "before", "morning", "evening", "today"]);

/** Stem the obvious plurals / -ing / -ed so "walked" finds "walking" and "stairs" finds "stair". */
function stems(word: string): string[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length < 3 || STOP.has(w)) return [];
  const out = new Set<string>([w]);
  if (w.endsWith("ing") && w.length > 5) out.add(w.slice(0, -3));
  if (w.endsWith("ed") && w.length > 4) out.add(w.slice(0, -2));
  if (w.endsWith("s") && w.length > 4) out.add(w.slice(0, -1));
  // "ran" / "run" / "jogged" all mean running to the table.
  if (w === "ran") out.add("run");
  if (w === "swam") out.add("swim");
  return [...out].map((s) => s.slice(0, 6));
}

export async function POST(req: Request) {
  const { user, admin } = await apiUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text ?? "").trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: "Tell me what you did" }, { status: 400 });

  try {
    // 1. Candidates from the MET table, keyed on every content word of the text.
    const terms = [...new Set(text.split(/\s+/).flatMap(stems))].slice(0, 12);
    const ors = terms.flatMap((t) => [`name.ilike.*${t}*`, `tags.cs.{${t}}`]);
    let candidates: Activity[] = [];
    if (ors.length) {
      const { data } = await admin.from("activities").select("code, name, description, met, category, tags").or(ors.join(",")).order("name").limit(60);
      candidates = ((data ?? []) as Activity[]).map((a) => ({ ...a, met: Number(a.met) }));
    }
    // Always offer the everyday set so "walked" / "ran" / "bands" have a home even if the stems missed.
    const { data: staples } = await admin.from("activities").select("code, name, description, met, category, tags").in("code", ["LI-17190", "LI-17200", "12150", "02050", "LI-BAND-M", "LI-17133", "01015", "02020"]);
    for (const s of (staples ?? []) as Activity[]) if (!candidates.some((c) => c.code === s.code)) candidates.push({ ...s, met: Number(s.met) });
    const byCode = new Map(candidates.map((c) => [c.code, c]));
    const candidateLines = candidates.map((c) => `${c.code} | ${c.name}${c.description && c.description !== "general" ? ` · ${c.description}` : ""} | MET ${c.met}`).join("\n");

    const { data: prof } = await admin.from("profiles").select("weight_kg").eq("id", user.id).maybeSingle();
    const weight = prof?.weight_kg == null ? null : Number(prof.weight_kg);

    // 2. Haiku (or whatever `exercise_parse` is routed to) picks codes + minutes + intensity.
    const isDescribed = (v: unknown): v is { items?: HaikuItem[]; unparsed?: string[] } => !!v && typeof v === "object";
    const result = await run<{ items?: HaikuItem[]; unparsed?: string[] }>(
      "exercise_parse",
      { kind: "json", system: SYSTEM, text: `CANDIDATES:\n${candidateLines || "(none)"}\n\nTEXT:\n${text}`, maxTokens: 1500, schema: TOOL.input_schema as unknown as JsonSchema, schemaName: TOOL.name },
      isDescribed,
    );
    const out = result.data;

    // 3. Price here from the table row (or the model's MET when nothing matched).
    const items: DescribedExercise[] = (out.items ?? [])
      .map((it) => {
        const minutes = Math.max(1, Math.round(Number(it.minutes) || 30));
        const intensity = (it.intensity === "low" || it.intensity === "high" ? it.intensity : "medium") as DescribedExercise["intensity"];
        const row = it.activity_code ? byCode.get(it.activity_code) : undefined;
        const met = row ? row.met : Math.max(1, Math.min(20, Number(it.est_met) || 4));
        const name = row ? (row.description && row.description !== "general" ? `${row.name} · ${row.description}` : row.name) : String(it.name || it.input || "exercise").trim();
        return { activity_code: row?.code ?? null, name, minutes, intensity, met, kcal: burnKcal(met, weight, minutes, intensity) };
      })
      .filter((i) => i.kcal > 0);

    return NextResponse.json({ items, unparsed: out.unparsed ?? [], weight_kg: weight ?? DEFAULT_WEIGHT_KG });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not work that out";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
