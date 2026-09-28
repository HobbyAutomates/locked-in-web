-- v2.18 "social" (schema_v44): Area D of docs v218-spec. Streak freezes, referrals, verified
-- squads, coach (trainer / dietitian) access, meal-photo stamps + more reactions, live squad
-- sessions, accountability pledges, seasonal event badges, premium packs, squad leagues (flag OFF).
-- Additive and idempotent (safe to re-run). Undo with docs/revert_v44.sql.
--
-- NOT applied to any database by the agent that wrote this file. Review it and run it by hand.
-- THIS web copy is the source of truth; the Android repo only points here
-- (docs/v218-social-shared.md has the client contract).
--
-- Needs: schema_v20 (groups, is_member), v20b (member_name), v26 (group_posts, day_streak,
-- usernames), v35 (post_reactions, post_in_my_squads), v36 (plan / pro_until, guard_plan,
-- notifications, app_config), v40 (profiles.cover_preset).
--
-- Every client tolerates this file not being applied: each feature reads its own table / RPC and
-- hides (or says "coming with the next update") on a missing-table / missing-function error.
--
-- Notifications written here all use kind 'system' so the notifications kind check (v37) is not
-- touched (the other v2.18 streams may widen it).
--
-- Guard flag: some RPCs below must change columns that clients may not (plan, pro_until,
-- referral columns, groups.verified). They set the transaction-local setting
-- `bandlog.trusted = 'on'` first; the guard triggers let that through. PostgREST can't call
-- set_config (it only exposes the bandlog schema), so a client can't set it.

-- ---------------------------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.soc_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- Anything logged on day d (a meal, a workout or an exercise_log row): the apps' streak rule.
create or replace function bandlog.soc_active_on(u uuid, d date) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select exists (select 1 from bandlog.meals m where m.user_id = u and m.date = d)
      or exists (select 1 from bandlog.workouts w where w.user_id = u and w.date = d)
      or exists (select 1 from bandlog.exercise_log e where e.user_id = u and e.date = d);
$$;
revoke all on function bandlog.soc_active_on(uuid, date) from public, anon, authenticated;
grant execute on function bandlog.soc_active_on(uuid, date) to service_role;

create or replace function bandlog.soc_trusted() returns boolean
language sql stable as $$ select coalesce(current_setting('bandlog.trusted', true), '') = 'on' $$;

-- Do the caller and u share a squad?
create or replace function bandlog.soc_shares_squad(u uuid) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select exists (select 1 from bandlog.group_members a join bandlog.group_members b on a.group_id = b.group_id
                  where a.user_id = auth.uid() and b.user_id = u);
$$;
revoke all on function bandlog.soc_shares_squad(uuid) from public, anon;
grant execute on function bandlog.soc_shares_squad(uuid) to authenticated;

-- guard_plan (v36) also lets the trusted RPCs through (referral weeks of Pro).
create or replace function bandlog.guard_plan() returns trigger
language plpgsql security definer set search_path = bandlog as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not bandlog.soc_trusted() then
    new.plan := old.plan;
    new.pro_until := old.pro_until;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. D5 Streak freeze tokens. Earn one per perfect week (Mon-Sun IST, something logged all 7
--    days), max 3. One is used automatically for each missed day of a gap that ends yesterday
--    (only when the tokens cover the whole gap, so none are wasted on a streak that's gone).
--    Gift one to a squadmate (once per pair per 7 days; they must have room).
--    A used day counts as active for day_streak (below) and in both apps' streak maths.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.streak_freezes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tokens int not null default 0 check (tokens between 0 and 3),
  updated_at timestamptz not null default now()
);
-- kind 'earn' ref = week start (yyyy-mm-dd); 'use' ref = the frozen day (yyyy-mm-dd);
-- 'gift_out' / 'gift_in' ref = '<other user id>:<epoch ms>'.
create table if not exists bandlog.freeze_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('earn', 'use', 'gift_out', 'gift_in')),
  ref text not null,
  other_user uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists freeze_events_user_idx on bandlog.freeze_events (user_id, created_at desc);
alter table bandlog.streak_freezes enable row level security;
alter table bandlog.freeze_events enable row level security;
drop policy if exists "freezes own read" on bandlog.streak_freezes;
create policy "freezes own read" on bandlog.streak_freezes for select using (user_id = auth.uid());
drop policy if exists "freeze events own read" on bandlog.freeze_events;
create policy "freeze events own read" on bandlog.freeze_events for select using (user_id = auth.uid());
grant select on bandlog.streak_freezes, bandlog.freeze_events to authenticated;
grant all on bandlog.streak_freezes, bandlog.freeze_events to service_role;
grant usage, select on sequence bandlog.freeze_events_id_seq to service_role;

create or replace function bandlog.soc_is_frozen(u uuid, d date) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select exists (select 1 from bandlog.freeze_events f where f.user_id = u and f.kind = 'use' and f.ref = d::text);
$$;
revoke all on function bandlog.soc_is_frozen(uuid, date) from public, anon, authenticated;
grant execute on function bandlog.soc_is_frozen(uuid, date) to service_role;

-- Call on app open (both apps do, at most once per day per device). Earns for the last two
-- completed weeks, then auto-uses for yesterday's gap. Returns the fresh state.
create or replace function bandlog.freeze_sync()
returns table (tokens int, earned_now int, used_now int, used_days date[])
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  t date := bandlog.soc_today();
  ws date;
  k int;
  i int;
  perfect boolean;
  have int;
  e int := 0;
  u int := 0;
  d date;
  gap date[] := '{}';
  first_day date;
begin
  if me is null then raise exception 'Not signed in'; end if;
  insert into bandlog.streak_freezes (user_id) values (me) on conflict (user_id) do nothing;
  select f.tokens into have from bandlog.streak_freezes f where f.user_id = me for update;

  -- earn
  for k in 1..2 loop
    ws := t - (extract(isodow from t)::int - 1) - 7 * k;
    continue when exists (select 1 from bandlog.freeze_events f where f.user_id = me and f.kind = 'earn' and f.ref = ws::text);
    perfect := true;
    for i in 0..6 loop
      if not bandlog.soc_active_on(me, ws + i) then perfect := false; exit; end if;
    end loop;
    if perfect then
      insert into bandlog.freeze_events (user_id, kind, ref) values (me, 'earn', ws::text) on conflict do nothing;
      if have < 3 then have := have + 1; e := e + 1; end if;
    end if;
  end loop;

  -- use: the run of empty days ending yesterday (at most 4 looked at; 4 > the 3-token max)
  select least(
           (select min(m.date) from bandlog.meals m where m.user_id = me),
           (select min(w.date) from bandlog.workouts w where w.user_id = me),
           (select min(x.date) from bandlog.exercise_log x where x.user_id = me)) into first_day;
  d := t - 1;
  while array_length(gap, 1) is distinct from 4 and first_day is not null and d > first_day
        and not bandlog.soc_active_on(me, d) and not bandlog.soc_is_frozen(me, d) loop
    gap := gap || d;
    d := d - 1;
  end loop;
  if coalesce(array_length(gap, 1), 0) between 1 and have
     and (bandlog.soc_active_on(me, d) or bandlog.soc_is_frozen(me, d)) then
    foreach d in array gap loop
      insert into bandlog.freeze_events (user_id, kind, ref) values (me, 'use', d::text) on conflict do nothing;
      if found then have := have - 1; u := u + 1; end if;
    end loop;
  end if;

  update bandlog.streak_freezes f set tokens = have, updated_at = now() where f.user_id = me;
  tokens := have;
  earned_now := e;
  used_now := u;
  used_days := coalesce((select array_agg(x.day order by x.day desc) from (
                            select case when f.kind = 'use' then f.ref::date end as day
                              from bandlog.freeze_events f where f.user_id = me and f.kind = 'use') x
                          where x.day > t - 400), '{}');
  return next;
end $$;
revoke all on function bandlog.freeze_sync() from public, anon;
grant execute on function bandlog.freeze_sync() to authenticated;

-- Gift one of my tokens to a squadmate. Returns my tokens left.
create or replace function bandlog.freeze_gift(p_to uuid) returns int
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  mine int;
  theirs int;
  stamp text := (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  who text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_to is null or p_to = me then raise exception 'Pick a squadmate'; end if;
  if not bandlog.soc_shares_squad(p_to) then raise exception 'You can only gift a squadmate'; end if;
  if exists (select 1 from bandlog.freeze_events f where f.user_id = me and f.kind = 'gift_out' and f.other_user = p_to
              and f.created_at > now() - interval '7 days') then
    raise exception 'You already gifted them a freeze this week';
  end if;
  insert into bandlog.streak_freezes (user_id) values (me), (p_to) on conflict (user_id) do nothing;
  select f.tokens into mine from bandlog.streak_freezes f where f.user_id = me for update;
  select f.tokens into theirs from bandlog.streak_freezes f where f.user_id = p_to for update;
  if mine < 1 then raise exception 'No freezes to gift'; end if;
  if theirs >= 3 then raise exception 'They already have 3 freezes'; end if;
  update bandlog.streak_freezes set tokens = tokens - 1, updated_at = now() where user_id = me;
  update bandlog.streak_freezes set tokens = tokens + 1, updated_at = now() where user_id = p_to;
  insert into bandlog.freeze_events (user_id, kind, ref, other_user) values (me, 'gift_out', p_to::text || ':' || stamp, p_to);
  insert into bandlog.freeze_events (user_id, kind, ref, other_user) values (p_to, 'gift_in', me::text || ':' || stamp, me);
  select coalesce(nullif(p.name, ''), 'A squadmate') into who from bandlog.profiles p where p.id = me;
  insert into bandlog.notifications (user_id, kind, title, body, url)
  values (p_to, 'system', coalesce(who, 'A squadmate') || ' gifted you a streak freeze', 'It covers one missed day, automatically.', '/streak');
  return mine - 1;
end $$;
revoke all on function bandlog.freeze_gift(uuid) from public, anon;
grant execute on function bandlog.freeze_gift(uuid) to authenticated;

-- day_streak (v26) now counts frozen days as active (same signature, same grant).
create or replace function bandlog.day_streak(u uuid) returns int
language sql stable security definer set search_path = bandlog as $$
  with t as (select (now() at time zone 'Asia/Kolkata')::date as d),
  days as (
    select m.date from bandlog.meals m, t where m.user_id = u and m.date between t.d - 400 and t.d
    union select w.date from bandlog.workouts w, t where w.user_id = u and w.date between t.d - 400 and t.d
    union select e.date from bandlog.exercise_log e, t where e.user_id = u and e.date between t.d - 400 and t.d
    union select x.day from (select case when f.kind = 'use' then f.ref::date end as day
                               from bandlog.freeze_events f where f.user_id = u and f.kind = 'use') x, t
           where x.day between t.d - 400 and t.d
  ),
  s as (
    select case when exists (select 1 from days, t where days.date = t.d) then (select d from t)
                when exists (select 1 from days, t where days.date = t.d - 1) then (select d from t) - 1 end as start
  ),
  ranked as (
    select (s.start - days.date) as off, (row_number() over (order by days.date desc) - 1) as rn
    from days, s where s.start is not null and days.date <= s.start
  )
  select count(*)::int from ranked where off = rn;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. D2 Referrals. Each profile gets a 6-character code (my_referral_code()). A NEW account
--    (created in the last 30 days) can claim one code once; both people then get 1 week of Pro:
--      plan 'pro' / 'free', or a dated beta  → pro_until = max(now, pro_until) + 7 days (free → pro)
--      beta with no end date (everyone today) → 7 days banked in referral_pro_days (shown in the
--                                               app; applied when the beta ends)
--    Web src/lib/referrals.ts referralGrant() and Android util/Referrals.kt mirror this rule.
-- ---------------------------------------------------------------------------------------------
alter table bandlog.profiles add column if not exists referral_code text;
alter table bandlog.profiles add column if not exists referral_pro_days int not null default 0;
create unique index if not exists profiles_referral_code_key on bandlog.profiles (referral_code);

create or replace function bandlog.profiles_guard_referral() returns trigger
language plpgsql set search_path = bandlog as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not bandlog.soc_trusted() then
    new.referral_code := old.referral_code;
    new.referral_pro_days := old.referral_pro_days;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_referral on bandlog.profiles;
create trigger profiles_guard_referral before update on bandlog.profiles
  for each row execute function bandlog.profiles_guard_referral();

create table if not exists bandlog.referrals (
  referee_id uuid primary key references auth.users(id) on delete cascade,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  referrer_bonus text not null check (referrer_bonus in ('extended', 'banked')),
  referee_bonus text not null check (referee_bonus in ('extended', 'banked')),
  created_at timestamptz not null default now(),
  check (referee_id <> referrer_id)
);
create index if not exists referrals_referrer_idx on bandlog.referrals (referrer_id, created_at desc);
alter table bandlog.referrals enable row level security;
drop policy if exists "referrals own read" on bandlog.referrals;
create policy "referrals own read" on bandlog.referrals for select using (auth.uid() in (referee_id, referrer_id));
grant select on bandlog.referrals to authenticated;
grant all on bandlog.referrals to service_role;

create or replace function bandlog.my_referral_code() returns text
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  c text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  tries int := 0;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select p.referral_code into c from bandlog.profiles p where p.id = me;
  if c is not null then return c; end if;
  perform set_config('bandlog.trusted', 'on', true);
  loop
    tries := tries + 1;
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    begin
      update bandlog.profiles set referral_code = c where id = me;
      exit;
    exception when unique_violation then
      if tries > 20 then raise; end if;
    end;
  end loop;
  perform set_config('bandlog.trusted', '', true);
  return c;
end $$;
revoke all on function bandlog.my_referral_code() from public, anon;
grant execute on function bandlog.my_referral_code() to authenticated;

-- 1 week of Pro for u (see the rule above). Returns 'extended' or 'banked'. Server-side only.
create or replace function bandlog.grant_referral_week(u uuid) returns text
language plpgsql security definer set search_path = bandlog as $$
declare
  pl text;
  pu timestamptz;
begin
  select p.plan, p.pro_until into pl, pu from bandlog.profiles p where p.id = u;
  perform set_config('bandlog.trusted', 'on', true);
  if pl = 'beta' and pu is null then
    update bandlog.profiles set referral_pro_days = referral_pro_days + 7 where id = u;
    perform set_config('bandlog.trusted', '', true);
    return 'banked';
  end if;
  update bandlog.profiles
     set plan = case when plan = 'free' then 'pro' else plan end,
         pro_until = greatest(coalesce(pro_until, now()), now()) + interval '7 days'
   where id = u;
  perform set_config('bandlog.trusted', '', true);
  return 'extended';
end $$;
revoke all on function bandlog.grant_referral_week(uuid) from public, anon, authenticated;
grant execute on function bandlog.grant_referral_week(uuid) to service_role;

-- Claim a friend's code. Returns {ok, reason, referrer_name}. reason: unknown | self | already | too_old.
create or replace function bandlog.referral_claim(p_code text) returns jsonb
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  ref uuid;
  born timestamptz;
  who text;
  me_name text;
  a text;
  b text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select p.id, coalesce(nullif(p.name, ''), 'Your friend') into ref, who from bandlog.profiles p where p.referral_code = v_code;
  if ref is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if ref = me then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if exists (select 1 from bandlog.referrals r where r.referee_id = me) then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  select u.created_at into born from auth.users u where u.id = me;
  if born is null or born < now() - interval '30 days' then return jsonb_build_object('ok', false, 'reason', 'too_old'); end if;
  a := bandlog.grant_referral_week(ref);
  b := bandlog.grant_referral_week(me);
  insert into bandlog.referrals (referee_id, referrer_id, code, referrer_bonus, referee_bonus) values (me, ref, v_code, a, b);
  select coalesce(nullif(p.name, ''), 'A friend') into me_name from bandlog.profiles p where p.id = me;
  insert into bandlog.notifications (user_id, kind, title, body, url)
  values (ref, 'system', coalesce(me_name, 'A friend') || ' joined with your invite', 'You both get 1 week of Pro.', '/invite');
  return jsonb_build_object('ok', true, 'reason', null, 'referrer_name', who, 'bonus', b);
end $$;
revoke all on function bandlog.referral_claim(text) from public, anon;
grant execute on function bandlog.referral_claim(text) to authenticated;

-- The people who joined with my code (newest first).
create or replace function bandlog.my_referrals()
returns table (name text, avatar_path text, joined_at timestamptz)
language sql stable security definer set search_path = bandlog as $$
  select coalesce(nullif(p.name, ''), 'A friend'), p.avatar_path, r.created_at
    from bandlog.referrals r left join bandlog.profiles p on p.id = r.referee_id
   where r.referrer_id = auth.uid()
   order by r.created_at desc
   limit 200;
$$;
revoke all on function bandlog.my_referrals() from public, anon;
grant execute on function bandlog.my_referrals() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. D3 Verified gym / college squads. The owner requests; an admin approves in /admin/squads
--    (service role). Only the service role (or a trusted RPC) can set verified / org_*.
-- ---------------------------------------------------------------------------------------------
alter table bandlog.groups add column if not exists verified boolean not null default false;
alter table bandlog.groups add column if not exists org_name text;
alter table bandlog.groups add column if not exists org_kind text;
alter table bandlog.groups drop constraint if exists groups_org_kind_check;
alter table bandlog.groups add constraint groups_org_kind_check check (org_kind is null or org_kind in ('gym', 'college', 'office', 'club'));

create or replace function bandlog.groups_guard_verified() returns trigger
language plpgsql set search_path = bandlog as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not bandlog.soc_trusted() then
    new.verified := old.verified;
    new.org_name := old.org_name;
    new.org_kind := old.org_kind;
  end if;
  return new;
end $$;
drop trigger if exists groups_guard_verified on bandlog.groups;
create trigger groups_guard_verified before update on bandlog.groups
  for each row execute function bandlog.groups_guard_verified();

create or replace function bandlog.groups_guard_verified_insert() returns trigger
language plpgsql set search_path = bandlog as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not bandlog.soc_trusted() then
    new.verified := false;
    new.org_name := null;
    new.org_kind := null;
  end if;
  return new;
end $$;
drop trigger if exists groups_guard_verified_insert on bandlog.groups;
create trigger groups_guard_verified_insert before insert on bandlog.groups
  for each row execute function bandlog.groups_guard_verified_insert();

create table if not exists bandlog.squad_verifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  org_name text not null check (length(org_name) between 2 and 80),
  org_kind text not null check (org_kind in ('gym', 'college', 'office', 'club')),
  proof text not null default '' check (length(proof) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists squad_verifications_one_pending on bandlog.squad_verifications (group_id) where status = 'pending';
alter table bandlog.squad_verifications enable row level security;
drop policy if exists "verifications members read" on bandlog.squad_verifications;
create policy "verifications members read" on bandlog.squad_verifications for select using (bandlog.is_member(group_id));
grant select on bandlog.squad_verifications to authenticated;
grant all on bandlog.squad_verifications to service_role;

create or replace function bandlog.request_squad_verification(g uuid, p_org text, p_kind text, p_proof text default '') returns uuid
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  rid uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from bandlog.groups x where x.id = g and x.owner_id = me) then raise exception 'Only the squad owner can ask for verification'; end if;
  if exists (select 1 from bandlog.groups x where x.id = g and x.verified) then raise exception 'This squad is already verified'; end if;
  if exists (select 1 from bandlog.squad_verifications v where v.group_id = g and v.status = 'pending') then raise exception 'A request is already waiting for review'; end if;
  insert into bandlog.squad_verifications (group_id, requested_by, org_name, org_kind, proof)
  values (g, me, trim(p_org), p_kind, coalesce(trim(p_proof), '')) returning id into rid;
  return rid;
end $$;
revoke all on function bandlog.request_squad_verification(uuid, text, text, text) from public, anon;
grant execute on function bandlog.request_squad_verification(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. D4 Trainer / dietitian view. A client grants a coach (by username) read access; the coach
--    sees the client's daily totals, meals, weights and workouts through client_overview() and
--    can leave comments. Revoking stops it at once. (Marked "paid tier later" in the apps.)
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.coach_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (client_id, coach_id),
  check (client_id <> coach_id)
);
alter table bandlog.coach_links enable row level security;
drop policy if exists "coach links parties read" on bandlog.coach_links;
create policy "coach links parties read" on bandlog.coach_links for select using (auth.uid() in (client_id, coach_id));
grant select on bandlog.coach_links to authenticated;
grant all on bandlog.coach_links to service_role;

create or replace function bandlog.coaches_client(c uuid) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select exists (select 1 from bandlog.coach_links l where l.client_id = c and l.coach_id = auth.uid() and l.status = 'active');
$$;
revoke all on function bandlog.coaches_client(uuid) from public, anon;
grant execute on function bandlog.coaches_client(uuid) to authenticated;

create table if not exists bandlog.coach_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  day date,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists coach_comments_client_idx on bandlog.coach_comments (client_id, created_at desc);
alter table bandlog.coach_comments enable row level security;
drop policy if exists "coach comments parties read" on bandlog.coach_comments;
create policy "coach comments parties read" on bandlog.coach_comments for select using (auth.uid() in (client_id, coach_id));
drop policy if exists "coach comments coach insert" on bandlog.coach_comments;
create policy "coach comments coach insert" on bandlog.coach_comments for insert
  with check (coach_id = auth.uid() and bandlog.coaches_client(client_id));
drop policy if exists "coach comments coach delete" on bandlog.coach_comments;
create policy "coach comments coach delete" on bandlog.coach_comments for delete using (coach_id = auth.uid());
grant select, insert, delete on bandlog.coach_comments to authenticated;
grant all on bandlog.coach_comments to service_role;

create or replace function bandlog.coach_grant(p_username text) returns uuid
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  coach uuid;
  who text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select p.id into coach from bandlog.profiles p where lower(p.username) = lower(trim(both '@ ' from coalesce(p_username, '')));
  if coach is null then raise exception 'No one has that username'; end if;
  if coach = me then raise exception 'That''s you'; end if;
  insert into bandlog.coach_links (client_id, coach_id, status) values (me, coach, 'active')
  on conflict (client_id, coach_id) do update set status = 'active', revoked_at = null, created_at = now();
  select coalesce(nullif(p.name, ''), 'Someone') into who from bandlog.profiles p where p.id = me;
  insert into bandlog.notifications (user_id, kind, title, body, url)
  values (coach, 'system', coalesce(who, 'Someone') || ' added you as their coach', 'You can see their logs and leave notes.', '/clients');
  return coach;
end $$;
revoke all on function bandlog.coach_grant(text) from public, anon;
grant execute on function bandlog.coach_grant(text) to authenticated;

-- Client revokes a coach, or a coach drops a client.
create or replace function bandlog.coach_revoke(p_other uuid) returns void
language sql security definer set search_path = bandlog as $$
  update bandlog.coach_links set status = 'revoked', revoked_at = now()
   where status = 'active' and ((client_id = auth.uid() and coach_id = p_other) or (coach_id = auth.uid() and client_id = p_other));
$$;
revoke all on function bandlog.coach_revoke(uuid) from public, anon;
grant execute on function bandlog.coach_revoke(uuid) to authenticated;

create or replace function bandlog.my_coaches()
returns table (coach_id uuid, name text, username text, avatar_path text, since timestamptz)
language sql stable security definer set search_path = bandlog as $$
  select l.coach_id, coalesce(nullif(p.name, ''), 'Coach'), p.username, p.avatar_path, l.created_at
    from bandlog.coach_links l left join bandlog.profiles p on p.id = l.coach_id
   where l.client_id = auth.uid() and l.status = 'active'
   order by l.created_at desc;
$$;
revoke all on function bandlog.my_coaches() from public, anon;
grant execute on function bandlog.my_coaches() to authenticated;

create or replace function bandlog.my_clients()
returns table (client_id uuid, name text, username text, avatar_path text, since timestamptz, last_active date, streak int, weight_kg numeric)
language sql stable security definer set search_path = bandlog as $$
  select l.client_id, coalesce(nullif(p.name, ''), 'Client'), p.username, p.avatar_path, l.created_at,
         (select max(s.date) from bandlog.daily_stats s where s.user_id = l.client_id and (s.meals > 0 or s.trained)),
         bandlog.day_streak(l.client_id),
         (select w.weight_kg from bandlog.weight_log w where w.user_id = l.client_id order by w.date desc limit 1)
    from bandlog.coach_links l left join bandlog.profiles p on p.id = l.client_id
   where l.coach_id = auth.uid() and l.status = 'active'
   order by l.created_at desc;
$$;
revoke all on function bandlog.my_clients() from public, anon;
grant execute on function bandlog.my_clients() to authenticated;

-- One client's last n days for their coach: targets, daily totals, meals, weights, workouts.
create or replace function bandlog.client_overview(p_client uuid, p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = bandlog as $$
declare
  since date := bandlog.soc_today() - greatest(1, least(coalesce(p_days, 14), 60));
begin
  if not bandlog.coaches_client(p_client) then raise exception 'Not your client'; end if;
  return jsonb_build_object(
    'profile', (select jsonb_build_object('name', coalesce(nullif(p.name, ''), 'Client'), 'calorie_target', p.calorie_target,
                                          'protein_target_g', p.protein_target_g, 'goal_type', p.goal_type, 'weight_kg', p.weight_kg,
                                          'goal_weight_kg', p.goal_weight_kg)
                  from bandlog.profiles p where p.id = p_client),
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', s.date, 'calories', s.calories, 'protein_g', s.protein_g,
                                                          'meals', s.meals, 'trained', s.trained, 'burned', s.burned) order by s.date desc)
                        from bandlog.daily_stats s where s.user_id = p_client and s.date >= since), '[]'::jsonb),
    'meals', coalesce((select jsonb_agg(x order by x->>'date' desc) from (
                        select jsonb_build_object('date', m.date, 'text', m.raw_text,
                                 'calories', coalesce((select sum(i.calories) from bandlog.meal_items i where i.meal_id = m.id), 0),
                                 'protein_g', coalesce((select sum(i.protein_g) from bandlog.meal_items i where i.meal_id = m.id), 0)) as x
                          from bandlog.meals m where m.user_id = p_client and m.date >= since
                         order by m.date desc, m.created_at desc limit 120) q), '[]'::jsonb),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('date', w.date, 'kg', w.weight_kg) order by w.date desc)
                           from bandlog.weight_log w where w.user_id = p_client and w.date >= since - 60), '[]'::jsonb),
    'workouts', coalesce((select jsonb_agg(jsonb_build_object('date', w.date, 'kind', w.kind, 'minutes', w.minutes, 'muscles', w.muscles) order by w.date desc)
                            from bandlog.workouts w where w.user_id = p_client and w.date >= since), '[]'::jsonb)
  );
end $$;
revoke all on function bandlog.client_overview(uuid, int) from public, anon;
grant execute on function bandlog.client_overview(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. D6 More reactions (7 appended to the v35 six, same order in both apps) + clean / cheat
--    stamps on squad meal photos (one stamp per person per post; tap again to remove).
-- ---------------------------------------------------------------------------------------------
alter table bandlog.post_reactions drop constraint if exists post_reactions_emoji_check;
alter table bandlog.post_reactions add constraint post_reactions_emoji_check
  check (emoji in ('❤️', '🔥', '👍', '😂', '😮', '💪', '🥗', '🍗', '🏋️', '🙌', '💯', '😤', '🫡'));

create table if not exists bandlog.post_stamps (
  post_id uuid not null references bandlog.group_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stamp text not null check (stamp in ('clean', 'cheat')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table bandlog.post_stamps enable row level security;
drop policy if exists "stamps members read" on bandlog.post_stamps;
create policy "stamps members read" on bandlog.post_stamps for select using (bandlog.post_in_my_squads(post_id));
drop policy if exists "stamps own insert" on bandlog.post_stamps;
create policy "stamps own insert" on bandlog.post_stamps for insert with check (user_id = auth.uid() and bandlog.post_in_my_squads(post_id));
drop policy if exists "stamps own update" on bandlog.post_stamps;
create policy "stamps own update" on bandlog.post_stamps for update using (user_id = auth.uid()) with check (user_id = auth.uid() and bandlog.post_in_my_squads(post_id));
drop policy if exists "stamps own delete" on bandlog.post_stamps;
create policy "stamps own delete" on bandlog.post_stamps for delete using (user_id = auth.uid());
grant select, insert, update, delete on bandlog.post_stamps to authenticated;
grant all on bandlog.post_stamps to service_role;

-- Stamp counts for a page of posts: one row per post that has any.
create or replace function bandlog.post_stamp_counts(p_posts uuid[])
returns table (post_id uuid, clean int, cheat int, mine text)
language sql stable security definer set search_path = bandlog as $$
  select s.post_id,
         count(*) filter (where s.stamp = 'clean')::int,
         count(*) filter (where s.stamp = 'cheat')::int,
         max(s.stamp) filter (where s.user_id = auth.uid())
    from bandlog.post_stamps s
   where s.post_id = any (p_posts) and bandlog.post_in_my_squads(s.post_id)
   group by s.post_id;
$$;
revoke all on function bandlog.post_stamp_counts(uuid[]) from public, anon;
grant execute on function bandlog.post_stamp_counts(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. D7 Live squad sessions. Opt-in (profiles.live_share, default OFF). While a live workout
--    runs, the app keeps one row fresh (seen_at every few minutes); squadmates see who's live
--    (seen in the last 20 min, started in the last 4 h) and can cheer (1 per pair per 10 min).
-- ---------------------------------------------------------------------------------------------
alter table bandlog.profiles add column if not exists live_share boolean not null default false;

create table if not exists bandlog.live_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null default 'Training' check (length(label) <= 60),
  started_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
alter table bandlog.live_sessions enable row level security;
drop policy if exists "live own all" on bandlog.live_sessions;
create policy "live own all" on bandlog.live_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on bandlog.live_sessions to authenticated;
grant all on bandlog.live_sessions to service_role;

create table if not exists bandlog.live_cheers (
  id bigserial primary key,
  to_user uuid not null references auth.users(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists live_cheers_pair_idx on bandlog.live_cheers (from_user, to_user, created_at desc);
alter table bandlog.live_cheers enable row level security;
drop policy if exists "cheers parties read" on bandlog.live_cheers;
create policy "cheers parties read" on bandlog.live_cheers for select using (auth.uid() in (to_user, from_user));
grant select on bandlog.live_cheers to authenticated;
grant all on bandlog.live_cheers to service_role;

create or replace function bandlog.squad_live(g uuid)
returns table (user_id uuid, name text, avatar_path text, label text, started_at timestamptz, cheers int)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  select l.user_id,
         bandlog.member_name(l.user_id, m.display_name),
         p.avatar_path, l.label, l.started_at,
         (select count(*)::int from bandlog.live_cheers c where c.to_user = l.user_id and c.created_at >= l.started_at)
    from bandlog.live_sessions l
    join bandlog.group_members m on m.group_id = g and m.user_id = l.user_id
    join bandlog.profiles p on p.id = l.user_id
   where p.live_share and l.seen_at > now() - interval '20 minutes' and l.started_at > now() - interval '4 hours'
   order by l.started_at desc;
end $$;
revoke all on function bandlog.squad_live(uuid) from public, anon;
grant execute on function bandlog.squad_live(uuid) to authenticated;

create or replace function bandlog.live_cheer(p_user uuid) returns boolean
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  who text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_user = me or not bandlog.soc_shares_squad(p_user) then raise exception 'You can only cheer a squadmate'; end if;
  if not exists (select 1 from bandlog.live_sessions l join bandlog.profiles p on p.id = l.user_id
                  where l.user_id = p_user and p.live_share and l.seen_at > now() - interval '20 minutes') then
    return false;
  end if;
  if exists (select 1 from bandlog.live_cheers c where c.from_user = me and c.to_user = p_user and c.created_at > now() - interval '10 minutes') then
    return false;
  end if;
  insert into bandlog.live_cheers (to_user, from_user) values (p_user, me);
  select coalesce(nullif(p.name, ''), 'A squadmate') into who from bandlog.profiles p where p.id = me;
  insert into bandlog.notifications (user_id, kind, title, body, url)
  values (p_user, 'system', coalesce(who, 'A squadmate') || ' is cheering you on 🔥', 'Finish strong.', '/squad');
  return true;
end $$;
revoke all on function bandlog.live_cheer(uuid) from public, anon;
grant execute on function bandlog.live_cheer(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. D8 Accountability pledges (honour system: no money moves). Visible to the squad it's made
--    in. kind log_days / train_days / protein_days are checked by the apps from the logs; custom
--    is self-reported. stake_inr is only a number people promise ("pay into the squad pot").
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.pledges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references bandlog.groups(id) on delete set null,
  goal text not null check (length(goal) between 2 and 120),
  kind text not null default 'custom' check (kind in ('log_days', 'train_days', 'protein_days', 'custom')),
  target int check (target is null or target between 1 and 366),
  stake text not null default '' check (length(stake) <= 120),
  stake_inr int not null default 0 check (stake_inr between 0 and 100000),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active', 'kept', 'broken', 'cancelled')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (ends_on >= starts_on and ends_on <= starts_on + 366)
);
create index if not exists pledges_group_idx on bandlog.pledges (group_id, created_at desc);
create index if not exists pledges_user_idx on bandlog.pledges (user_id, created_at desc);
alter table bandlog.pledges enable row level security;
drop policy if exists "pledges read own or squad" on bandlog.pledges;
create policy "pledges read own or squad" on bandlog.pledges for select using (user_id = auth.uid() or (group_id is not null and bandlog.is_member(group_id)));
drop policy if exists "pledges own insert" on bandlog.pledges;
create policy "pledges own insert" on bandlog.pledges for insert with check (user_id = auth.uid() and (group_id is null or bandlog.is_member(group_id)));
drop policy if exists "pledges own update" on bandlog.pledges;
create policy "pledges own update" on bandlog.pledges for update using (user_id = auth.uid()) with check (user_id = auth.uid() and (group_id is null or bandlog.is_member(group_id)));
drop policy if exists "pledges own delete" on bandlog.pledges;
create policy "pledges own delete" on bandlog.pledges for delete using (user_id = auth.uid());
grant select, insert, update, delete on bandlog.pledges to authenticated;
grant all on bandlog.pledges to service_role;

-- Squad pledges with the author's name (member_name needs the definer).
create or replace function bandlog.squad_pledges(g uuid)
returns table (id uuid, user_id uuid, name text, goal text, kind text, target int, stake text, stake_inr int,
               starts_on date, ends_on date, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  select p.id, p.user_id, bandlog.member_name(p.user_id, (select m.display_name from bandlog.group_members m where m.group_id = g and m.user_id = p.user_id)),
         p.goal, p.kind, p.target, p.stake, p.stake_inr, p.starts_on, p.ends_on, p.status, p.created_at
    from bandlog.pledges p
   where p.group_id = g and p.status <> 'cancelled'
   order by (p.status = 'active') desc, p.created_at desc
   limit 50;
end $$;
revoke all on function bandlog.squad_pledges(uuid) from public, anon;
grant execute on function bandlog.squad_pledges(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 8. D9 Seasonal events: the limited-edition jewellery each person earned. The events and their
--    rules live in the apps (web src/lib/seasonal.ts, Android util/Seasonal.kt); the apps insert
--    the row when the goal is met inside the event window.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.event_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null check (event_id ~ '^[a-z0-9-]{3,40}$'),
  earned_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table bandlog.event_badges enable row level security;
drop policy if exists "event badges own read" on bandlog.event_badges;
create policy "event badges own read" on bandlog.event_badges for select using (user_id = auth.uid());
drop policy if exists "event badges own insert" on bandlog.event_badges;
create policy "event badges own insert" on bandlog.event_badges for insert with check (user_id = auth.uid());
grant select, insert on bandlog.event_badges to authenticated;
grant all on bandlog.event_badges to service_role;

-- ---------------------------------------------------------------------------------------------
-- 9. D11 Premium covers + badge skins. Payments aren't wired: during the beta every pack
--    unlocks free (via 'beta_free'), and the apps still show the price. Gold covers need the
--    cover_preset check (v40) widened to the '-gold' tone.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.pack_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null check (pack_id ~ '^[a-z0-9-]{3,40}$'),
  price_inr int not null default 0,
  via text not null default 'beta_free' check (via in ('beta_free', 'purchase', 'gift')),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);
alter table bandlog.pack_unlocks enable row level security;
drop policy if exists "packs own read" on bandlog.pack_unlocks;
create policy "packs own read" on bandlog.pack_unlocks for select using (user_id = auth.uid());
drop policy if exists "packs own beta insert" on bandlog.pack_unlocks;
create policy "packs own beta insert" on bandlog.pack_unlocks for insert with check (user_id = auth.uid() and via = 'beta_free');
grant select, insert on bandlog.pack_unlocks to authenticated;
grant all on bandlog.pack_unlocks to service_role;

alter table bandlog.profiles add column if not exists badge_skin text;
alter table bandlog.profiles drop constraint if exists profiles_badge_skin_check;
alter table bandlog.profiles add constraint profiles_badge_skin_check check (badge_skin is null or badge_skin ~ '^[a-z-]{3,24}$');
alter table bandlog.profiles drop constraint if exists profiles_cover_preset_format;
alter table bandlog.profiles add constraint profiles_cover_preset_format check (cover_preset is null or cover_preset ~ '^[a-z]{2,16}-(light|dark|gold)$');

insert into bandlog.app_config (key, value) values
  ('packs', '{"beta_free": true}'),
  ('leagues', '{"enabled": false}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------------------------
-- 10. D12 Squad vs squad leagues (behind app_config.leagues.enabled = false, and a client flag
--     that is also off). Squads sit in tiers 1 (top) … 5; each week the top 20 % of a tier move
--     up and the bottom 20 % move down (web src/lib/leagues.ts has the maths). Nothing calls
--     league_close_week yet: it's for the cron once the owner turns leagues on.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.squad_leagues (
  group_id uuid primary key references bandlog.groups(id) on delete cascade,
  tier int not null default 5 check (tier between 1 and 5),
  updated_at timestamptz not null default now()
);
create table if not exists bandlog.league_weeks (
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  week_start date not null,
  tier int not null check (tier between 1 and 5),
  points int not null default 0,
  rank int,
  movement text check (movement in ('up', 'down', 'stay')),
  primary key (group_id, week_start)
);
alter table bandlog.squad_leagues enable row level security;
alter table bandlog.league_weeks enable row level security;
drop policy if exists "leagues read" on bandlog.squad_leagues;
create policy "leagues read" on bandlog.squad_leagues for select using (auth.uid() is not null);
drop policy if exists "league weeks read" on bandlog.league_weeks;
create policy "league weeks read" on bandlog.league_weeks for select using (auth.uid() is not null);
grant select on bandlog.squad_leagues, bandlog.league_weeks to authenticated;
grant all on bandlog.squad_leagues, bandlog.league_weeks to service_role;

-- This week's standings in my squad's tier: squad points = average week_points of its members.
create or replace function bandlog.league_table(g uuid)
returns table (group_id uuid, name text, verified boolean, tier int, points int, members int)
language plpgsql stable security definer set search_path = bandlog as $$
declare
  my_tier int;
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  select coalesce((select l.tier from bandlog.squad_leagues l where l.group_id = g), 5) into my_tier;
  return query
  select x.id, x.name, x.verified, my_tier,
         coalesce((select round(avg(bandlog.week_points(m.user_id)))::int from bandlog.group_members m where m.group_id = x.id), 0),
         (select count(*)::int from bandlog.group_members m where m.group_id = x.id)
    from bandlog.groups x
   where coalesce((select l.tier from bandlog.squad_leagues l where l.group_id = x.id), 5) = my_tier
     and (select count(*) from bandlog.group_members m where m.group_id = x.id) >= 2
   order by 5 desc, x.created_at
   limit 30;
end $$;
revoke all on function bandlog.league_table(uuid) from public, anon;
grant execute on function bandlog.league_table(uuid) to authenticated;

notify pgrst, 'reload schema';
