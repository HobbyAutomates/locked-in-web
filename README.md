# Band Log

Workouts, meals by voice, streaks. Next.js 16 + Supabase + Claude Haiku 4.5.

## One-time setup

This app shares an existing Supabase project and keeps its tables in its own Postgres schema, `bandlog`.

1. **Schema** — in the existing project, open SQL Editor, paste `supabase/schema.sql`, run it. It creates the `bandlog` schema and everything inside it.
2. **Expose it** — Project Settings > API > **Exposed schemas**: add `bandlog` (keep `public`). Save.
3. **Auth** — Authentication > Providers > Email: "Confirm email" off if you want instant sign-in. If you already have an account in this project, just sign in with it; the SQL created your profile row.
4. **Keys** — Project Settings > API. Fill `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ANTHROPIC_API_KEY=sk-ant-...
   ```
5. `npm run dev`, open http://localhost:3000, create your account, set targets in Settings.

## Deploy (Vercel)

`vercel` from this folder, then add the four env vars in the Vercel project settings. On your phone, open the site and use "Add to Home Screen" for the app icon.

## How meals work

Dictate into the box on Today. The text goes to `/api/parse-meal`, which asks Haiku for structured items and prices them from `src/lib/foods.ts` (per-100 g Indian food table). Foods not in the table use Haiku's estimate and are marked "estimated". Rice, dal and sabzi are treated as cooked weights unless you say raw. Edit any grams in the review card, then Save.

## Add a food

Add a line to `src/lib/foods.ts`: id, name, aliases, calories, protein, carbs, fat per 100 g, and an optional household unit with its gram weight.
