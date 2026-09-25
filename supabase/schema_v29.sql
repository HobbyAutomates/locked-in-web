-- v2.9: Squad Food Battle (docs/food-battle-spec.md). Idempotent: safe to re-run.
--
-- NOT applied to any database by the agent that wrote this file — review and run manually.
--
-- Builds on schema_v20.sql/v20b.sql (groups, group_members, daily_stats, is_member, member_name)
-- and schema_v26.sql (group_posts, group_feed, post_to_my_groups, group_leaderboard).
--
-- Score (0-100) from r = eaten / target, where target = profiles.calorie_target plus that day's
-- daily_stats.burned when profiles.add_burned_to_goal is on. See the spec for the goal bands; the
-- SQL here and src/lib/battle.ts (TypeScript mirror for the UI) must stay in lockstep.
--
-- Coordination: schema_v27.sql (another branch) owns squad challenges and adds 'challenge' to the
-- same group_posts.kind check this file touches; schema_v28.sql (another branch) is a foods
-- migration. This file is numbered v29 so it applies cleanly after both, and its kind check
-- includes every kind known at the time of writing: message, meal, workout, pr, photo, challenge,
-- battle. If a later migration adds another kind, that file's constraint should include 'battle' too.

-- ---------------------------------------------------------------------------------------------
-- 1. groups.battle_enabled
-- ---------------------------------------------------------------------------------------------
alter table bandlog.groups add column if not exists battle_enabled boolean default false;

-- ---------------------------------------------------------------------------------------------
-- 2. battle_wins: one row per squad per day, the crown holder.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.battle_wins (
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric(5,1) not null,
  eaten numeric(7,1) not null,
  target numeric(7,1) not null,
  goal_type text not null check (goal_type in ('lose', 'maintain', 'gain')),
  created_at timestamptz not null default now(),
  primary key (group_id, date)
);
create index if not exists battle_wins_user_idx on bandlog.battle_wins (user_id, date desc);
alter table bandlog.battle_wins enable row level security;
drop policy if exists "battle wins members read" on bandlog.battle_wins;
create policy "battle wins members read" on bandlog.battle_wins for select using (bandlog.is_member(group_id));
-- Writes only happen through battle_close() (security definer); no direct insert/update policy for clients.

-- ---------------------------------------------------------------------------------------------
-- 3. group_posts.kind: add 'battle' (crown posts + meal snaps that carry a kcal range), alongside
--    'challenge' (owned by another branch's schema_v27.sql) so both land regardless of apply order.
-- ---------------------------------------------------------------------------------------------
alter table bandlog.group_posts drop constraint if exists group_posts_kind_check;
alter table bandlog.group_posts add constraint group_posts_kind_check check (kind in ('message', 'meal', 'workout', 'pr', 'photo', 'challenge', 'battle'));

-- ---------------------------------------------------------------------------------------------
-- 4. bandlog.battle_score(goal_type, r) — the shared scoring formula, 0-100.
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.battle_score(p_goal text, r numeric) returns numeric
language sql immutable as $$
  select least(100, greatest(0,
    case p_goal
      when 'gain' then
        case
          when r < 1.00 then 100 - 200 * (1 - r)
          when r > 1.10 then 100 - 150 * (r - 1.10)
          else 100
        end
      when 'lose' then
        case
          when r > 1.00 then 100 - 250 * (r - 1)
          when r < 0.90 then
            case when r < 0.75 then least(40, 100 - 200 * (0.90 - r)) else 100 - 200 * (0.90 - r) end
          else 100
        end
      else -- maintain
        case
          when abs(r - 1) > 0.05 then 100 - 200 * (abs(r - 1) - 0.05)
          else 100
        end
    end
  ));
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. bandlog.battle_board(g, d) — live board for one squad/day. security definer, is_member gated.
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.battle_board(g uuid, d date)
returns table (
  user_id uuid, name text, avatar_path text, goal_type text,
  eaten numeric, target numeric, r numeric, score numeric,
  meals int, eligible boolean, private boolean
)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  with base as (
    select
      m.user_id as uid,
      bandlog.member_name(m.user_id, m.display_name) as nm,
      p.avatar_path as av,
      coalesce(p.goal_type, 'maintain') as gt,
      coalesce(s.calories, 0)::numeric as eaten,
      (coalesce(p.calorie_target, 2200) + case when coalesce(p.add_burned_to_goal, false) then coalesce(s.burned, 0) else 0 end)::numeric as tgt,
      coalesce(s.meals, 0) as mls,
      not coalesce(p.share_stats, true) as priv,
      s.updated_at as upd,
      m.joined_at as ja
    from bandlog.group_members m
    left join bandlog.profiles p on p.id = m.user_id
    left join bandlog.daily_stats s on s.user_id = m.user_id and s.date = d
    where m.group_id = g
  ),
  scored as (
    -- Every column is qualified: the OUT params (eaten, r, score, ...) are plpgsql variables, and an
    -- unqualified name that is also a column raises "column reference is ambiguous" at call time.
    select
      b.uid, b.nm, b.av, b.gt, b.eaten as ate, b.tgt,
      case when b.tgt > 0 then b.eaten / b.tgt else 0 end as ratio,
      b.mls, (b.mls >= 2) as elig, b.priv, b.upd, b.ja
    from base b
  )
  select
    sc.uid, sc.nm, sc.av, sc.gt, sc.ate, sc.tgt, sc.ratio,
    case when sc.elig then bandlog.battle_score(sc.gt, sc.ratio) else 0 end,
    sc.mls, sc.elig, sc.priv
  from scored sc
  order by
    -- eligible non-private members who can actually win the crown rank first, by score;
    -- ties: more meals wins, then the earlier last-log time.
    (sc.elig and not sc.priv) desc,
    case when sc.elig and not sc.priv then bandlog.battle_score(sc.gt, sc.ratio) end desc,
    sc.mls desc,
    sc.upd asc nulls last,
    sc.ja asc;
end $$;
grant execute on function bandlog.battle_board(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. bandlog.battle_close(g, d) — close a past day: insert the winner (idempotent) + crown post.
--    "Past" = before the caller's own today (Asia/Kolkata, matching squad_board's day rule).
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.battle_close(g uuid, d date)
returns table (user_id uuid, name text, score numeric, goal_type text)
language plpgsql security definer set search_path = bandlog as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  w record;
  inserted boolean := false;
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  if not coalesce((select gr.battle_enabled from bandlog.groups gr where gr.id = g), false) then return; end if;
  if d >= today then return; end if;

  if exists (select 1 from bandlog.battle_wins bw where bw.group_id = g and bw.date = d) then
    return query
    select bw.user_id, bandlog.member_name(bw.user_id, ''), bw.score, bw.goal_type
    from bandlog.battle_wins bw where bw.group_id = g and bw.date = d;
    return;
  end if;

  select b.user_id, b.name, b.score, b.goal_type, b.eaten, b.target
  into w
  from bandlog.battle_board(g, d) b
  where b.eligible and not b.private
  order by b.score desc
  limit 1;

  if w.user_id is null then return; end if;

  -- The battle_wins primary key (group_id, date) is the idempotency guard against a concurrent
  -- caller racing this same function: only the insert that actually lands posts the crown.
  insert into bandlog.battle_wins (group_id, date, user_id, score, eaten, target, goal_type)
  values (g, d, w.user_id, w.score, w.eaten, w.target, w.goal_type)
  on conflict (group_id, date) do nothing
  returning true into inserted;

  if inserted then
    insert into bandlog.group_posts (group_id, user_id, kind, body)
    values (
      g, w.user_id, 'battle',
      w.name || ' won the food battle for ' || to_char(d, 'Mon DD') || ' 👑 (' || round(w.score) || ' pts, ' ||
        (case w.goal_type when 'gain' then 'Bulk' when 'lose' then 'Cut' else 'Maintain' end) || ')'
    );
    return query select w.user_id, w.name, w.score, w.goal_type;
  else
    return query
    select bw.user_id, bandlog.member_name(bw.user_id, ''), bw.score, bw.goal_type
    from bandlog.battle_wins bw where bw.group_id = g and bw.date = d;
  end if;
end $$;
grant execute on function bandlog.battle_close(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. bandlog.my_graffiti(u) — crown count + recent wins, for the profile's graffiti wall.
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.my_graffiti(u uuid)
returns table (total int, group_id uuid, group_name text, date date, score numeric, goal_type text)
language sql stable security definer set search_path = bandlog as $$
  select
    (select count(*)::int from bandlog.battle_wins where user_id = u),
    bw.group_id, gr.name, bw.date, bw.score, bw.goal_type
  from bandlog.battle_wins bw
  join bandlog.groups gr on gr.id = bw.group_id
  where bw.user_id = u
  order by bw.date desc
  limit 7;
$$;
grant execute on function bandlog.my_graffiti(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Grants + reload
-- ---------------------------------------------------------------------------------------------
grant all on bandlog.battle_wins to authenticated, service_role;
grant all on all tables in schema bandlog to anon, authenticated, service_role;
notify pgrst, 'reload schema';

select json_build_object(
  'group_cols', (select json_agg(column_name) from information_schema.columns where table_schema = 'bandlog' and table_name = 'groups' and column_name = 'battle_enabled'),
  'tables', json_build_array(to_regclass('bandlog.battle_wins') is not null),
  'kind_check', (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'bandlog.group_posts'::regclass and conname = 'group_posts_kind_check'),
  'functions', (select json_agg(proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'bandlog' and proname in ('battle_score', 'battle_board', 'battle_close', 'my_graffiti'))
) as result;
