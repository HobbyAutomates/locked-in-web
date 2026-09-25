-- REVERT for schema_v35 (reactions, read receipts, unread counts). Run only to roll back.
-- Deletes every reaction and read marker. Safe with any client: v2.11 hides reaction chips,
-- "Seen by" and unread badges when these are missing, and older clients never used them.

drop function if exists bandlog.my_unread_counts();
drop function if exists bandlog.group_read_status(uuid);
drop function if exists bandlog.mark_read(uuid);
drop table if exists bandlog.group_reads;

drop function if exists bandlog.post_reactors(uuid);

-- group_feed back to its v26 shape (the two appended columns go).
drop function if exists bandlog.group_feed(uuid, timestamptz, int, text[]);
create function bandlog.group_feed(g uuid, before timestamptz default null, n int default 30, kinds text[] default null)
returns table (id uuid, group_id uuid, user_id uuid, kind text, body text, ref_id uuid, photo_path text, created_at timestamptz, author_name text, author_username text, author_avatar_path text)
language plpgsql stable security definer set search_path = bandlog as $$
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  select p.id, p.group_id, p.user_id, p.kind, p.body, p.ref_id, p.photo_path, p.created_at,
         bandlog.member_name(p.user_id, (select m.display_name from bandlog.group_members m where m.group_id = p.group_id and m.user_id = p.user_id)),
         pr.username, pr.avatar_path
  from bandlog.group_posts p
  left join bandlog.profiles pr on pr.id = p.user_id
  where p.group_id = g
    and p.created_at < coalesce(before, now() + interval '1 minute')
    and (kinds is null or p.kind = any (kinds))
  order by p.created_at desc
  limit greatest(1, least(coalesce(n, 30), 100));
end $$;
grant execute on function bandlog.group_feed(uuid, timestamptz, int, text[]) to authenticated;

drop table if exists bandlog.post_reactions;
drop function if exists bandlog.post_in_my_squads(uuid);

notify pgrst, 'reload schema';
