import { createHash } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { foodKey } from "./foodKey";

/**
 * v2.4 shared food-image service (web + Android). A food name → one good picture, found once,
 * re-encoded to a 512 px JPEG, stored in the public `food-images` bucket and cached by its
 * normalised key in bandlog.food_images. We never hotlink the source.
 *
 * Resolution order, first good hit wins:
 *   a. Google Custom Search (only when GOOGLE_CSE_KEY + GOOGLE_CSE_ID are set)
 *   b. Open Food Facts product search — only for branded names / kind=product
 *   c. DuckDuckGo images (no key), then Bing images (no key) as its twin when DDG throttles
 *   d. Wikimedia Commons
 *   e. miss → cached as miss=true for a week
 */

export type FoodImageKind = "preset" | "product" | "generic";
export type FoodImageResult = { key: string; url: string | null; source: string | null; cached: boolean };
type Candidate = { url: string; width?: number; height?: number; minSide?: number };
type Admin = ReturnType<typeof foodImageAdmin>;

const BUCKET = "food-images";
const SOURCE_TIMEOUT = 6000;
const TOTAL_BUDGET = 19000;
const MISS_TTL_MS = 7 * 24 * 3600 * 1000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BOT_UA = "LockedIn/2.4 (food pictures; sohumai.team@gmail.com)";

/** Brands people actually log in India; a hit sends the name to Open Food Facts first. */
const BRANDS =
  /\b(amul|pintola|maggi|haldiram'?s?|britannia|parle|nestle|kellogg'?s?|yoga ?bar|mtr|epigamia|myprotein|muscle ?blaze|optimum|on gold|lays|lay'?s|kurkure|cadbury|bournvita|horlicks|saffola|tata|patanjali|mother dairy|nandini|sleepy owl|raw pressery|paper boat|bingo|sunfeast|oreo|dabur|tropicana|kissan|knorr|ching'?s|quaker|true elements|the whole truth|whole truth|super ?you|nutella|hershey'?s|red ?bull|coca[- ]?cola|coke|pepsi|sprite|thums up|monster|gatorade|kitkat|dairy milk|5 star|snickers|milky mist|go cheese|act ii|bikano|balaji|too yumm|mcdonald'?s|kfc|domino'?s|subway|starbucks|chai point|blue tokai|nescafe|bru|sundrop|fortune|aashirvaad|id fresh|itc|yippee|top ramen|wai wai|hershey|ritebite|max protein)\b/i;
const DRINKISH = /\b(water|juice|shake|smoothie|coffee|tea|chai|milk|lassi|chaas|buttermilk|soda|cola|drink|beer|wine|nimbu pani|sharbat|kombucha)\b/i;

export function foodImageAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "bandlog" },
    auth: { persistSession: false },
  });
}

export function looksBranded(name: string, kind: FoodImageKind): boolean {
  return kind === "product" || BRANDS.test(name) || /\b[A-Z]{2,}\b/.test(name);
}

/** Cached picture URLs for many names at once (parse-meal, lists). Never searches. */
export async function cachedFoodImages(admin: Admin, names: string[]): Promise<Map<string, string>> {
  const keys = [...new Set(names.map(foodKey).filter(Boolean))];
  const out = new Map<string, string>();
  if (!keys.length) return out;
  const { data } = await admin.from("food_images").select("key, url").in("key", keys.slice(0, 200)).not("url", "is", null);
  for (const r of (data ?? []) as { key: string; url: string | null }[]) if (r.url) out.set(r.key, r.url);
  return out;
}

/** One cached row, or null when the key has never been looked up. */
export async function cachedFoodImage(admin: Admin, key: string): Promise<{ url: string | null; miss: boolean; created_at: string | null; source: string | null } | null> {
  const { data } = await admin.from("food_images").select("url, miss, created_at, source").eq("key", key).maybeSingle();
  if (!data) return null;
  return { url: (data.url as string | null) ?? null, miss: Boolean(data.miss), created_at: (data.created_at as string | null) ?? null, source: (data.source as string | null) ?? null };
}

// One resolve per key at a time, per server instance.
const inflight = new Map<string, Promise<FoodImageResult>>();

export async function resolveFoodImage(
  name: string,
  opts: { kind?: FoodImageKind; query?: string; refresh?: boolean; admin?: Admin } = {},
): Promise<FoodImageResult> {
  const key = foodKey(name);
  if (!key) return { key, url: null, source: null, cached: false };
  const admin = opts.admin ?? foodImageAdmin();
  if (!opts.refresh) {
    const hit = await cachedFoodImage(admin, key);
    if (hit?.url) return { key, url: hit.url, source: hit.source, cached: true };
    if (hit?.miss && hit.created_at && Date.now() - Date.parse(hit.created_at) < MISS_TTL_MS) return { key, url: null, source: null, cached: true };
  }
  const running = inflight.get(key);
  if (running) return running;
  const p = doResolve(admin, key, name, opts.kind ?? "generic", opts.query).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function doResolve(admin: Admin, key: string, name: string, kind: FoodImageKind, query?: string): Promise<FoodImageResult> {
  const deadline = Date.now() + TOTAL_BUDGET;
  const branded = looksBranded(name, kind);
  const base = (query || key).trim();
  // Dishes get " food" (so "roti" is bread, not a person); drinks and brands search as written
  // (a glass, a bottle or a coconut for "coconut water"; the pack shot for a brand).
  const webQuery = query || (branded || DRINKISH.test(key) || /\bfood\b/.test(key) ? key : `${key} food`);

  const sources: { name: string; find: () => Promise<Candidate[]>; tries: number }[] = [];
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID) sources.push({ name: "google", find: () => fromGoogle(webQuery, deadline), tries: 3 });
  if (branded) sources.push({ name: "off", find: () => fromOpenFoodFacts(query && !/indian food$/.test(query) ? query : key, deadline), tries: 2 });
  sources.push({ name: "ddg", find: () => fromDuckDuckGo(webQuery, deadline), tries: 3 });
  sources.push({ name: "bing", find: () => fromBing(webQuery, deadline), tries: 3 });
  sources.push({ name: "wikimedia", find: () => fromWikimedia(branded ? base : key, deadline), tries: 2 });

  const deadHosts = new Set<string>();
  for (const s of sources) {
    if (Date.now() > deadline - 1500) break;
    let cands: Candidate[] = [];
    const t0 = Date.now();
    try {
      cands = await s.find();
    } catch (e) {
      debug(key, s.name, "failed", e instanceof Error ? e.message : e, `${Date.now() - t0} ms`);
      continue;
    }
    debug(key, s.name, `${cands.length} candidates`, `${Date.now() - t0} ms`);
    for (const c of cands.slice(0, s.tries)) {
      if (Date.now() > deadline - 1000) break;
      const host = hostOf(c.url);
      if (deadHosts.has(host)) continue;
      const img = await fetchImage(c, deadline).catch(() => {
        // A host that times out once (e.g. images.openfoodfacts.org from some networks) is skipped for the rest of this resolve.
        deadHosts.add(host);
        return null;
      });
      if (!img) continue;
      const url = await store(admin, key, img).catch(() => null);
      if (!url) continue;
      await admin.from("food_images").upsert({ key, query: s.name === "off" ? key : webQuery, url, source: s.name, width: img.width, height: img.height, miss: false, created_at: new Date().toISOString() });
      return { key, url, source: s.name, cached: false };
    }
  }
  await admin.from("food_images").upsert({ key, query: webQuery, url: null, source: null, width: null, height: null, miss: true, created_at: new Date().toISOString() });
  return { key, url: null, source: null, cached: false };
}

// ---- sources ----

function hostOf(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
}

function debug(...parts: unknown[]) {
  if (process.env.FOOD_IMAGE_DEBUG) console.log("[food-image]", ...parts);
}

function signal(deadline: number, cap = SOURCE_TIMEOUT) {
  return AbortSignal.timeout(Math.max(500, Math.min(cap, deadline - Date.now())));
}

/** Square-ish first, then the source's own order. */
function squareFirst(c: Candidate[]): Candidate[] {
  const bad = (x: Candidate) => {
    if (!x.width || !x.height) return 0;
    const r = x.width / x.height;
    return r > 1.8 || r < 0.55 ? 1 : 0;
  };
  return c.map((x, i) => ({ x, i })).sort((a, b) => bad(a.x) - bad(b.x) || a.i - b.i).map((v) => v.x);
}

async function fromGoogle(q: string, deadline: number): Promise<Candidate[]> {
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.search = new URLSearchParams({ key: process.env.GOOGLE_CSE_KEY!, cx: process.env.GOOGLE_CSE_ID!, q, searchType: "image", imgSize: "large", safe: "active", num: "5" }).toString();
  const r = await fetch(u, { signal: signal(deadline) });
  if (!r.ok) return [];
  const d = (await r.json()) as { items?: { link: string; image?: { width?: number; height?: number } }[] };
  return squareFirst((d.items ?? []).map((i) => ({ url: i.link, width: i.image?.width, height: i.image?.height })).filter((c) => (c.width ?? 999) >= 300 && (c.height ?? 999) >= 300));
}

type OffProduct = { product_name?: string; brands?: string | string[]; image_front_url?: string; image_url?: string };

function offMatches(q: string, p: OffProduct): boolean {
  const hay = `${Array.isArray(p.brands) ? p.brands.join(" ") : p.brands ?? ""} ${p.product_name ?? ""}`.toLowerCase();
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return false;
  const hits = words.filter((w) => hay.includes(w.replace(/s$/, ""))).length;
  return hits === words.length || (words.length >= 3 && hits >= words.length - 1 && hay.includes(words[0]));
}

function offCandidates(q: string, products: OffProduct[]): Candidate[] {
  return products
    .filter((p) => (p.image_front_url || p.image_url) && offMatches(q, p))
    .flatMap((p) => {
      const u = (p.image_front_url || p.image_url)!;
      // The .400. file is the display size; .full. is the original upload.
      return [{ url: u.replace(/\.(\d+)\.jpg$/, ".full.jpg"), minSide: 200 }, { url: u, minSide: 200 }];
    });
}

async function fromOpenFoodFacts(q: string, deadline: number): Promise<Candidate[]> {
  const fields = "product_name,brands,image_front_url,image_url";
  try {
    const r = await fetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=10&fields=${fields},code`, { headers: { "User-Agent": BOT_UA }, signal: signal(deadline, 4000) });
    if (r.ok) {
      const c = offCandidates(q, ((await r.json()) as { hits?: OffProduct[] }).hits ?? []);
      if (c.length) return c;
    }
  } catch {
    // fall through to the classic endpoint
  }
  const r = await fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=5&fields=${fields}`,
    { headers: { "User-Agent": BOT_UA }, signal: signal(deadline, 4000) },
  );
  if (!r.ok) return [];
  return offCandidates(q, ((await r.json()) as { products?: OffProduct[] }).products ?? []);
}

// DuckDuckGo throttles bursts with a 403; back off for a while and let Bing answer meanwhile.
let ddgBlockedUntil = 0;
let ddgChain: Promise<unknown> = Promise.resolve();
const DDG_GAP_MS = 900;

async function fromDuckDuckGo(q: string, deadline: number): Promise<Candidate[]> {
  if (Date.now() < ddgBlockedUntil) return [];
  // Serialise DDG calls with a small gap between them.
  const turn = ddgChain.then(() => new Promise((r) => setTimeout(r, DDG_GAP_MS)));
  ddgChain = turn.catch(() => undefined);
  await turn;
  const page = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, signal: signal(deadline, 4000) });
  const html = await page.text();
  const vqd = html.match(/vqd=["']?([\d-]+)["']?/)?.[1];
  if (!vqd) {
    debug(q, "ddg: no vqd", page.status);
    return [];
  }
  const r = await fetch(`https://duckduckgo.com/i.js?l=en-in&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,,,&p=1`, {
    headers: {
      "User-Agent": UA,
      Referer: "https://duckduckgo.com/",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    },
    signal: signal(deadline),
  });
  if (r.status === 403 || r.status === 429) {
    debug(q, "ddg throttled", r.status);
    ddgBlockedUntil = Date.now() + 90_000;
    return [];
  }
  if (!r.ok) return [];
  const d = (await r.json()) as { results?: { image: string; width: number; height: number }[] };
  return squareFirst((d.results ?? []).slice(0, 10).filter((x) => x.width >= 300 && x.height >= 300).map((x) => ({ url: x.image, width: x.width, height: x.height })));
}

async function fromBing(q: string, deadline: number): Promise<Candidate[]> {
  const r = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1&safeSearch=strict`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    signal: signal(deadline),
  });
  if (!r.ok) return [];
  const html = await r.text();
  const out: Candidate[] = [];
  for (const m of html.matchAll(/\bm="(\{[^"]*?\})"/g)) {
    try {
      const j = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")) as { murl?: string };
      if (j.murl && /^https?:\/\//.test(j.murl)) out.push({ url: j.murl });
    } catch {
      // skip malformed tiles
    }
    if (out.length >= 8) break;
  }
  return out;
}

async function fromWikimedia(q: string, deadline: number): Promise<Candidate[]> {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=512&format=json`;
  const r = await fetch(u, { headers: { "User-Agent": BOT_UA }, signal: signal(deadline) });
  if (!r.ok) return [];
  type Page = { index?: number; imageinfo?: { thumburl?: string; width?: number; height?: number; mime?: string }[] };
  const d = (await r.json()) as { query?: { pages?: Record<string, Page> } };
  return squareFirst(
    Object.values(d.query?.pages ?? {})
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .map((p) => p.imageinfo?.[0])
      .filter((i): i is NonNullable<typeof i> => Boolean(i?.thumburl && /jpeg|png|webp/.test(i.mime ?? "") && (i.width ?? 0) >= 300 && (i.height ?? 0) >= 300))
      .map((i) => ({ url: i.thumburl!, width: i.width, height: i.height })),
  );
}

// ---- download, re-encode, store ----

type Encoded = { buf: Buffer; width: number; height: number };

async function fetchImage(c: Candidate, deadline: number): Promise<Encoded | null> {
  if (!/^https?:\/\//i.test(c.url)) return null;
  const r = await fetch(c.url, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" }, redirect: "follow", signal: signal(deadline) });
  if (!r.ok) return null;
  const type = r.headers.get("content-type") ?? "";
  if (!/^image\//i.test(type) || /svg|gif|icon/i.test(type)) return null;
  const len = Number(r.headers.get("content-length") ?? 0);
  if (len > 12_000_000) return null;
  const raw = Buffer.from(await r.arrayBuffer());
  if (raw.length < 3000 || raw.length > 12_000_000) return null;
  return encode(raw, c.minSide ?? 300);
}

/** Size-check and re-encode to a 512 px JPEG; null (not a throw) for an image we don't want. */
async function encode(raw: Buffer, min: number): Promise<Encoded | null> {
  try {
    const meta = await sharp(raw, { failOn: "none" }).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < min || h < min || w / h > 2.4 || h / w > 2.4) return null;
    const { data, info } = await sharp(raw, { failOn: "none" })
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buf: data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export function storagePath(key: string): string {
  const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const ascii = /^[a-z0-9 &+-]+$/.test(key);
  return `${ascii && slug ? slug : `${slug || "food"}-${createHash("sha1").update(key).digest("hex").slice(0, 10)}`}.jpg`;
}

async function store(admin: Admin, key: string, img: Encoded): Promise<string | null> {
  const path = storagePath(key);
  const { error } = await admin.storage.from(BUCKET).upload(path, img.buf, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
  if (error) return null;
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  // The version suffix busts the CDN when a picture is re-resolved into the same path.
  return `${data.publicUrl}?v=${Date.now().toString(36)}`;
}
