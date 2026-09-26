-- v2.14 (schema_v37): Gen Z onboarding answers, the AI coach with memory, buddy streaks, and the
-- in-app colour "milestone flood" (milestones_seen).
-- Additive and idempotent: new tables, new defaulted/nullable columns, one widened check, two guard
-- triggers and a handful of RPCs. Safe to re-run. Undo with docs/revert_v37.sql.
--
-- NOT APPLIED YET. Both v2.14 clients tolerate this file being missing: the new onboarding still
-- finishes (the new answers are skipped), the coach screens show "Coming with the next update",
-- buddies hide, and milestones fall back to on-device "seen" storage.

-- ---------------------------------------------------------------------------------------------
-- 1. Profile columns: onboarding answers + coach settings + milestones.
-- ---------------------------------------------------------------------------------------------
alter table bandlog.profiles
  add column if not exists coach_style text not null default 'balanced',
  add column if not exists heard_from text,
  add column if not exists obstacles text[],
  add column if not exists training_days smallint,
  add column if not exists sports text[],
  add column if not exists onboarded_v2 boolean not null default false,
  add column if not exists first_challenge text,
  add column if not exists coach_note_time time not null default '08:00',
  add column if not exists coach_quiet_from time not null default '23:00',
  add column if not exists coach_quiet_to time not null default '07:00',
  add column if not exists coach_weekly_roast boolean not null default false,
  add column if not exists coach_remember boolean not null default true,
  add column if not exists milestones_seen text[] not null default '{}';

alter table bandlog.profiles drop constraint if exists profiles_coach_style_check;
alter table bandlog.profiles add constraint profiles_coach_style_check check (coach_style in ('calm', 'balanced', 'no_excuses'));
alter table bandlog.profiles drop constraint if exists profiles_training_days_check;
alter table bandlog.profiles add constraint profiles_training_days_check check (training_days is null or training_days between 0 and 7);
alter table bandlog.profiles drop constraint if exists profiles_heard_from_check;
alter table bandlog.profiles add constraint profiles_heard_from_check check (heard_from is null or char_length(heard_from) <= 40);

-- Under 18: the coach is capped at Balanced and there is no weekly roast. Enforced here too, so an
-- old client (or a hand-crafted PATCH) can't get around it.
create or replace function bandlog.guard_coach_style() returns trigger
language plpgsql set search_path = bandlog as $$
begin
  if new.dob is not null and new.dob > (current_date - interval '18 years') then
    if new.coach_style = 'no_excuses' then new.coach_style := 'balanced'; end if;
    new.coach_weekly_roast := false;
  end if;
  if new.coach_style <> 'no_excuses' then new.coach_weekly_roast := false; end if;
  return new;
end $$;
drop trigger if exists profiles_guard_coach_style on bandlog.profiles;
create trigger profiles_guard_coach_style before insert or update on bandlog.profiles
  for each row execute function bandlog.guard_coach_style();

-- ---------------------------------------------------------------------------------------------
-- 2. Coach memory: what the coach knows. Every row is visible and deletable by its owner.
--    kept = false is a "Learned: … Keep / Forget" proposal; it expires after 7 days if not kept.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('goal', 'food', 'life', 'body', 'style')),
  text text not null check (char_length(text) between 1 and 200),
  source text not null default 'chat' check (source in ('onboarding', 'chat', 'inferred')),
  confidence real not null default 1 check (confidence between 0 and 1),
  pinned boolean not null default false,
  kept boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  deleted_at timestamptz
);
create index if not exists coach_memory_user_idx on bandlog.coach_memory (user_id, created_at desc) where deleted_at is null;
alter table bandlog.coach_memory enable row level security;
drop policy if exists "coach memory own" on bandlog.coach_memory;
create policy "coach memory own" on bandlog.coach_memory for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on bandlog.coach_memory to authenticated;
grant all on bandlog.coach_memory to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Coach chat history (90-day retention, see coach_prune) and today's note (one per day).
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'coach')),
  text text not null default '' check (char_length(text) <= 4000),
  tool jsonb,
  created_at timestamptz not null default now()
);
create index if not exists coach_messages_user_idx on bandlog.coach_messages (user_id, created_at desc);
alter table bandlog.coach_messages enable row level security;
drop policy if exists "coach messages own read" on bandlog.coach_messages;
create policy "coach messages own read" on bandlog.coach_messages for select using (user_id = auth.uid());
drop policy if exists "coach messages own delete" on bandlog.coach_messages;
create policy "coach messages own delete" on bandlog.coach_messages for delete using (user_id = auth.uid());
-- Inserts come from the server (service role) so a message and its tool results are written together.
grant select, delete on bandlog.coach_messages to authenticated;
grant all on bandlog.coach_messages to service_role;

create table if not exists bandlog.coach_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  text text not null check (char_length(text) <= 1000),
  style text not null check (style in ('calm', 'balanced', 'no_excuses')),
  kind text not null default 'morning' check (kind in ('morning', 'evening', 'roast')),
  created_at timestamptz not null default now(),
  primary key (user_id, date, kind)
);
alter table bandlog.coach_notes enable row level security;
drop policy if exists "coach notes own read" on bandlog.coach_notes;
create policy "coach notes own read" on bandlog.coach_notes for select using (user_id = auth.uid());
grant select on bandlog.coach_notes to authenticated;
grant all on bandlog.coach_notes to service_role;

-- Safety flags: written by the server when a chat mentions not eating, purging, self-harm or body
-- hatred. The owner can see their own; nobody else (bar service role / the SQL console).
create table if not exists bandlog.coach_safety_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('not_eating', 'purging', 'self_harm', 'body_hate')),
  created_at timestamptz not null default now()
);
create index if not exists coach_safety_flags_user_idx on bandlog.coach_safety_flags (user_id, created_at desc);
alter table bandlog.coach_safety_flags enable row level security;
drop policy if exists "coach flags own read" on bandlog.coach_safety_flags;
create policy "coach flags own read" on bandlog.coach_safety_flags for select using (user_id = auth.uid());
grant select on bandlog.coach_safety_flags to authenticated;
grant all on bandlog.coach_safety_flags to service_role;

-- Retention: chat older than 90 days and un-kept "Learned" proposals older than 7 days.
-- The cron tick calls this (service role); safe to call any time.
create or replace function bandlog.coach_prune() returns void
language sql security definer set search_path = bandlog as $$
  delete from bandlog.coach_messages where created_at < now() - interval '90 days';
  delete from bandlog.coach_memory where kept = false and created_at < now() - interval '7 days';
  delete from bandlog.coach_memory where deleted_at is not null and deleted_at < now() - interval '30 days';
$$;
revoke all on function bandlog.coach_prune() from public, anon, authenticated;
grant execute on function bandlog.coach_prune() to service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Notifications: the coach's daily note and buddy nudges get their own kinds.
-- ---------------------------------------------------------------------------------------------
alter table bandlog.notifications drop constraint if exists notifications_kind_check;
alter table bandlog.notifications add constraint notifications_kind_check
  check (kind in ('nudge', 'protein', 'fasting', 'checkin', 'system', 'coach', 'buddy'));

-- ---------------------------------------------------------------------------------------------
-- 5. Buddy streaks. Two people; both log on a day → the streak grows; one skips → the other can
--    nudge; a day where either skipped breaks it. The streak is recomputed on read (my_buddies)
--    from meals + workouts, and the stored streak / best / last_both_logged_on are kept in sync.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.buddies (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  streak int not null default 0,
  best int not null default 0,
  last_both_logged_on date,
  check (user_a <> user_b)
);
create unique index if not exists buddies_pair_idx on bandlog.buddies (least(user_a, user_b), greatest(user_a, user_b));
create index if not exists buddies_b_idx on bandlog.buddies (user_b);
alter table bandlog.buddies enable row level security;
drop policy if exists "buddies own read" on bandlog.buddies;
create policy "buddies own read" on bandlog.buddies for select using (auth.uid() in (user_a, user_b));
drop policy if exists "buddies own delete" on bandlog.buddies;
create policy "buddies own delete" on bandlog.buddies for delete using (auth.uid() in (user_a, user_b));
grant select, delete on bandlog.buddies to authenticated;
grant all on bandlog.buddies to service_role;

create table if not exists bandlog.buddy_invites (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
create index if not exists buddy_invites_user_idx on bandlog.buddy_invites (user_id, created_at desc);
alter table bandlog.buddy_invites enable row level security;
drop policy if exists "buddy invites own read" on bandlog.buddy_invites;
create policy "buddy invites own read" on bandlog.buddy_invites for select using (user_id = auth.uid());
grant select on bandlog.buddy_invites to authenticated;
grant all on bandlog.buddy_invites to service_role;

-- The caller's open invite code (reused for 30 days), created if needed. Codes skip 0/O/1/I.
create or replace function bandlog.buddy_invite() returns text
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  c text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select code into c from bandlog.buddy_invites
   where user_id = me and used_by is null and created_at > now() - interval '30 days'
   order by created_at desc limit 1;
  if c is not null then return c; end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into bandlog.buddy_invites (code, user_id) values (c, me);
      return c;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
end $$;
revoke all on function bandlog.buddy_invite() from public, anon;
grant execute on function bandlog.buddy_invite() to authenticated;

-- Who sent this code (for the "Join <name>'s streak?" screen). Returns nothing for bad / used codes.
create or replace function bandlog.buddy_invite_info(invite text)
returns table (name text, avatar_path text)
language sql stable security definer set search_path = bandlog as $$
  select coalesce(nullif(p.name, ''), 'Your buddy'), p.avatar_path
    from bandlog.buddy_invites i join bandlog.profiles p on p.id = i.user_id
   where i.code = upper(trim(invite)) and i.used_by is null;
$$;
revoke all on function bandlog.buddy_invite_info(text) from public, anon;
grant execute on function bandlog.buddy_invite_info(text) to authenticated;

-- Accept a code: pairs the caller with the inviter and tells the inviter.
create or replace function bandlog.buddy_accept(invite text) returns uuid
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  inv bandlog.buddy_invites%rowtype;
  bid uuid;
  who text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into inv from bandlog.buddy_invites where code = upper(trim(invite)) for update;
  if not found then raise exception 'That code doesn''t exist'; end if;
  if inv.user_id = me then raise exception 'That''s your own code'; end if;
  if inv.used_by is not null and inv.used_by <> me then raise exception 'That code was already used'; end if;
  select id into bid from bandlog.buddies
   where least(user_a, user_b) = least(me, inv.user_id) and greatest(user_a, user_b) = greatest(me, inv.user_id);
  if bid is null then
    insert into bandlog.buddies (user_a, user_b) values (inv.user_id, me) returning id into bid;
    select coalesce(nullif(p.name, ''), 'Your buddy') into who from bandlog.profiles p where p.id = me;
    insert into bandlog.notifications (user_id, kind, title, body, url)
    values (inv.user_id, 'buddy', coalesce(who, 'Your buddy') || ' is your buddy now',
            'Both log today to start your streak.', '/buddy');
  end if;
  update bandlog.buddy_invites set used_by = me, used_at = now() where code = inv.code;
  return bid;
end $$;
revoke all on function bandlog.buddy_accept(text) from public, anon;
grant execute on function bandlog.buddy_accept(text) to authenticated;

-- Did this person log anything (a meal or a workout) on day d?
create or replace function bandlog.logged_on(u uuid, d date) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select exists (select 1 from bandlog.meals m where m.user_id = u and m.date = d)
      or exists (select 1 from bandlog.workouts w where w.user_id = u and w.date = d);
$$;
revoke all on function bandlog.logged_on(uuid, date) from public, anon, authenticated;
grant execute on function bandlog.logged_on(uuid, date) to service_role;

-- The caller's buddies with a fresh streak. Today counts once both have logged; until then the
-- streak runs through yesterday (so it isn't "broken" at 9 am). Days are India time, like the app.
create or replace function bandlog.my_buddies()
returns table (id uuid, partner_id uuid, partner_name text, partner_avatar text, streak int, best int,
               me_today boolean, partner_today boolean, last_both_logged_on date, created_at timestamptz)
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  b record;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  d date;
  n int;
  mine boolean;
  theirs boolean;
  last_both date;
begin
  if me is null then return; end if;
  for b in select * from bandlog.buddies x where me in (x.user_a, x.user_b) loop
    partner_id := case when b.user_a = me then b.user_b else b.user_a end;
    mine := bandlog.logged_on(me, today);
    theirs := bandlog.logged_on(partner_id, today);
    n := 0;
    last_both := null;
    d := case when mine and theirs then today else today - 1 end;
    while n < 1000 and d >= (b.created_at at time zone 'Asia/Kolkata')::date
          and bandlog.logged_on(me, d) and bandlog.logged_on(partner_id, d) loop
      if last_both is null then last_both := d; end if;
      n := n + 1;
      d := d - 1;
    end loop;
    update bandlog.buddies x
       set streak = n, best = greatest(x.best, n), last_both_logged_on = coalesce(last_both, x.last_both_logged_on)
     where x.id = b.id;
    id := b.id;
    select coalesce(nullif(p.name, ''), 'Your buddy'), p.avatar_path into partner_name, partner_avatar
      from bandlog.profiles p where p.id = partner_id;
    streak := n;
    best := greatest(b.best, n);
    me_today := mine;
    partner_today := theirs;
    last_both_logged_on := coalesce(last_both, b.last_both_logged_on);
    created_at := b.created_at;
    return next;
  end loop;
end $$;
revoke all on function bandlog.my_buddies() from public, anon;
grant execute on function bandlog.my_buddies() to authenticated;

-- Nudge the buddy who hasn't logged today. At most one nudge per pair per 20 hours; returns false
-- when it was already sent (or the buddy already logged).
create or replace function bandlog.buddy_nudge(buddy uuid) returns boolean
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  b bandlog.buddies%rowtype;
  other uuid;
  who text;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into b from bandlog.buddies where id = buddy and me in (user_a, user_b);
  if not found then raise exception 'Not your buddy'; end if;
  other := case when b.user_a = me then b.user_b else b.user_a end;
  if bandlog.logged_on(other, today) then return false; end if;
  if exists (select 1 from bandlog.notifications n where n.user_id = other and n.kind = 'buddy'
              and n.url = '/buddy?from=' || me::text and n.created_at > now() - interval '20 hours') then
    return false;
  end if;
  select coalesce(nullif(p.name, ''), 'Your buddy') into who from bandlog.profiles p where p.id = me;
  insert into bandlog.notifications (user_id, kind, title, body, url)
  values (other, 'buddy', coalesce(who, 'Your buddy') || ' nudged you',
          'Log something today or the ' || b.streak || '-day streak breaks.', '/buddy?from=' || me::text);
  return true;
end $$;
revoke all on function bandlog.buddy_nudge(uuid) from public, anon;
grant execute on function bandlog.buddy_nudge(uuid) to authenticated;
