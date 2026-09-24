-- v2.7: Squad Challenges (train days / protein days / log days), scored from bandlog.daily_stats.
-- Builds on schema_v26.sql (group_posts, group_feed, member_name, is_member). Idempotent: safe to re-run.
-- "Today" is the app's day (Asia/Kolkata), the same as day_streak / week_points and the clients' today().

-- ---------------------------------------------------------------------------------------------
-- 1. Challenges table
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.group_challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('train_days','protein_days','log_days')),
  title text not null check (length(title) between 1 and 60),
  target_days int not null check (target_days >= 1),
  protein_target int check (protein_target between 40 and 300),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on + 2 and ends_on <= starts_on + 59),
  check (target_days <= ends_on - starts_on + 1),
  check ((kind = 'protein_days') = (protein_target is not null))
);
create index if not exists group_challenges_group_idx on bandlog.group_challenges (group_id, ends_on desc);

-- Members read; writes only through create_challenge; the creator or the squad owner can delete.
alter table bandlog.group_challenges enable row level security;
drop policy if exists "challenges members read" on bandlog.group_challenges;
create policy "challenges members read" on bandlog.group_challenges for select using (bandlog.is_member(group_id));
drop policy if exists "challenges creator or owner delete" on bandlog.group_challenges;
create policy "challenges creator or owner delete" on bandlog.group_challenges for delete using (
  created_by = auth.uid() or exists (select 1 from bandlog.groups g where g.id = group_id and g.owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------------------------
-- 2. Feed posts can be kind 'challenge' ("🏁 started ..." / "🏆 completed ...")
-- ---------------------------------------------------------------------------------------------
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'bandlog.group_posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table bandlog.group_posts drop constraint %I', c.conname);
  end loop;
end $$;
alter table bandlog.group_posts add constraint group_posts_kind_check check (kind in ('message', 'meal', 'workout', 'pr', 'photo', 'challenge'));

-- ---------------------------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------------------------
-- Start a challenge in squad g. At most 3 upcoming/active per squad. Posts "🏁 started "<title>"" to the
-- feed. That post has ref_id = null: ref_id = challenge id is reserved for each member's own
-- "🏆 completed" post (unique on group_id, user_id, kind, ref_id), so the creator can still complete it.
drop function if exists bandlog.create_challenge(uuid, text, text, int, int, date, date);
create function bandlog.create_challenge(g uuid, kind text, title text, target_days int, protein_target int, starts_on date, ends_on date) returns uuid
language plpgsql security definer set search_path = bandlog as $$
declare
  t date := (now() at time zone 'Asia/Kolkata')::date;
  k text := create_challenge.kind;
  s date := create_challenge.starts_on;
  e date := create_challenge.ends_on;
  td int := create_challenge.target_days;
  pt int := case when create_challenge.kind = 'protein_days' then create_challenge.protein_target end;
  nm text := left(trim(coalesce(create_challenge.title, '')), 60);
  len int;
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  if k is null or k not in ('train_days', 'protein_days', 'log_days') then raise exception 'Unknown challenge kind'; end if;
  if s is null or e is null then raise exception 'Pick the dates'; end if;
  if s < t then raise exception 'Start today or later'; end if;
  len := e - s + 1;
  if len < 3 or len > 60 then raise exception 'Challenges run 3 to 60 days'; end if;
  if td is null or td < 1 or td > len then raise exception 'Target has to be between 1 and % days', len; end if;
  if k = 'protein_days' and (pt is null or pt < 40 or pt > 300) then raise exception 'Protein target is 40 to 300 g'; end if;
  if nm = '' then
    nm := case k
      when 'train_days' then 'Train ' || td || ' of ' || len || ' days'
      when 'protein_days' then 'Hit ' || pt || ' g protein ' || td || ' of ' || len || ' days'
      else case when td = len then 'Log food every day for ' || len || ' days' else 'Log food ' || td || ' of ' || len || ' days' end
    end;
    nm := left(nm, 60);
  end if;

  -- One creator at a time per squad, so two taps can't both squeeze past the limit.
  perform 1 from bandlog.groups gr where gr.id = g for update;
  if (select count(*) from bandlog.group_challenges x where x.group_id = g and x.ends_on >= t) >= 3 then
    raise exception 'This squad already has 3 challenges going. Start one when one wraps up';
  end if;

  insert into bandlog.group_challenges (group_id, created_by, kind, title, target_days, protein_target, starts_on, ends_on)
  values (g, auth.uid(), k, nm, td, pt, s, e)
  returning group_challenges.id into cid;

  insert into bandlog.group_posts (group_id, user_id, kind, body)
  values (g, auth.uid(), 'challenge', left('🏁 started "' || nm || '"', 1000));
  return cid;
end $$;
revoke all on function bandlog.create_challenge(uuid, text, text, int, int, date, date) from public, anon;
grant execute on function bandlog.create_challenge(uuid, text, text, int, int, date, date) to authenticated;

-- The ranked board of challenge c: every current squad member, progress = qualifying daily_stats rows
-- between starts_on and least(ends_on, today); completed_on = the day the running count hit target_days.
-- Ranked by progress desc, then completed_on asc (earlier finishers first), then join order.
drop function if exists bandlog.challenge_board(uuid);
create function bandlog.challenge_board(c uuid)
returns table (user_id uuid, name text, username text, avatar_path text, progress int, completed boolean, completed_on date, rank int)
language plpgsql stable security definer set search_path = bandlog as $$
declare
  ch bandlog.group_challenges%rowtype;
  t date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into ch from bandlog.group_challenges x where x.id = c;
  if ch.id is null or not bandlog.is_member(ch.group_id) then raise exception 'Challenge not found'; end if;
  return query
  with q as (
    select s.user_id as uid, s.date as d, row_number() over (partition by s.user_id order by s.date) as n
    from bandlog.daily_stats s
    join bandlog.group_members m on m.user_id = s.user_id and m.group_id = ch.group_id
    where s.date between ch.starts_on and least(ch.ends_on, t)
      and case ch.kind
            when 'train_days' then s.trained
            when 'protein_days' then s.protein_g >= ch.protein_target
            else s.meals > 0
          end
  ),
  agg as (
    select q.uid, count(*)::int as prog, min(q.d) filter (where q.n = ch.target_days) as done_on
    from q group by q.uid
  ),
  r as (
    select m.user_id as uid, bandlog.member_name(m.user_id, m.display_name) as nm, p.username as un, p.avatar_path as av,
           coalesce(a.prog, 0) as prog, a.done_on, m.joined_at as ja
    from bandlog.group_members m
    left join agg a on a.uid = m.user_id
    left join bandlog.profiles p on p.id = m.user_id
    where m.group_id = ch.group_id
  )
  select r.uid, r.nm, r.un, r.av, r.prog, r.prog >= ch.target_days, r.done_on,
         (row_number() over (order by r.prog desc, r.done_on asc nulls last, r.ja))::int
  from r
  order by r.prog desc, r.done_on asc nulls last, r.ja;
end $$;
revoke all on function bandlog.challenge_board(uuid) from public, anon;
grant execute on function bandlog.challenge_board(uuid) to authenticated;

-- Squad g's challenges, newest first: upcoming + active + ended in the last 30 days. Status is derived
-- (never stored). leader_* is the board's #1 (check leader_progress > 0 before showing them as leading);
-- leader_user_id is appended last so clients parsing the original columns keep working.
drop function if exists bandlog.group_challenge_list(uuid);
create function bandlog.group_challenge_list(g uuid)
returns table (id uuid, kind text, title text, target_days int, protein_target int, starts_on date, ends_on date, created_by uuid, creator_name text, status text, my_progress int, leader_name text, leader_progress int, participants int, completed_count int, leader_user_id uuid)
language plpgsql stable security definer set search_path = bandlog as $$
declare
  t date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  select x.id, x.kind, x.title, x.target_days, x.protein_target, x.starts_on, x.ends_on, x.created_by,
         bandlog.member_name(x.created_by, (select m.display_name from bandlog.group_members m where m.group_id = x.group_id and m.user_id = x.created_by)),
         (case when t < x.starts_on then 'upcoming' when t > x.ends_on then 'ended' else 'active' end)::text,
         coalesce(b.mine, 0), b.lead_name, coalesce(b.lead_prog, 0), coalesce(b.cnt, 0), coalesce(b.done, 0), b.lead_uid
  from bandlog.group_challenges x
  left join lateral (
    select max(cb.progress) filter (where cb.user_id = auth.uid()) as mine,
           max(cb.name) filter (where cb.rank = 1) as lead_name,
           max(cb.progress) filter (where cb.rank = 1) as lead_prog,
           (array_agg(cb.user_id) filter (where cb.rank = 1))[1] as lead_uid,
           count(*)::int as cnt,
           (count(*) filter (where cb.completed))::int as done
    from bandlog.challenge_board(x.id) cb
  ) b on true
  where x.group_id = g and x.ends_on >= t - 30
  order by x.created_at desc;
end $$;
revoke all on function bandlog.group_challenge_list(uuid) from public, anon;
grant execute on function bandlog.group_challenge_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Grants + reload
-- ---------------------------------------------------------------------------------------------
grant all on bandlog.group_challenges to authenticated, service_role;
grant all on all tables in schema bandlog to anon, authenticated, service_role;
notify pgrst, 'reload schema';

select json_build_object(
  'table', to_regclass('bandlog.group_challenges') is not null,
  'policies', (select json_agg(policyname order by policyname) from pg_policies where schemaname = 'bandlog' and tablename = 'group_challenges'),
  'posts_kind_check', (select json_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid = 'bandlog.group_posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'),
  'functions', (select json_agg(proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'bandlog' and proname in ('create_challenge', 'challenge_board', 'group_challenge_list'))
) as result;
