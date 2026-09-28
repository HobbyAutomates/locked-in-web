/**
 * v2.18 C2 AI form check: on-device rep counting and basic form tips for squat, push-up and lunge
 * from pose landmarks. Both MediaPipe Pose (web) and ML Kit Pose (Android) use the same 33-point
 * BlazePose topology, so this pure state machine is shared (Android util/FormCheck.kt ports it).
 * Nothing leaves the phone: frames are analysed in the browser / on the device and only the
 * summary (exercise, reps, tips) is saved.
 */

export type Landmark = { x: number; y: number; z?: number; visibility?: number };
export type FormExercise = "squat" | "pushup" | "lunge";

export const FORM_EXERCISES: { key: FormExercise; label: string; setup: string; library: string }[] = [
  { key: "squat", label: "Squat", setup: "Phone at hip height, side-on, whole body in frame.", library: "Bodyweight squat" },
  { key: "pushup", label: "Push-up", setup: "Phone on the floor 2 m away, side-on, head to heels in frame.", library: "Push-up" },
  { key: "lunge", label: "Lunge", setup: "Phone at hip height, side-on, whole body in frame.", library: "Lunge" },
];

export const L = { lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28 } as const;

const MIN_VIS = 0.5;

/** Angle ABC in degrees (0–180), at B. */
export function angle(a: Landmark, b: Landmark, c: Landmark): number {
  const v1 = [a.x - b.x, a.y - b.y];
  const v2 = [c.x - b.x, c.y - b.y];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const m = Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]);
  if (!m) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

/** Torso lean from vertical (0 = upright), degrees. Image y grows downwards. */
export function leanFromVertical(shoulder: Landmark, hip: Landmark): number {
  const dx = shoulder.x - hip.x;
  const dy = hip.y - shoulder.y;
  return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
}

const vis = (p: Landmark | undefined) => !!p && (p.visibility ?? 1) >= MIN_VIS;

export type Measures = { main: number; lean: number | null; line: number | null } | null;

/** The one angle that drives the count (knee for squat / lunge, elbow for push-up) plus form helpers. */
export function measure(ex: FormExercise, lm: Landmark[]): Measures {
  if (!lm || lm.length < 29) return null;
  const side = (l: number, r: number) => ((lm[l]?.visibility ?? 1) >= (lm[r]?.visibility ?? 1) ? l : r);
  if (ex === "pushup") {
    const s = side(L.lShoulder, L.rShoulder);
    const left = s === L.lShoulder;
    const [sh, el, wr, hip, an] = left ? [L.lShoulder, L.lElbow, L.lWrist, L.lHip, L.lAnkle] : [L.rShoulder, L.rElbow, L.rWrist, L.rHip, L.rAnkle];
    if (![sh, el, wr].every((i) => vis(lm[i]))) return null;
    const line = vis(lm[hip]) && vis(lm[an]) ? angle(lm[sh], lm[hip], lm[an]) : null;
    return { main: angle(lm[sh], lm[el], lm[wr]), lean: null, line };
  }
  const kneeAngle = (hip: number, knee: number, ankle: number) => (vis(lm[hip]) && vis(lm[knee]) && vis(lm[ankle]) ? angle(lm[hip], lm[knee], lm[ankle]) : null);
  const lk = kneeAngle(L.lHip, L.lKnee, L.lAnkle);
  const rk = kneeAngle(L.rHip, L.rKnee, L.rAnkle);
  if (lk == null && rk == null) return null;
  // Lunge: the front (more bent) knee; squat: the better-seen side.
  const main = ex === "lunge" ? Math.min(lk ?? 180, rk ?? 180) : side(L.lKnee, L.rKnee) === L.lKnee ? (lk ?? rk!) : (rk ?? lk!);
  const sh = side(L.lShoulder, L.rShoulder);
  const hp = sh === L.lShoulder ? L.lHip : L.rHip;
  const lean = vis(lm[sh]) && vis(lm[hp]) ? leanFromVertical(lm[sh], lm[hp]) : null;
  return { main, lean, line: null };
}

export const THRESHOLDS: Record<FormExercise, { up: number; down: number; deep: number }> = {
  // Knee angle: standing ≈ 170°, parallel ≈ 90°. `deep` = the depth a good rep reaches.
  squat: { up: 160, down: 115, deep: 100 },
  // Elbow angle: locked out ≈ 170°, chest near floor ≈ 80–90°.
  pushup: { up: 150, down: 110, deep: 95 },
  // Front knee: ≈ 90° at the bottom.
  lunge: { up: 155, down: 115, deep: 105 },
};

export type Tip = "depth" | "lean" | "hips" | "tempo";

export const TIP_TEXT: Record<FormExercise, Partial<Record<Tip, string>>> = {
  squat: { depth: "Go deeper: hips down to knee level.", lean: "Chest up: you're folding forward.", tempo: "Slow down: 2 seconds down, 1 up." },
  pushup: { depth: "Go lower: chest to a fist's height from the floor.", hips: "Straight line from shoulders to heels: squeeze your glutes.", tempo: "Control the way down." },
  lunge: { depth: "Drop the back knee closer to the floor.", lean: "Stay tall: torso upright over the hips.", tempo: "Slow and steady: no bouncing." },
};

export type RepState = {
  ex: FormExercise;
  phase: "up" | "down";
  reps: number;
  smooth: number | null;
  /** The deepest angle of the rep in progress. */
  minMain: number;
  maxLean: number;
  minLine: number;
  downAt: number | null;
  /** Tip counts over the set. */
  tips: Record<Tip, number>;
  /** Latest tip for on-screen feedback (or "good"). */
  last: Tip | "good" | null;
  goodReps: number;
};

export function newRepState(ex: FormExercise): RepState {
  return { ex, phase: "up", reps: 0, smooth: null, minMain: 180, maxLean: 0, minLine: 180, downAt: null, tips: { depth: 0, lean: 0, hips: 0, tempo: 0 }, last: null, goodReps: 0 };
}

/** One frame in, the next state out (pure). `t` = timestamp in ms. */
export function step(s: RepState, m: Measures, t: number): RepState {
  if (!m) return s;
  const th = THRESHOLDS[s.ex];
  const smooth = s.smooth == null ? m.main : s.smooth * 0.6 + m.main * 0.4;
  const n: RepState = { ...s, tips: { ...s.tips }, smooth, minMain: Math.min(s.minMain, smooth), maxLean: m.lean != null ? Math.max(s.maxLean, m.lean) : s.maxLean, minLine: m.line != null ? Math.min(s.minLine, m.line) : s.minLine };
  if (s.phase === "up" && smooth < th.down) {
    n.phase = "down";
    n.downAt = t;
  } else if (s.phase === "down" && smooth > th.up) {
    // A rep: judge it, then reset the per-rep trackers.
    n.phase = "up";
    n.reps = s.reps + 1;
    let tip: Tip | null = null;
    if (n.minMain > th.deep) tip = "depth";
    else if (s.ex !== "pushup" && n.maxLean > (s.ex === "squat" ? 50 : 30)) tip = "lean";
    else if (s.ex === "pushup" && n.minLine < 155) tip = "hips";
    else if (s.downAt != null && t - s.downAt < 350) tip = "tempo";
    if (tip) n.tips[tip] += 1;
    else n.goodReps += 1;
    n.last = tip ?? "good";
    n.minMain = 180;
    n.maxLean = 0;
    n.minLine = 180;
    n.downAt = null;
  }
  return n;
}

/** The set summary: reps, % clean, and the 1–2 tips that came up most. */
export function summary(s: RepState): { reps: number; clean: number; tips: string[] } {
  const tips = (Object.entries(s.tips) as [Tip, number][])
    .filter(([, c]) => c > 0 && c >= Math.max(1, s.reps * 0.25))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => TIP_TEXT[s.ex][k] ?? "")
    .filter(Boolean);
  const clean = s.reps ? Math.round((s.goodReps / s.reps) * 100) : 0;
  if (!tips.length && s.reps) tips.push("Clean set: depth and position looked good.");
  return { reps: s.reps, clean, tips };
}
