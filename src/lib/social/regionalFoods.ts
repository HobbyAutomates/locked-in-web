/**
 * v2.18 E2 regional food names for search: Marathi (mr), Tamil (ta) and Bengali (bn) words, in
 * Roman script as people type them, mapped onto the English / Hinglish names the food table
 * already knows (search_foods matches those). Hindi / Hinglish already works through
 * foods.names_local. Pure. Android: util/RegionalFoods.kt (same table).
 *
 * regionalQuery("macher jhol") → "fish curry"; regionalQuery("2 poli") → "2 chapati";
 * anything without a regional word comes back unchanged.
 */
export type RegionalLang = "mr" | "ta" | "bn";
export type RegionalAlias = { term: string; lang: RegionalLang; canonical: string };

export const REGIONAL_ALIASES: RegionalAlias[] = [
  // Marathi
  { term: "poli", lang: "mr", canonical: "chapati" },
  { term: "chapati poli", lang: "mr", canonical: "chapati" },
  { term: "bhakri", lang: "mr", canonical: "jowar roti" },
  { term: "jwarichi bhakri", lang: "mr", canonical: "jowar roti" },
  { term: "bajrichi bhakri", lang: "mr", canonical: "bajra roti" },
  { term: "varan", lang: "mr", canonical: "dal" },
  { term: "varan bhaat", lang: "mr", canonical: "dal rice" },
  { term: "amti", lang: "mr", canonical: "dal" },
  { term: "pithla", lang: "mr", canonical: "besan curry" },
  { term: "zunka", lang: "mr", canonical: "besan curry" },
  { term: "usal", lang: "mr", canonical: "sprouts curry" },
  { term: "matki usal", lang: "mr", canonical: "sprouts curry" },
  { term: "kanda pohe", lang: "mr", canonical: "poha" },
  { term: "pohe", lang: "mr", canonical: "poha" },
  { term: "koshimbir", lang: "mr", canonical: "salad" },
  { term: "taak", lang: "mr", canonical: "buttermilk" },
  { term: "sol kadhi", lang: "mr", canonical: "kokum kadhi" },
  { term: "palebhaji", lang: "mr", canonical: "palak sabzi" },
  { term: "batata bhaji", lang: "mr", canonical: "aloo sabzi" },
  { term: "batata vada", lang: "mr", canonical: "aloo bonda" },
  { term: "sabudana khichdi", lang: "mr", canonical: "sabudana khichdi" },
  { term: "thalipeeth", lang: "mr", canonical: "thalipeeth" },
  { term: "anda", lang: "mr", canonical: "egg" },
  { term: "kombdi", lang: "mr", canonical: "chicken curry" },
  { term: "dahi bhaat", lang: "mr", canonical: "curd rice" },
  { term: "tup", lang: "mr", canonical: "ghee" },
  { term: "shengdana", lang: "mr", canonical: "peanuts" },
  // Tamil
  { term: "sadam", lang: "ta", canonical: "rice" },
  { term: "sadham", lang: "ta", canonical: "rice" },
  { term: "thayir sadam", lang: "ta", canonical: "curd rice" },
  { term: "thayir", lang: "ta", canonical: "curd" },
  { term: "paruppu", lang: "ta", canonical: "dal" },
  { term: "paruppu sadam", lang: "ta", canonical: "dal rice" },
  { term: "kuzhambu", lang: "ta", canonical: "curry" },
  { term: "kozhambu", lang: "ta", canonical: "curry" },
  { term: "vatha kuzhambu", lang: "ta", canonical: "tamarind curry" },
  { term: "poriyal", lang: "ta", canonical: "vegetable stir fry" },
  { term: "kootu", lang: "ta", canonical: "dal vegetable curry" },
  { term: "keerai", lang: "ta", canonical: "spinach" },
  { term: "dosai", lang: "ta", canonical: "dosa" },
  { term: "thosai", lang: "ta", canonical: "dosa" },
  { term: "vadai", lang: "ta", canonical: "vada" },
  { term: "medu vadai", lang: "ta", canonical: "medu vada" },
  { term: "idiyappam", lang: "ta", canonical: "idiyappam" },
  { term: "kozhi", lang: "ta", canonical: "chicken curry" },
  { term: "kozhi kuzhambu", lang: "ta", canonical: "chicken curry" },
  { term: "meen", lang: "ta", canonical: "fish curry" },
  { term: "meen kuzhambu", lang: "ta", canonical: "fish curry" },
  { term: "muttai", lang: "ta", canonical: "egg" },
  { term: "muttai curry", lang: "ta", canonical: "egg curry" },
  { term: "paal", lang: "ta", canonical: "milk" },
  { term: "mor", lang: "ta", canonical: "buttermilk" },
  { term: "kaapi", lang: "ta", canonical: "filter coffee" },
  { term: "chapathi", lang: "ta", canonical: "chapati" },
  { term: "payasam", lang: "ta", canonical: "kheer" },
  { term: "sundal", lang: "ta", canonical: "chana sundal" },
  { term: "kadalai", lang: "ta", canonical: "chickpeas" },
  { term: "nei", lang: "ta", canonical: "ghee" },
  // Bengali
  { term: "bhaat", lang: "bn", canonical: "rice" },
  { term: "daal bhaat", lang: "bn", canonical: "dal rice" },
  { term: "maach", lang: "bn", canonical: "fish curry" },
  { term: "mach", lang: "bn", canonical: "fish curry" },
  { term: "macher jhol", lang: "bn", canonical: "fish curry" },
  { term: "maacher jhol", lang: "bn", canonical: "fish curry" },
  { term: "dim", lang: "bn", canonical: "egg" },
  { term: "dimer jhol", lang: "bn", canonical: "egg curry" },
  { term: "dim sheddho", lang: "bn", canonical: "boiled egg" },
  { term: "murgi", lang: "bn", canonical: "chicken curry" },
  { term: "murgir jhol", lang: "bn", canonical: "chicken curry" },
  { term: "mangsho", lang: "bn", canonical: "mutton curry" },
  { term: "kosha mangsho", lang: "bn", canonical: "mutton curry" },
  { term: "luchi", lang: "bn", canonical: "puri" },
  { term: "ruti", lang: "bn", canonical: "roti" },
  { term: "alu posto", lang: "bn", canonical: "aloo posto" },
  { term: "aloo posto", lang: "bn", canonical: "aloo posto" },
  { term: "chorchori", lang: "bn", canonical: "mixed vegetable curry" },
  { term: "shukto", lang: "bn", canonical: "mixed vegetable curry" },
  { term: "shaak", lang: "bn", canonical: "spinach" },
  { term: "begun bhaja", lang: "bn", canonical: "brinjal fry" },
  { term: "doi", lang: "bn", canonical: "curd" },
  { term: "mishti doi", lang: "bn", canonical: "mishti doi" },
  { term: "rosogolla", lang: "bn", canonical: "rasgulla" },
  { term: "roshogolla", lang: "bn", canonical: "rasgulla" },
  { term: "muri", lang: "bn", canonical: "puffed rice" },
  { term: "jhalmuri", lang: "bn", canonical: "bhel puri" },
  { term: "chingri", lang: "bn", canonical: "prawn curry" },
  { term: "khichuri", lang: "bn", canonical: "khichdi" },
  { term: "cha", lang: "bn", canonical: "tea" },
  { term: "ghugni", lang: "bn", canonical: "chole" },
];

export const REGIONAL_LANG_LABEL: Record<RegionalLang, string> = { mr: "Marathi", ta: "Tamil", bn: "Bengali" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// Longest terms first so "macher jhol" wins over "mach" and "thayir sadam" over "thayir".
const SORTED = [...REGIONAL_ALIASES].sort((a, b) => b.term.length - a.term.length);

/** The alias the whole query (or its longest regional phrase) matches, or null. */
export function regionalMatch(q: string): RegionalAlias | null {
  const s = ` ${norm(q)} `;
  return SORTED.find((a) => s.includes(` ${a.term} `)) ?? null;
}

const BY_TERM = new Map(REGIONAL_ALIASES.map((a) => [a.term, a.canonical]));
// Terms are plain lower-case words and spaces, so they need no regex escaping.
const PATTERN = new RegExp(`(?<=^| )(${SORTED.map((a) => a.term).join("|")})(?= |$)`, "g");

/** Replaces regional words / phrases (whole words, longest first, one pass) with their canonical names. */
export function regionalQuery(q: string): string {
  const s = norm(q);
  if (!s) return q;
  let changed = false;
  const out = s.replace(PATTERN, (m) => {
    changed = true;
    return BY_TERM.get(m) ?? m;
  });
  return changed ? out : q;
}
