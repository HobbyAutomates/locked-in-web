-- REVERT for schema_v31 (v2.9 social: delete triggers + sharing controls). Run only to roll the
-- database back to v2.8. Roll back the apps first; v2.8 clients never read auto_share / auto_post.
-- Restores bandlog.post_to_my_groups to its schema_v26.sql body exactly.
-- Dropping the columns loses each user's sharing choices (everyone goes back to "post everything").

begin;

drop trigger if exists meals_delete_posts on bandlog.meals;
drop trigger if exists workouts_delete_posts on bandlog.workouts;
drop trigger if exists exercise_log_delete_posts on bandlog.exercise_log;
drop function if exists bandlog.delete_log_posts();
drop index if exists bandlog.group_posts_user_ref_idx;

-- Auto-post one row to every squad the caller is in (meal / workout / pr / photo). Re-posting the same
-- ref_id updates the body. Skipped when the caller shares "streaks only". Returns rows written.
create or replace function bandlog.post_to_my_groups(p_kind text, p_body text, p_ref uuid default null, p_photo text default null) returns int
language plpgsql security definer set search_path = bandlog as $$
declare
  c int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_kind not in ('meal', 'workout', 'pr', 'photo') then raise exception 'Unknown post kind'; end if;
  if exists (select 1 from bandlog.profiles p where p.id = auth.uid() and p.share_stats = false) then return 0; end if;
  insert into bandlog.group_posts (group_id, user_id, kind, body, ref_id, photo_path)
  select m.group_id, auth.uid(), p_kind, left(coalesce(p_body, ''), 1000), p_ref, p_photo
  from bandlog.group_members m where m.user_id = auth.uid()
  on conflict (group_id, user_id, kind, ref_id) where ref_id is not null
  do update set body = excluded.body, photo_path = coalesce(excluded.photo_path, bandlog.group_posts.photo_path);
  get diagnostics c = row_count;
  return c;
end $$;
grant execute on function bandlog.post_to_my_groups(text, text, uuid, text) to authenticated;

alter table bandlog.profiles drop constraint if exists profiles_auto_share_check;
alter table bandlog.profiles drop column if exists auto_share;
alter table bandlog.group_members drop column if exists auto_post;
notify pgrst, 'reload schema';

commit;
