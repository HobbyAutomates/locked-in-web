"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeBarcode } from "@/lib/image";
import sc from "./scan.module.css";

/**
 * v2.12 "Scan 1 · camera": a full-bleed viewfinder with corner brackets, one hint line, the four
 * modes, the shutter, Gallery and Flash. It only produces a photo (a File); ScanScreen's existing
 * pick() does everything after that, exactly as for a photo chosen from the file picker.
 *
 * The live preview is a progressive enhancement: when getUserMedia is unavailable or refused, the
 * shutter opens the phone's own camera through the file input instead (capture="environment").
 * Modes only change the framing and the hint (the server still works out what the photo is);
 * in Barcode mode the preview is also polled for bars and the frame is taken as soon as one reads.
 */

/** v2.13: "menu" sends the photo to the restaurant menu scan (/api/scan-menu) instead of /api/scan. */
export type ScanMode = "food" | "barcode" | "label" | "facts" | "menu";

export const MODES: { key: ScanMode; label: string; hint: string; title: string }[] = [
  { key: "food", label: "Scan food", hint: "Fit the whole plate in the frame", title: "Scan food" },
  { key: "barcode", label: "Barcode", hint: "Line up the bars inside the frame", title: "Barcode" },
  { key: "label", label: "Food label", hint: "Fit the front of the pack in the frame", title: "Food label" },
  { key: "facts", label: "Nutrition facts", hint: "Fill the frame with the nutrition table", title: "Nutrition facts" },
  { key: "menu", label: "Menu", hint: "Fit the dishes on the menu in the frame", title: "Menu" },
];

export const FRAME: Record<ScanMode, { w: string; h: string }> = {
  food: { w: "72%", h: "40%" },
  barcode: { w: "74%", h: "20%" },
  label: { w: "64%", h: "44%" },
  facts: { w: "66%", h: "46%" },
  menu: { w: "78%", h: "56%" },
};

// ---- thin line icons (24 grid, stroke 1.9, no emoji) ----
function Ico({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
export const ICON = {
  close: "M18 6L6 18M6 6l12 12",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  flash: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  gallery: "M4 5h16v14H4zM4 15l4-4 5 5 3-3 4 4",
  food: "M3 11h18M5 11a7 7 0 0 0 14 0M12 4v3",
  barcode: "M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14",
  label: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01",
  facts: "M4 6h16M4 12h10M4 18h13",
  menu: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z",
  camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
} as const;
export function ScanIcon({ name, size = 20 }: { name: keyof typeof ICON; size?: number }) {
  return <Ico d={ICON[name]} size={size} />;
}

/** Corner brackets (and the barcode scan line) around the framing area. */
export function Brackets({ mode, white, line }: { mode: ScanMode; white?: boolean; line?: boolean }) {
  const f = FRAME[mode];
  const c = `${sc.corner}${white ? ` ${sc.cornerWhite}` : ""}`;
  return (
    <div className={sc.frame} style={{ width: f.w, height: f.h }} aria-hidden="true">
      <span className={`${c} ${sc.tl}`} />
      <span className={`${c} ${sc.tr}`} />
      <span className={`${c} ${sc.bl}`} />
      <span className={`${c} ${sc.br}`} />
      {line ? <span className={sc.scanLine} /> : null}
    </div>
  );
}

// ---- camera ----

type ImageCaptureLike = { takePhoto: () => Promise<Blob> };
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [torchOk, setTorchOk] = useState(false);
  const [torch, setTorch] = useState(false);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOn(false);
    setTorch(false);
    setTorchOk(false);
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || streamRef.current) return;
    setStarting(true);
    setFailed(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } } });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      const track = stream.getVideoTracks()[0];
      setTorchOk(!!(track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch);
      setOn(true);
    } catch (e) {
      setFailed(e instanceof Error && e.name === "NotAllowedError" ? "Camera access is off. Use the shutter to open your camera app, or allow the camera in settings." : "Couldn't start the camera here. The shutter opens your camera app instead.");
    } finally {
      setStarting(false);
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch((t) => !t);
    } catch {
      setTorchOk(false);
    }
  }, [torch]);

  /** The current frame as a JPEG File: a full-resolution still where ImageCapture exists, else the video frame. */
  const grab = useCallback(async (): Promise<File | null> => {
    const track = streamRef.current?.getVideoTracks()[0];
    const IC = (globalThis as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
    if (track && IC) {
      try {
        const blob = await new IC(track).takePhoto();
        if (blob.size) return new File([blob], "scan.jpg", { type: blob.type || "image/jpeg" });
      } catch {
        // fall through to the video frame
      }
    }
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    return blob ? new File([blob], "scan.jpg", { type: "image/jpeg" }) : null;
  }, []);

  /** A small data URL of the current frame, for the in-browser barcode check. */
  const peek = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const k = Math.min(1, 1000 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * k);
    canvas.height = Math.round(v.videoHeight * k);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  // Stop the camera when the page is hidden or the stage unmounts.
  useEffect(() => {
    const vis = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      stop();
    };
  }, [stop]);

  // Start straight away only when the camera is already allowed; otherwise wait for a tap.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    perms
      ?.query({ name: "camera" as PermissionName })
      .then((st) => {
        if (!cancelled && st.state === "granted") void start();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [supported, start]);

  return { videoRef, on, starting, failed, supported, start, stop, grab, peek, torchOk, torch, toggleTorch };
}

export default function CameraStage({
  mode,
  onMode,
  busy,
  stage,
  onPhoto,
  onNativeCamera,
  onGallery,
  onClose,
  onTypeDigits,
}: {
  mode: ScanMode;
  onMode: (m: ScanMode) => void;
  busy: boolean;
  stage: string;
  /** A photo taken from the live preview. */
  onPhoto: (file: File) => void;
  /** No live preview: open the phone's camera (file input with capture). */
  onNativeCamera: () => void;
  onGallery: () => void;
  onClose: () => void;
  onTypeDigits: () => void;
}) {
  const { videoRef, on, starting, failed, supported, start, stop, grab, peek, torchOk, torch, toggleTorch } = useCamera();
  const [help, setHelp] = useState(false);
  const [shooting, setShooting] = useState(false);
  const m = MODES.find((x) => x.key === mode) ?? MODES[0];

  const shoot = useCallback(async () => {
    if (shooting || busy) return;
    if (!on) {
      onNativeCamera();
      return;
    }
    setShooting(true);
    try {
      const file = await grab();
      if (file) {
        stop();
        onPhoto(file);
      } else onNativeCamera();
    } finally {
      setShooting(false);
    }
  }, [shooting, busy, on, grab, stop, onPhoto, onNativeCamera]);

  // Barcode mode: look for bars in the preview about once a second; take the photo on a read.
  useEffect(() => {
    if (mode !== "barcode" || !on || busy) return;
    let live = true;
    let running = false;
    const id = window.setInterval(async () => {
      if (running || !live) return;
      running = true;
      try {
        const url = peek();
        if (url && (await decodeBarcode(url)) && live) {
          live = false;
          void shoot();
        }
      } finally {
        running = false;
      }
    }, 900);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [mode, on, busy, peek, shoot]);

  return (
    <section className={sc.stage} aria-label="Scan">
      <div className={sc.placeholder} />
      <video ref={videoRef} className={sc.video} playsInline muted autoPlay aria-hidden="true" style={{ opacity: on ? 1 : 0, transition: "opacity 0.4s ease" }} />
      <div className={sc.scrimTop} />
      <div className={sc.scrimBottom} />

      <div className={sc.topBar}>
        <button type="button" className={sc.round} aria-label="Close" onClick={onClose}>
          <ScanIcon name="close" />
        </button>
        <span className={sc.title}>{m.title}</span>
        <button type="button" className={`${sc.round}${help ? ` ${sc.roundOn}` : ""}`} aria-label="Help" aria-expanded={help} onClick={() => setHelp((h) => !h)}>
          <ScanIcon name="help" />
        </button>
      </div>

      {help ? (
        <div className={sc.help} role="note">
          Point it at a pack&apos;s barcode, its nutrition label, or your plate: it works out which. Menu mode reads a restaurant menu and picks the best dish for what&apos;s left today.
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={sc.lightBtn}
              onClick={() => {
                setHelp(false);
                onTypeDigits();
              }}
            >
              Type barcode digits
            </button>
          </div>
        </div>
      ) : null}

      <Brackets mode={mode} white={!on} line={mode === "barcode" && on} />

      {!on ? (
        <div className={sc.camOff}>
          {supported && !failed ? (
            <button type="button" className={sc.lightBtn} disabled={starting} onClick={() => void start()}>
              {starting ? "Starting camera…" : "Turn on camera"}
            </button>
          ) : null}
          {failed ? <span>{failed}</span> : !supported ? <span>Tap the shutter to take a photo.</span> : null}
        </div>
      ) : null}

      <div className={sc.hint} style={{ top: `calc(44% + ${parseFloat(FRAME[mode].h) / 2}% + 18px)` }}>
        {m.hint}
      </div>

      {busy ? (
        <div className={sc.status} role="status">
          {stage || "Working…"}
          <div className={sc.statusTrack}>
            <div className="shimmer h-full w-1/2 rounded-full" style={{ background: "#f5f5f7" }} />
          </div>
        </div>
      ) : (
        <div className={sc.bottom}>
          <div className={sc.modes} role="tablist" aria-label="Scan mode">
            {MODES.map((x) => (
              <button key={x.key} type="button" role="tab" aria-selected={x.key === mode} className={`${sc.mode}${x.key === mode ? ` ${sc.modeOn}` : ""}`} onClick={() => onMode(x.key)}>
                <ScanIcon name={x.key} />
                {x.label}
              </button>
            ))}
          </div>
          <div className={sc.shutterRow}>
            <button type="button" className={sc.side} onClick={onGallery}>
              <span className={sc.round}>
                <ScanIcon name="gallery" />
              </span>
              Gallery
            </button>
            <button type="button" className={sc.shutter} aria-label="Take photo" disabled={shooting} onClick={() => void shoot()}>
              <span />
            </button>
            <button type="button" className={sc.side} disabled={!torchOk} aria-pressed={torch} onClick={() => void toggleTorch()} title={torchOk ? undefined : "No flash control on this camera"}>
              <span className={`${sc.round}${torch ? ` ${sc.roundOn}` : ""}`}>
                <ScanIcon name="flash" />
              </span>
              Flash
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
