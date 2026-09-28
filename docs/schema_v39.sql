-- v2.15 (schema_v39): buddies that actually pair. Squadmates can send each other a buddy request
-- in one tap (a notification that opens the accept screen), instead of hunting for the 6-letter code.
-- Needs schema_v37 (buddies, buddy_invites, buddy_invite(), the 'buddy' notification kind).
-- Additive and idempotent: two new RPCs and two replaced v37 RPCs (same signatures). Safe to re-run.
-- Undo with docs/revert_v39.sql.
--
-- NOT APPLIED YET. Both v2.15 clients tolerate this file being missing: the "Your squadmates" list
-- and the Home "Buddy up with …?" button hide, and the buddy page works as in v2.14.
--
-- Why buddy_accept / buddy_invite_info are replaced: a request reuses the sender's open invite code
-- (like buddy_invite()), so two squadmates can hold the same code. In v37 a code is single-use, so
-- the second person to accept would get "That code was already used". Now a used code still works
-- for someone the owner personally sent it to (a buddy notification with that code's url).

-- ---------------------------------------------------------------------------------------------
-- 1. Squadmates who aren't my buddy yet (for "Your squadmates" and Home's "Buddy up with …?").
--    squads = the squads we share, comma-separated, by name.
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.buddy_candidates()
returns table (user_id uuid, name text, avatar_path text, squads text)
language sql stable security definer set search_path = bandlog as $$
  select o.user_id,
         coalesce(nullif(p.name, ''), nullif(max(o.display_name), ''), 'Squadmate'),
         p.avatar_path,
         string_agg(distinct g.name, ', ' order by g.name)
    from bandlog.group_members m
    join bandlog.group_members o on o.group_id = m.group_id and o.user_id <> m.user_id
    join bandlog.groups g on g.id = m.group_id
    left join bandlog.profiles p on p.id = o.user_id
   where m.user_id = auth.uid()
     and not exists (
       select 1 from bandlog.buddies x
        where least(x.user_a, x.user_b) = least(m.user_id, o.user_id)
          and greatest(x.user_a, x.user_b) = greatest(m.user_id, o.user_id))
   group by o.user_id, p.name, p.avatar_path
   order by 2;
$$;
revoke all on function bandlog.buddy_candidates() from public, anon;
grant execute on function bandlog.buddy_candidates() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Send a squadmate a buddy request. Returns my invite code (the request's link is /buddy/<code>),
--    or null when we're already buddies. At most one request per pair per 24 h: a repeat inside
--    that window returns the code without notifying again.
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.buddy_request(other uuid) returns text
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  c text;
  who text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if other is null or other = me then raise exception 'Pick someone else'; end if;
  if not exists (
    select 1 from bandlog.group_members a
      join bandlog.group_members b on b.group_id = a.group_id
     where a.user_id = me and b.user_id = other) then
    raise exception 'You can only invite squadmates here. Share a link instead.';
  end if;
  if exists (
    select 1 from bandlog.buddies x
     where least(x.user_a, x.user_b) = least(me, other)
       and greatest(x.user_a, x.user_b) = greatest(me, other)) then
    return null;
  end if;
  -- Same logic as buddy_invite(): my open code (reused for 30 days), created if needed.
  c := bandlog.buddy_invite();
  -- Rate limit: any buddy request from me (any of my codes) to them in the last 24 h.
  if exists (
    select 1 from bandlog.notifications n
     where n.user_id = other and n.kind = 'buddy'
       and n.created_at > now() - interval '24 hours'
       and n.url in (select '/buddy/' || i.code from bandlog.buddy_invites i where i.user_id = me)) then
    return c;
  end if;
  select coalesce(nullif(p.name, ''), 'Your squadmate') into who from bandlog.profiles p where p.id = me;
  insert into bandlog.notifications (user_id, kind, title, body, url)
  values (other, 'buddy', coalesce(who, 'Your squadmate') || ' wants to be your buddy',
          'Tap to start a shared streak.', '/buddy/' || c);
  return c;
end $$;
revoke all on function bandlog.buddy_request(uuid) from public, anon;
grant execute on function bandlog.buddy_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. v37's buddy_invite_info / buddy_accept, now also honouring a used code for anyone the owner
--    sent it to as a request. Everything else is unchanged.
-- ---------------------------------------------------------------------------------------------
create or replace function bandlog.buddy_invite_info(invite text)
returns table (name text, avatar_path text)
language sql stable security definer set search_path = bandlog as $$
  select coalesce(nullif(p.name, ''), 'Your buddy'), p.avatar_path
    from bandlog.buddy_invites i join bandlog.profiles p on p.id = i.user_id
   where i.code = upper(trim(invite))
     and (i.used_by is null
          or exists (select 1 from bandlog.notifications n
                      where n.user_id = auth.uid() and n.kind = 'buddy' and n.url = '/buddy/' || i.code));
$$;
revoke all on function bandlog.buddy_invite_info(text) from public, anon;
grant execute on function bandlog.buddy_invite_info(text) to authenticated;

create or replace function bandlog.buddy_accept(invite text) returns uuid
language plpgsql security definer set search_path = bandlog as $$
declare
  me uuid := auth.uid();
  inv bandlog.buddy_invites%rowtype;
  bid uuid;
  who text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into inv from bandlog.buddy_invites i where i.code = upper(trim(invite)) for update;
  if not found then raise exception 'That code doesn''t exist'; end if;
  if inv.user_id = me then raise exception 'That''s your own code'; end if;
  if inv.used_by is not null and inv.used_by <> me
     and not exists (select 1 from bandlog.notifications n
                      where n.user_id = me and n.kind = 'buddy' and n.url = '/buddy/' || inv.code) then
    raise exception 'That code was already used';
  end if;
  select x.id into bid from bandlog.buddies x
   where least(x.user_a, x.user_b) = least(me, inv.user_id) and greatest(x.user_a, x.user_b) = greatest(me, inv.user_id);
  if bid is null then
    insert into bandlog.buddies (user_a, user_b) values (inv.user_id, me) returning id into bid;
    select coalesce(nullif(p.name, ''), 'Your buddy') into who from bandlog.profiles p where p.id = me;
    insert into bandlog.notifications (user_id, kind, title, body, url)
    values (inv.user_id, 'buddy', coalesce(who, 'Your buddy') || ' is your buddy now',
            'Both log today to start your streak.', '/buddy');
  end if;
  update bandlog.buddy_invites i set used_by = me, used_at = now() where i.code = inv.code and i.used_by is null;
  return bid;
end $$;
revoke all on function bandlog.buddy_accept(text) from public, anon;
grant execute on function bandlog.buddy_accept(text) to authenticated;

notify pgrst, 'reload schema';
