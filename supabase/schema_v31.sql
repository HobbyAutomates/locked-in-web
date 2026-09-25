-- v2.9 "social": deleting a log deletes its squad posts, and sharing controls. Idempotent: safe to re-run.
--
-- NOT applied to any database by the agent that wrote this file. Review it and run it manually.
-- Undo with supabase/revert_v31.sql.
--
-- Builds on schema_v26.sql (group_posts, post_to_my_groups), schema_v27.sql / schema_v29.sql
-- (challenge + battle posts) and schema_v30.sql (meals.meal_type). The v2.9 clients tolerate
-- this file not being applied yet: they fall back to the v2.8 behaviour (everything auto-posts
-- to every squad unless share_stats is off).

-- ---------------------------------------------------------------------------------------------
-- 1. Deleting a meal / workout / exercise deletes every squad post that points at it
--    (kind meal, workout, pr or a battle snap, since those all carry ref_id = the log's id).
--    security definer, so it runs however the delete arrives (app, SQL editor, cascade from
--    auth.users). The storage copy of a meal photo in group-photos is left in place: direct
--    deletes from storage.objects aren't supported, so that needs the Storage API.
-- ---------------------------------------------------------------------------------------------
create index if not exists group_posts_user_ref_idx on bandlog.group_posts (user_id, ref_id) where ref_id is not null;

create or replace function bandlog.delete_log_posts() returns trigger
language plpgsql security definer set search_path = bandlog as $$
begin
  delete from bandlog.group_posts p where p.user_id = old.user_id and p.ref_id = old.id;
  return old;
end $$;
revoke all on function bandlog.delete_log_posts() from public;

drop trigger if exists meals_delete_posts on bandlog.meals;
create trigger meals_delete_posts after delete on bandlog.meals
  for each row execute function bandlog.delete_log_posts();

drop trigger if exists workouts_delete_posts on bandlog.workouts;
create trigger workouts_delete_posts after delete on bandlog.workouts
  for each row execute function bandlog.delete_log_posts();

drop trigger if exists exercise_log_delete_posts on bandlog.exercise_log;
create trigger exercise_log_delete_posts after delete on bandlog.exercise_log
  for each row execute function bandlog.delete_log_posts();

-- ---------------------------------------------------------------------------------------------
-- 2. Sharing controls
--    profiles.auto_share: which kinds auto-post (Profile → Privacy → Squad sharing).
--    group_members.auto_post: per-squad mute ("Auto-post my logs here" on the squad's info page).
-- ---------------------------------------------------------------------------------------------
alter table bandlog.profiles add column if not exists auto_share text[] not null default '{meal,workout,pr}';
alter table bandlog.profiles drop constraint if exists profiles_auto_share_check;
alter table bandlog.profiles add constraint profiles_auto_share_check check (auto_share <@ array['meal', 'workout', 'pr']::text[]);

alter table bandlog.group_members add column if not exists auto_post boolean not null default true;

-- ---------------------------------------------------------------------------------------------
-- 3. post_to_my_groups: same signature, return value and grant as v26. Now:
--    - meal / workout / pr post only when that kind is in profiles.auto_share (no profile row
--      means the default: all three). 'photo' is an explicit share, so auto_share doesn't gate it.
--    - rows go only to squads where group_members.auto_post is on.
--    - share_stats = false still means nothing posts, as before.
--    An edit re-posting the same ref_id still upserts the body in those squads.
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.post_to_my_groups(p_kind text, p_body text, p_ref uuid default null, p_photo text default null) returns int
language plpgsql security definer set search_path = bandlog as $$
declare
  c int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_kind not in ('meal', 'workout', 'pr', 'photo') then raise exception 'Unknown post kind'; end if;
  if exists (select 1 from bandlog.profiles p where p.id = auth.uid() and p.share_stats = false) then return 0; end if;
  if p_kind <> 'photo' and exists (select 1 from bandlog.profiles p where p.id = auth.uid() and not (p_kind = any (p.auto_share))) then return 0; end if;
  insert into bandlog.group_posts (group_id, user_id, kind, body, ref_id, photo_path)
  select m.group_id, auth.uid(), p_kind, left(coalesce(p_body, ''), 1000), p_ref, p_photo
  from bandlog.group_members m where m.user_id = auth.uid() and m.auto_post
  on conflict (group_id, user_id, kind, ref_id) where ref_id is not null
  do update set body = excluded.body, photo_path = coalesce(excluded.photo_path, bandlog.group_posts.photo_path);
  get diagnostics c = row_count;
  return c;
end $$;
grant execute on function bandlog.post_to_my_groups(text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Authors can edit their own posts (body/photo). Without this, the Food Battle snap enrichment
-- (postBattleSnap on web, BattleRepo on Android) silently updated nothing under RLS.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "posts author update" on bandlog.group_posts;
create policy "posts author update" on bandlog.group_posts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and bandlog.is_member(group_id));

-- ---------------------------------------------------------------------------------------------
-- Grants + reload
-- ---------------------------------------------------------------------------------------------
grant all on all tables in schema bandlog to anon, authenticated, service_role;
notify pgrst, 'reload schema';

select json_build_object(
  'profile_cols', (select json_agg(column_name || ' ' || data_type || ' default ' || coalesce(column_default, 'null')) from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name = 'auto_share'),
  'member_cols', (select json_agg(column_name || ' ' || data_type || ' default ' || coalesce(column_default, 'null')) from information_schema.columns where table_schema = 'bandlog' and table_name = 'group_members' and column_name = 'auto_post'),
  'triggers', (select json_agg(tgrelid::regclass::text || '.' || tgname order by tgname) from pg_trigger where tgname in ('meals_delete_posts', 'workouts_delete_posts', 'exercise_log_delete_posts') and not tgisinternal),
  'post_fn_gates', (select prosrc ilike '%auto_share%' and prosrc ilike '%m.auto_post%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'bandlog' and proname = 'post_to_my_groups'),
  'post_fn_definer', (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'bandlog' and proname = 'post_to_my_groups'),
  'orphan_posts', (select count(*) from bandlog.group_posts gp where gp.kind in ('meal', 'workout', 'pr') and gp.ref_id is not null
                     and not exists (select 1 from bandlog.meals x where x.id = gp.ref_id)
                     and not exists (select 1 from bandlog.workouts x where x.id = gp.ref_id)
                     and not exists (select 1 from bandlog.exercise_log x where x.id = gp.ref_id))
) as result;
