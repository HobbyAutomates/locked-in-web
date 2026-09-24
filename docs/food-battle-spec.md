# Squad Food Battle — spec (v2.7)

A daily game inside a squad. Members snap what they eat through the day; the AI estimates calories and posts it to the squad with a one-liner; at the end of the day the member closest to **their own goal** wins and gets a graffiti crown.

## Rules

- **Opt-in per squad.** The owner turns it on with `groups.battle_enabled`. Members who have `profiles.share_stats = false` stay on the board but show "private" instead of numbers, and they can't win.
- **The day is each member's local day**, the same `date` that `daily_stats` already uses. A day's battle *closes at midnight*: once today's date has moved past it for everyone in the squad, the result is final.
- **No cron.** Results are computed on read by a SQL function. The first read after a day closes also inserts the win (idempotent through a unique key) and the crown post.

## Eligibility

A member counts for a day only if they logged **at least 2 meals** that day (`daily_stats.meals >= 2`). This stops "logged nothing = 0 kcal = perfect cut".

## Score (0–100) from r = eaten / target

`target` = `profiles.calorie_target`, plus that day's `burned` when `add_burned_to_goal` is on.

| goal_type | 100 points when | penalty outside the band |
|---|---|---|
| gain (bulking) | 1.00 ≤ r ≤ 1.10 | under: −200 × (1 − r); over: −150 × (r − 1.10) |
| maintain | 0.95 ≤ r ≤ 1.05 | −200 × (\|r − 1\| − 0.05) |
| lose (cutting) | 0.90 ≤ r ≤ 1.00 | over: −250 × (r − 1); under: −200 × (0.90 − r) |

- Clamp the score to 0–100.
- **Safety:** for lose, r < 0.75 caps the score at 40, and the board shows "under-fuelled", never praise. No copy anywhere rewards eating less for its own sake.
- **Ties:** more meals logged wins; if still tied, the earlier last-log time wins.

## Data (supabase/schema_v28.sql)

- `alter table bandlog.groups add column if not exists battle_enabled boolean default false;`
- `create table bandlog.battle_wins (group_id, date, user_id, score numeric, eaten, target, goal_type, created_at, primary key (group_id, date))`, with RLS so members can read it.
- Add `'battle'` to the `group_posts.kind` check. It covers the crown post and meal snaps that carry a range.
- `bandlog.battle_board(g uuid, d date)` returns rows of user_id, name, avatar, goal_type, eaten, target, r, score, meals, eligible and private. It is `security definer` and checks `is_member(g)`.
- `bandlog.battle_close(g uuid, d date)`: when d is before the caller's today and no win exists yet, insert the top eligible scorer into battle_wins and post a `'battle'` crown. Return the winner.
- `bandlog.my_graffiti(u uuid)` returns the win count and recent wins, for the profile.

## Snap-to-squad flow

1. In a squad, a **camera "Snap"** button runs the existing plate estimate (`/api/photo-meal` / `plateFlow`).
2. The user sees the items and a **kcal range** (for example "~520 kcal (440–610)"), then confirms. That saves the meal the normal way, so `daily_stats` updates.
3. It auto-posts to *that* squad as kind `'meal'`, with the photo, the range and a **one-liner**.
4. One-liners come from a local template bank, keyed on goal and progress, e.g. "Bulk arc loading 📈", "Protein check: passed ✅", "Clean plate, clean stats". There's no LLM call. They are hype only: never body- or food-shaming, and no "you ate too much".

## Board (squad page, new "Battle" tab or top card)

- Live table: avatar, name, goal chip (Bulk / Maintain / Cut), eaten / target bar with the goal band shaded, score, and meals count.
- Framing is progress, not ranking-shame. Show everyone's own bar against their own band. The leader gets 👑; others see "X pts to lead".
- Yesterday's winner gets a **graffiti crown card**: spray-paint styled name, score and goal. It's pinned at the top until the next winner.
- Profile shows a "Graffiti wall": total crowns plus the last 7.

## Build scope

- Web: SquadRoom tab and components, the Snap button, the board, the crown card, the profile wall, and server actions.
- Android: the same in `ui/squad/`, reusing the scan and plate code.
- SQL in schema_v28.sql. Apply it to the database only after review.
