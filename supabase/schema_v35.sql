-- v2.11 "social" (schema_v35): reactions on squad posts + chat read receipts + unread counts.
-- Idempotent: safe to re-run.
--
-- NOT applied to any database by the agent that wrote this file. Review it and run it manually.
-- Undo with supabase/revert_v35.sql.
--
-- Builds on schema_v20.sql (groups, group_members.joined_at, is_member), schema_v20b.sql
-- (member_name) and schema_v26.sql (group_posts, group_feed). Both v2.11 clients tolerate this
-- file not being applied yet: reaction chips, "Seen by" and unread badges simply don't show, and
-- reacting says the server needs the update.
--
-- Design notes
--   * One reaction per person per post (primary key (post_id, user_id)), WhatsApp-style. Picking
--     another emoji replaces yours (upsert), picking the same one again removes it (delete).
--   * The per-post summary rides on group_feed as two appended columns (reactions jsonb,
--     my_reaction text) instead of a companion RPC: both clients already call group_feed on every
--     Chat/Feed poll, so this costs zero extra round trips, and a server without v35 just returns
--     rows without the two keys (clients read that as "no reactions"). Per row it's two lookups on
--     the post_reactions primary key, for at most 100 rows.
--   * Read receipts are one row per (squad, member): last_read_at. "Seen by" for a message is
--     computed from those rows against the message's created_at; there is no per-message table.

-- ---------------------------------------------------------------------------------------------
-- 1. Reactions
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.post_reactions (
  post_id uuid not null references bandlog.group_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table bandlog.post_reactions drop constraint if exists post_reactions_emoji_check;
alter table bandlog.post_reactions add constraint post_reactions_emoji_check
  check (emoji in ('❤️', '🔥', '👍', '😂', '😮', '💪'));
create index if not exists post_reactions_user_idx on bandlog.post_reactions (user_id);

-- Is post p in a squad the caller belongs to? security definer so the policies below don't pay
-- for group_posts' own RLS on every row.
create or replace function bandlog.post_in_my_squads(p uuid) returns boolean
language sql stable security definer set search_path = bandlog as $$
  select exists (select 1 from bandlog.group_posts gp where gp.id = p and bandlog.is_member(gp.group_id));
$$;
revoke all on function bandlog.post_in_my_squads(uuid) from public, anon;
grant execute on function bandlog.post_in_my_squads(uuid) to authenticated;

alter table bandlog.post_reactions enable row level security;
drop policy if exists "reactions members read" on bandlog.post_reactions;
create policy "reactions members read" on bandlog.post_reactions for select
  using (bandlog.post_in_my_squads(post_id));
drop policy if exists "reactions own insert" on bandlog.post_reactions;
create policy "reactions own insert" on bandlog.post_reactions for insert
  with check (user_id = auth.uid() and bandlog.post_in_my_squads(post_id));
drop policy if exists "reactions own update" on bandlog.post_reactions;
create policy "reactions own update" on bandlog.post_reactions for update
  using (user_id = auth.uid() and bandlog.post_in_my_squads(post_id))
  with check (user_id = auth.uid() and bandlog.post_in_my_squads(post_id));
drop policy if exists "reactions own delete" on bandlog.post_reactions;
create policy "reactions own delete" on bandlog.post_reactions for delete
  using (user_id = auth.uid() and bandlog.post_in_my_squads(post_id));

-- Who reacted to one post, with what (the "tap the chips" sheet). Members only.
create or replace function bandlog.post_reactors(p uuid)
returns table (user_id uuid, name text, username text, avatar_path text, emoji text, created_at timestamptz)
language plpgsql stable security definer set search_path = bandlog as $$
declare
  gid uuid;
begin
  select gp.group_id into gid from bandlog.group_posts gp where gp.id = p;
  if gid is null or not bandlog.is_member(gid) then raise exception 'Not a member of this squad'; end if;
  return query
  select r.user_id,
         bandlog.member_name(r.user_id, (select m.display_name from bandlog.group_members m where m.group_id = gid and m.user_id = r.user_id)),
         pr.username, pr.avatar_path, r.emoji, r.created_at
  from bandlog.post_reactions r
  left join bandlog.profiles pr on pr.id = r.user_id
  where r.post_id = p
  order by r.created_at;
end $$;
grant execute on function bandlog.post_reactors(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. group_feed: same arguments, grant and first 11 columns as v26; two columns appended:
--      reactions    jsonb  {"❤️": 3, "🔥": 2} ({} when none)
--      my_reaction  text   the caller's emoji on the post, or null
--    The return type changes, so it has to be dropped and recreated (not "create or replace").
-- ---------------------------------------------------------------------------------------------
drop function if exists bandlog.group_feed(uuid, timestamptz, int, text[]);
create function bandlog.group_feed(g uuid, before timestamptz default null, n int default 30, kinds text[] default null)
returns table (id uuid, group_id uuid, user_id uuid, kind text, body text, ref_id uuid, photo_path text, created_at timestamptz, author_name text, author_username text, author_avatar_path text, reactions jsonb, my_reaction text)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  select p.id, p.group_id, p.user_id, p.kind, p.body, p.ref_id, p.photo_path, p.created_at,
         bandlog.member_name(p.user_id, (select m.display_name from bandlog.group_members m where m.group_id = p.group_id and m.user_id = p.user_id)),
         pr.username, pr.avatar_path,
         coalesce((select jsonb_object_agg(x.emoji, x.c) from (
                     select r.emoji, count(*) as c from bandlog.post_reactions r where r.post_id = p.id group by r.emoji
                   ) x), '{}'::jsonb),
         (select r.emoji from bandlog.post_reactions r where r.post_id = p.id and r.user_id = auth.uid())
  from bandlog.group_posts p
  left join bandlog.profiles pr on pr.id = p.user_id
  where p.group_id = g
    and p.created_at < coalesce(before, now() + interval '1 minute')
    and (kinds is null or p.kind = any (kinds))
  order by p.created_at desc
  limit greatest(1, least(coalesce(n, 30), 100));
end $$;
grant execute on function bandlog.group_feed(uuid, timestamptz, int, text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Read receipts: how far each member has read a squad's Chat.
-- ---------------------------------------------------------------------------------------------
create table if not exists bandlog.group_reads (
  group_id uuid not null references bandlog.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table bandlog.group_reads enable row level security;
drop policy if exists "reads members read" on bandlog.group_reads;
create policy "reads members read" on bandlog.group_reads for select using (bandlog.is_member(group_id));
drop policy if exists "reads own insert" on bandlog.group_reads;
create policy "reads own insert" on bandlog.group_reads for insert with check (user_id = auth.uid() and bandlog.is_member(group_id));
drop policy if exists "reads own update" on bandlog.group_reads;
create policy "reads own update" on bandlog.group_reads for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and bandlog.is_member(group_id));
drop policy if exists "reads own delete" on bandlog.group_reads;
create policy "reads own delete" on bandlog.group_reads for delete using (user_id = auth.uid());

-- Existing members start "read up to now", so nobody opens v2.11 to a badge counting every
-- message ever sent. Members who join later fall back to joined_at until they open Chat.
insert into bandlog.group_reads (group_id, user_id, last_read_at)
select m.group_id, m.user_id, now() from bandlog.group_members m
on conflict (group_id, user_id) do nothing;

-- I've read squad g's Chat up to now. Never moves backwards. Returns the stored time.
create or replace function bandlog.mark_read(g uuid) returns timestamptz
language plpgsql security definer set search_path = bandlog as $$
declare
  t timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  insert into bandlog.group_reads (group_id, user_id, last_read_at) values (g, auth.uid(), now())
  on conflict (group_id, user_id) do update set last_read_at = greatest(bandlog.group_reads.last_read_at, excluded.last_read_at)
  returning last_read_at into t;
  return t;
end $$;
revoke all on function bandlog.mark_read(uuid) from public, anon;
grant execute on function bandlog.mark_read(uuid) to authenticated;

-- Every member of g with their name, avatar and last_read_at (null = hasn't opened Chat since v35).
-- The clients compute "Seen by" for a message from this; members only.
create or replace function bandlog.group_read_status(g uuid)
returns table (user_id uuid, name text, username text, avatar_path text, last_read_at timestamptz)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  select m.user_id, bandlog.member_name(m.user_id, m.display_name), pr.username, pr.avatar_path, r.last_read_at
  from bandlog.group_members m
  left join bandlog.profiles pr on pr.id = m.user_id
  left join bandlog.group_reads r on r.group_id = m.group_id and r.user_id = m.user_id
  where m.group_id = g
  order by m.joined_at;
end $$;
grant execute on function bandlog.group_read_status(uuid) to authenticated;

-- Unread Chat posts (message + photo, the Chat tab's kinds) from other people, per squad I'm in,
-- since my last_read_at (or since I joined). Squads with nothing unread are left out.
create or replace function bandlog.my_unread_counts()
returns table (group_id uuid, unread int)
language sql stable security definer set search_path = bandlog as $$
  select m.group_id, count(p.id)::int
  from bandlog.group_members m
  left join bandlog.group_reads r on r.group_id = m.group_id and r.user_id = m.user_id
  join bandlog.group_posts p on p.group_id = m.group_id
   and p.user_id <> m.user_id
   and p.kind in ('message', 'photo')
   and p.created_at > coalesce(r.last_read_at, m.joined_at, '-infinity'::timestamptz)
  where m.user_id = auth.uid()
  group by m.group_id;
$$;
grant execute on function bandlog.my_unread_counts() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Grants + reload
-- ---------------------------------------------------------------------------------------------
grant all on bandlog.post_reactions, bandlog.group_reads to authenticated, service_role;
notify pgrst, 'reload schema';

select json_build_object(
  'tables', (select json_agg(table_name order by table_name) from information_schema.tables where table_schema = 'bandlog' and table_name in ('post_reactions', 'group_reads')),
  'rls', (select json_agg(relname || '=' || relrowsecurity order by relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'bandlog' and relname in ('post_reactions', 'group_reads')),
  'policies', (select json_agg(tablename || ': ' || policyname order by tablename, policyname) from pg_policies where schemaname = 'bandlog' and tablename in ('post_reactions', 'group_reads')),
  'group_feed', (select pg_get_function_result(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'bandlog' and proname = 'group_feed'),
  'functions', (select json_agg(proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'bandlog' and proname in ('post_in_my_squads', 'post_reactors', 'mark_read', 'group_read_status', 'my_unread_counts')),
  'reads_seeded', (select count(*) from bandlog.group_reads)
) as result;
