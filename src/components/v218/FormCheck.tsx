"use client";

import { useEffect, useRef, useState } from "react";
import SubPage from "@/components/SubPage";
import { FORM_EXERCISES, TIP_TEXT, measure, newRepState, step, summary, type FormExercise, type Landmark, type RepState } from "@/lib/v218/formCheck";
import { ErrorNote } from "../ui";
import { AccentButton, GhostButton, PCard, Pill } from "../nutrition/kit";
import { api } from "./api";

/**
 * v2.18 C2 AI form check (web): MediaPipe Pose Landmarker (loaded from the jsDelivr CDN only when
 * this page starts, so it adds nothing to the app bundle) runs in the browser on the camera feed;
 * lib/v218/formCheck.ts counts reps and judges depth / lean / hips. No video leaves the device;
 * only the summary is saved (schema_v43 form_checks, skipped when that isn't there yet).
 */
const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type Landmarker = { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: Landmark[][] }; close: () => void };
type VisionModule = {
  FilesetResolver: { forVisionTasks: (base: string) => Promise<unknown> };
  PoseLandmarker: { createFromOptions: (fs: unknown, o: Record<string, unknown>) => Promise<Landmarker> };
};

// A real runtime import from a URL (the bundler must not try to resolve it).
const importUrl = new Function("u", "return import(u)") as (u: string) => Promise<VisionModule>;

let cached: Promise<Landmarker> | null = null;
function loadLandmarker(): Promise<Landmarker> {
  if (!cached) {
    cached = (async () => {
      const mod = await importUrl(`${VISION}/vision_bundle.mjs`);
      const fs = await mod.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
      try {
        return await mod.PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate: "GPU" }, runningMode: "VIDEO", numPoses: 1 });
      } catch {
        return await mod.PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "VIDEO", numPoses: 1 });
      }
    })();
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

export default function FormCheck() {
  const [ex, setEx] = useState<FormExercise>("squat");
  const [phase, setPhase] = useState<"pick" | "loading" | "live" | "done">("pick");
  const [state, setState] = useState<RepState>(() => newRepState("squat"));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const st = useRef<RepState>(newRepState("squat"));

  function stopCamera() {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(() => () => stopCamera(), []);

  async function start() {
    setErr(null);
    setSaved(null);
    setPhase("loading");
    st.current = newRepState(ex);
    setState(st.current);
    try {
      const [lm, media] = await Promise.all([loadLandmarker(), navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })]);
      stream.current = media;
      const v = video.current!;
      v.srcObject = media;
      await v.play();
      setPhase("live");
      let last = -1;
      const loop = () => {
        raf.current = requestAnimationFrame(loop);
        if (v.readyState < 2 || v.currentTime === last) return;
        last = v.currentTime;
        const t = performance.now();
        const res = lm.detectForVideo(v, t);
        const pts = res.landmarks?.[0];
        draw(pts ?? null);
        if (!pts) return;
        // Angles need square pixels: landmarks are normalised per axis, so scale back to the frame.
        const w = v.videoWidth || 640;
        const h = v.videoHeight || 480;
        const px = pts.map((q) => ({ x: q.x * w, y: q.y * h, visibility: q.visibility }));
        const next = step(st.current, measure(st.current.ex, px), t);
        if (next.reps !== st.current.reps || next.phase !== st.current.phase) setState(next);
        st.current = next;
      };
      loop();
    } catch (e) {
      stopCamera();
      setPhase("pick");
      const name = e instanceof Error ? e.name : "";
      setErr(name === "NotAllowedError" ? "Camera access is blocked. Allow it in the browser's site settings." : name === "NotFoundError" ? "No camera found on this device." : "Form check couldn't start here. Try Chrome or Safari on your phone, with a connection for the first load.");
    }
  }

  function draw(pts: Landmark[] | null) {
    const c = canvas.current;
    const v = video.current;
    if (!c || !v) return;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    if (!pts) return;
    g.lineWidth = 5;
    g.strokeStyle = "rgba(255,138,61,0.95)";
    g.lineCap = "round";
    for (const [a, b] of BONES) {
      const p = pts[a];
      const q = pts[b];
      if (!p || !q || (p.visibility ?? 1) < 0.5 || (q.visibility ?? 1) < 0.5) continue;
      g.beginPath();
      g.moveTo(p.x * w, p.y * h);
      g.lineTo(q.x * w, q.y * h);
      g.stroke();
    }
    g.fillStyle = "#f4efe6";
    for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      const p = pts[i];
      if (!p || (p.visibility ?? 1) < 0.5) continue;
      g.beginPath();
      g.arc(p.x * w, p.y * h, 6, 0, Math.PI * 2);
      g.fill();
    }
  }

  async function finish() {
    stopCamera();
    setState(st.current);
    setPhase("done");
    const s = summary(st.current);
    if (!s.reps) return;
    try {
      const r = await api<{ saved: boolean; error?: string }>("form-check", { method: "POST", body: { exercise: st.current.ex, reps: s.reps, clean_pct: s.clean, tips: s.tips, platform: "web" } });
      setSaved(r.saved ? "Saved to your form-check history." : null);
    } catch {
      setSaved(null);
    }
  }

  const def = FORM_EXERCISES.find((x) => x.key === ex)!;
  const live = phase === "live" || phase === "loading";
  const tip = state.last && state.last !== "good" ? TIP_TEXT[state.ex][state.last] : state.last === "good" ? "Good rep" : null;
  const sum = summary(state);

  return (
    <SubPage title="Form check" back="/train">
      <div className="flex flex-col gap-3.5">
        {phase === "pick" || phase === "done" ? (
          <PCard label="Exercise">
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Exercise">
              {FORM_EXERCISES.map((x) => (
                <button key={x.key} type="button" role="radio" aria-checked={ex === x.key} className="chip press justify-center" style={{ height: 40 }} onClick={() => setEx(x.key)}>
                  {x.label}
                </button>
              ))}
            </div>
            <p className="text-[13px] leading-[18px] muted">{def.setup}</p>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Camera">
              {(["user", "environment"] as const).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={facing === f} className="chip press justify-center" style={{ height: 36 }} onClick={() => setFacing(f)}>
                  {f === "user" ? "Front camera" : "Back camera"}
                </button>
              ))}
            </div>
            <ErrorNote text={err} />
            <AccentButton onClick={() => void start()}>{phase === "done" ? "Another set" : "Start camera"}</AccentButton>
            <p className="text-[11px] leading-4 muted">Runs on your device. Video never leaves your phone; only the rep count and tips are saved.</p>
          </PCard>
        ) : null}

        <div className="relative overflow-hidden rounded-[22px]" style={{ background: "#0d0c0b", aspectRatio: "3 / 4", display: live ? "block" : "none" }}>
          <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} />
          <canvas ref={canvas} className="absolute inset-0 h-full w-full object-cover" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} aria-hidden />
          <div className="absolute left-3 top-3 rounded-2xl px-3 py-2" style={{ background: "rgba(13,12,11,0.7)", color: "#f4efe6" }}>
            <span className="block text-[11px] font-bold uppercase" style={{ letterSpacing: ".08em", opacity: 0.7 }}>
              {def.label}
            </span>
            <b className="num text-[40px] leading-none">{state.reps}</b>
          </div>
          {phase === "loading" ? (
            <p className="absolute inset-x-0 top-1/2 text-center text-[14px] font-semibold" style={{ color: "#f4efe6" }}>
              Loading the pose model…
            </p>
          ) : null}
          {tip ? (
            <p className="absolute inset-x-3 bottom-20 rounded-2xl px-3 py-2 text-center text-[14px] font-semibold" style={{ background: state.last === "good" ? "rgba(46,160,90,0.9)" : "rgba(255,138,61,0.92)", color: "#0d0c0b" }} aria-live="polite">
              {tip}
            </p>
          ) : null}
          <div className="absolute inset-x-3 bottom-3">
            <GhostButton onClick={() => void finish()} className="w-full">
              Finish set
            </GhostButton>
          </div>
        </div>

        {phase === "done" ? (
          <PCard label="Set summary">
            <div className="flex items-center justify-between">
              <p className="text-[16px] font-semibold">
                {sum.reps} {def.label.toLowerCase()}
                {sum.reps === 1 ? "" : "s"}
              </p>
              {sum.reps ? <Pill tone={sum.clean >= 70 ? "good" : "warn"}>{sum.clean}% clean</Pill> : null}
            </div>
            {sum.reps ? (
              <ul className="flex flex-col gap-1 text-[13.5px] leading-[19px]">
                {sum.tips.map((t) => (
                  <li key={t}>· {t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] muted">No reps counted. Make sure your whole body is in frame, side-on, and move through the full range.</p>
            )}
            {saved ? <p className="text-[12px] muted">{saved}</p> : null}
          </PCard>
        ) : null}
      </div>
    </SubPage>
  );
}
