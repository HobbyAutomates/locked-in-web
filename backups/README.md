# Database snapshots

JSON dumps of every `bandlog.*` table, taken with `supabase db query` (service-side). Restore by inserting the `rows` array of each file back into the same table (columns match). Schema lives in `supabase/schema_v*.sql`, applied in order.

- `2026-09-24/` — after v2.6 (Android versionCode 18, web 2.6). Storage buckets (app, avatars, meal-photos, scan-photos, progress-photos, food-images, group-photos) are NOT in this dump; the APKs are re-buildable and food-images are re-fetchable via the prewarm script.
