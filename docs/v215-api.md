# v2.15 accuracy — server contracts for the clients

Everything here is on the web server (same base URL as `/api/parse-meal`). Auth is the usual:
Android sends `Authorization: Bearer <supabase access token>`, the web sends its cookie. A missing
or bad token is `401 { "error": "Not signed in" }`.

The tables come from `docs/schema_v38.sql`, which is **not applied yet**. Every endpoint answers
`200` with `"available": false` while its table is missing, so a client can hide / skip the feature
without special error handling. Never block the UI on these calls.

All existing endpoints keep their shapes. New item fields are optional and additive.

---

## 1. POST `/api/corrections` — "Correct the numbers" (beta)

One row in `bandlog.food_corrections`. Send it when the person saves "Correct the numbers" on an item.

```json
{
  "meal_id": "uuid | null",            // the saved meal, when there is one
  "item_name": "Roti",                  // required, ≤ 160 chars
  "food_id": "roti | null",
  "input_kind": "text | photo | barcode | label | manual",   // anything else → "manual"
  "grams": 80,
  "unit": "roti | null",                // the count noun, or null for a gram-weighed item
  "count": 2,                           // null for a gram-weighed item
  "app":  { "kcal": 240, "protein": 6, "carbs": 40, "fat": 4 },   // what we estimated (before)
  "user": { "kcal": 190, "protein": null, "carbs": null, "fat": null }, // user.kcal required
  "source": "Pintola pack | https://… | null",  // ≤ 300 chars
  "note": "free text | null",           // ≤ 1000 chars
  "scan_id": "uuid | null",             // the label_scans id of a photo / label / barcode scan
  "raw_input": "the typed text, or the photo's plate_note | null",  // ≤ 2000 chars
  "remember": true                      // optional: also save user.kcal / count as this person's
                                        // kcal per `unit` for this food (see §3). Needs count + unit.
}
```

Responses:
- `200 { "ok": true, "available": true, "id": "uuid" }`
- `200 { "ok": false, "available": false }` — schema not applied; drop silently.
- `400 { "ok": false, "error": "item_name is required" | "user.kcal is required" }`

The client applies the new numbers itself (maths below) — this endpoint only records them.

## 2. POST `/api/log-event` — the beta entry log

One event, or `{ "events": [ … ] }` (≤ 50 per call; batch them, e.g. every few seconds).

```json
{
  "events": [
    {
      "kind": "log | edit | delete | skip | scan_accept | scan_dismiss | note",
      "meal_id": "uuid | null",
      "item_name": "Roti | null",
      "payload": { "before": {…}, "after": {…}, "raw_text": "…", "source": "web|table|estimate|user", "input_kind": "photo" },
      "app_version": "2.15",            // optional; Android should send its versionName
      "platform": "android"             // optional; bearer calls default to "android"
    }
  ]
}
```

When to send what:

| kind | when | suggested payload |
|---|---|---|
| `log` | a meal is saved | `{ method, items: [{name, grams, kcal, source}], total_kcal, raw_text }` |
| `edit` | an item's amount / numbers change in the editor | `{ before: {grams, count, kcal, p, c, f}, after: {…}, field: "count|grams|per_unit|per_100g|correct" }` |
| `delete` | an item is removed from a saved meal, or a meal is deleted | `{ before: {…} }` |
| `skip` | an AI-suggested item (parse / scan) is removed **before** saving — it was usually wrong | `{ before: {…}, input_kind, source }` |
| `scan_accept` / `scan_dismiss` | a scan result is used / thrown away | `{ scan_id, kind, items: n, total_kcal }` |
| `note` | a note is typed (meal text, scan note, correction note) | `{ where: "meal_text|scan_note|correction", text }` |

Payload: an object, ≤ 30 keys, strings cut to 500 chars, ~12 KB max (bigger → `{truncated:true}`).
Unknown `kind`s are dropped. Only send while the app's analytics switch (`BETA_ANALYTICS`) is on;
the server also no-ops when its own switch is off.

Responses: `200 { "ok": true, "available": true, "saved": 2 }` · `200 { "ok": true, "saved": 0, "skipped": "analytics_off" }` · `200 { "ok": false, "available": false, "saved": 0 }` (no table yet — stop sending until next launch).

## 3. `/api/food-overrides` — per-user "calories per roti"

Stored per person per food per unit. `food_key` is the **server-normalised name** (lowercase,
quantities stripped: `"2 Roti"` → `"roti"`, `"1 katori dal tadka"` → `"dal tadka"`), so send display
names and let the server normalise. `unit` is the count noun (`roti`, `egg`, `idli`, `slice`,
`scoop`, `katori` …) or `100g` for a gram-weighed food (then the numbers are per 100 g).

### GET `/api/food-overrides?names=Roti,2 eggs,dal tadka`
(`names` comma-separated, or repeat `name=`; no names = all of the person's, newest first, ≤ 500)

```json
{ "available": true, "overrides": [
  { "food_key": "roti", "unit": "roti", "kcal_per_unit": 95, "protein_per_unit": null, "carbs_per_unit": null, "fat_per_unit": null, "updated_at": "…" }
] }
```

To match an item to an override on the client, compare against `overrides[].food_key` after
normalising the item name the same way — or simply call GET with that item's name and take the row
whose `unit` equals the item's unit noun.

### PUT `/api/food-overrides`
```json
{ "name": "Roti", "unit": "roti", "kcal_per_unit": 95, "protein_per_unit": null, "carbs_per_unit": null, "fat_per_unit": null }
```
(`food_key` may be sent instead of `name`.) → `200 { "ok": true, "available": true, "override": {…} }`,
`200 { "ok": false, "available": false }`, or `400 { "ok": false, "error": "…" }`.

### DELETE `/api/food-overrides`
`{ "name": "Roti", "unit": "roti" }` → `200 { "ok": true, "available": true }`.

Send PUT when the person changes "Calories per roti" (per unit) or "Calories per 100 g" (unit
`100g`) and saves the item. On the next log of that food, apply the override **before** showing the
item: count items → `rescalePerUnit(item, count, kcal_per_unit, perUnitMacros)`; gram items →
`rescalePer100(item, kcal_per_unit)`. Mark the row so the editor can say "Using your 95 kcal per roti".

---

## Maths (src/lib/perUnit.ts — mirror exactly on Android)

- `scaleToKcal(item, kcal, edits)`: `calories = round(kcal)`; each macro = typed value if given,
  else `round1(macro × kcal / old_kcal)` (0 when old kcal is 0).
- Per unit: `rescalePerUnit(item, count, unitKcal, unitMacros)` = `scaleToKcal(item, unitKcal × count,
  {macro: unitMacro × count when typed})`, plus `per_unit_kcal = round(unitKcal)`.
- Per 100 g: `rescalePer100(item, per100)` = `scaleToKcal(item, per100 × grams / 100, …)`.
- Correction: `applyCorrection(item, {calories, protein_g?, carbs_g?, fat_g?})` = `scaleToKcal` with
  the typed macros, then `user_verified = true`.
- `% error = (app − user) / user × 100`, one decimal (+ = we over-estimated).

Worked example (check-match.ts): 2 roti = 240 kcal, P 6 C 40 F 4 → 95 per roti → 190 kcal,
P 4.8 C 31.7 F 3.2.

## New optional item fields

On `ParsedItem` / `PlateItem` / `MealItem` (all optional, older clients ignore them):

| field | type | meaning |
|---|---|---|
| `source_info.kind` | adds `"web"` and `"user"` | web lookup / the person's own numbers. Render any unknown kind generically (label + detail + links). |
| `source_urls` | `string[]` ≤ 3 | the web pages the numbers came from (also in `source_info.links`) |
| `user_verified` | `boolean` | set by the client after "Correct the numbers"; show "✓ Your numbers" |
| `per_unit_kcal` | `number` | set by the client when the person edited "Calories per roti" |

`meal_items` gets matching nullable columns in schema_v38 (`user_verified boolean`,
`per_unit_kcal numeric`, `source_urls jsonb` array ≤ 3). Until it's applied, a PostgREST insert that
includes them fails with `PGRST204` / `42703` — **retry the insert without those three keys** (the
web does exactly this in `src/lib/actions.ts`).

## Lookups got slower (on purpose)

- Photos (`/api/scan`, `/api/photo-meal`): after the vision call, every item is looked up on the web
  in parallel (Sonnet + web_search). Allow up to ~60 s total on the request timeout; show
  "Checking sources…". Items carry `source_info.kind = "web"` with links, or `"estimate"` /
  "AI estimate" when the lookup failed or its numbers didn't fit the photo (then `confidence: "low"`).
  Photos never read the food database any more.
- Typed text (`/api/parse-meal`): items the database doesn't know are looked up on the web
  (≤ ~25 s). Show "Searching the web for <item>…" while it runs; set the client timeout to ≥ 60 s.
