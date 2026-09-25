"use client";

import type { ReactNode } from "react";
import { Brackets, ScanIcon, type ScanMode } from "./CameraStage";
import sc from "./scan.module.css";

/**
 * The taken photo, full-bleed and dark like the viewfinder, with the close button. While the scan
 * runs it shows the frame, a sweeping scan line and the stage text; afterwards `children` float
 * over it (the plate's Calories / Protein chips).
 */
export default function PhotoStage({
  src,
  title,
  onClose,
  busy,
  stage,
  mode = "food",
  short,
  children,
}: {
  src: string | null;
  title: string;
  onClose?: () => void;
  busy?: boolean;
  stage?: string;
  mode?: ScanMode;
  short?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={`${sc.stage} ${short ? sc.photoStageShort : sc.photoStage}`} aria-label={title}>
      <div className={sc.placeholder} />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local canvas data URL or a signed Storage URL
        <img src={src} alt="What you scanned" className={sc.photo} />
      ) : null}
      <div className={sc.scrimTop} />
      {busy ? <div className={sc.dim} /> : null}
      <div className={sc.topBar}>
        {onClose ? (
          <button type="button" className={sc.round} aria-label="Close" onClick={onClose}>
            <ScanIcon name="close" />
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
        <span className={sc.title}>{title}</span>
        <span style={{ width: 44 }} />
      </div>
      {busy ? (
        <>
          <Brackets mode={mode} line />
          <div className={sc.status} role="status">
            {stage || "Working…"}
            <div className={sc.statusTrack}>
              <div className="shimmer h-full w-1/2 rounded-full" style={{ background: "#f5f5f7" }} />
            </div>
          </div>
        </>
      ) : null}
      {children}
    </section>
  );
}
