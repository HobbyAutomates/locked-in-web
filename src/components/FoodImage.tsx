"use client";

import { useEffect, useRef, useState } from "react";
import { foodKey } from "@/lib/foodKey";
import { Barcode, Bowl, Drop, Glass } from "./icons";

export type FoodImageKind = "preset" | "product" | "generic";

/**
 * v2.4: a food's picture — the stored `image_url` when the row has one, else fetched lazily from
 * /api/food-image once the tile scrolls into view, and swapped in with a fade. Until then (and on
 * a miss or a broken URL) the caller's `fallback` icon shows, so nothing ever looks empty.
 *
 * One request per food per page: results are shared in memory and remembered in localStorage.
 */

const LS = "li.foodimg.v1";
const MISS_TTL = 24 * 3600 * 1000;
type Entry = { u: string | null; t: number };
const memory = new Map<string, Promise<string | null>>();
let store: Record<string, Entry> | null = null;

function readStore(): Record<string, Entry> {
  if (store) return store;
  try {
    store = JSON.parse(localStorage.getItem(LS) || "{}") as Record<string, Entry>;
  } catch {
    store = {};
  }
  return store;
}

function remember(key: string, u: string | null) {
  const s = readStore();
  s[key] = { u, t: Date.now() };
  try {
    const keys = Object.keys(s);
    if (keys.length > 600) for (const k of keys.slice(0, keys.length - 500)) delete s[k];
    localStorage.setItem(LS, JSON.stringify(s));
  } catch {
    // storage full or blocked: memory still dedupes this page
  }
}

/** Known URL for a name without a network call, if we have one. */
function known(key: string): string | null | undefined {
  const e = readStore()[key];
  if (!e) return undefined;
  if (e.u) return e.u;
  return Date.now() - e.t < MISS_TTL ? null : undefined;
}

export function lookupFoodImage(name: string, kind: FoodImageKind = "generic"): Promise<string | null> {
  const key = foodKey(name);
  if (!key) return Promise.resolve(null);
  const k = known(key);
  if (k !== undefined) return Promise.resolve(k);
  let p = memory.get(key);
  if (!p) {
    p = fetch(`/api/food-image?q=${encodeURIComponent(name.slice(0, 120))}&kind=${kind}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ url: string | null }>) : { url: null }))
      .then((d) => {
        remember(key, d.url ?? null);
        return d.url ?? null;
      })
      .catch(() => null);
    memory.set(key, p);
  }
  return p;
}

export default function FoodImage({
  name,
  kind = "generic",
  src,
  size = 40,
  radius = 12,
  fallback,
  className,
}: {
  name: string;
  kind?: FoodImageKind;
  /** A stored image_url (preset, saved meal, parsed item) — used as is, no lookup. */
  src?: string | null;
  size?: number;
  radius?: number;
  /** The icon / tile shown until (or instead of) a picture. Should be `size` square. */
  fallback: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(src ?? null);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  // A new row (or a new stored URL) starts over.
  const [prev, setPrev] = useState({ name, src });
  if (prev.name !== name || prev.src !== src) {
    setPrev({ name, src });
    setUrl(src ?? null);
    setLoaded(false);
    setBroken(false);
  }

  useEffect(() => {
    if (src || !name.trim()) return;
    const el = ref.current;
    if (!el) return;
    let live = true;
    const go = () =>
      void lookupFoodImage(name, kind).then((u) => {
        if (live && u) setUrl(u);
      });
    if (typeof IntersectionObserver === "undefined") {
      go();
      return () => {
        live = false;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          go();
        }
      },
      { rootMargin: "160px" },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [name, kind, src]);

  const showImg = url && !broken;
  return (
    <span
      ref={ref}
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden ${className ?? ""}`}
      style={{ width: size, height: size, borderRadius: radius }}
      aria-hidden="true"
    >
      {showImg && loaded ? null : <span className="col-start-1 row-start-1 grid place-items-center">{fallback}</span>}
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- public 512 px JPEG in Supabase Storage, already sized
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className="col-start-1 row-start-1 object-cover"
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            border: "1px solid var(--hair)",
            background: "var(--card2)",
            opacity: loaded ? 1 : 0,
            transition: "opacity 220ms ease",
          }}
        />
      ) : null}
    </span>
  );
}

/** The icon tile a food shows before (or instead of) its picture — the same look as the old rows. */
export function FoodFallback({ size = 40, category, product = false }: { size?: number; category?: string | null; product?: boolean }) {
  const drink = category === "drink";
  const fat = category === "fat";
  const icon = Math.round(size * 0.5);
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 36 ? 12 : 8,
        background: drink ? "var(--blue-bg)" : product ? "var(--card2)" : "var(--orange-bg)",
        color: drink ? "var(--blue)" : product ? "var(--muted)" : "var(--orange)",
      }}
    >
      {product ? <Barcode size={icon} /> : drink ? <Glass size={icon} /> : fat ? <Drop size={icon} /> : <Bowl size={icon} />}
    </span>
  );
}
