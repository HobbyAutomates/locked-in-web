-- Undo docs/schema_v39.sql (v2.15 buddy requests). Drops buddy_request / buddy_candidates, puts
-- buddy_invite_info / buddy_accept back to their v37 bodies, and clears unanswered request
-- notifications (their links would open a code that may already be used).
drop function if exists bandlog.buddy_request(uuid);
drop function if exists bandlog.buddy_candidates();
delete from bandlog.notifications where kind = 'buddy' and title like '% wants to be your buddy' and read_at is null;

-- v37 versions (copied from docs/schema_v37.sql):
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

notify pgrst, 'reload schema';
