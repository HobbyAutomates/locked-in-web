-- v2.0b: Squad RPCs (create / board / leave / nudges inbox) + the Restaurant preset row.
-- Builds on schema_v20.sql (groups, group_members, daily_stats, nudges, join_group, is_member).

-- The name a squad-mate goes by: profile name, else the name they joined with, else their email's local part.
create or replace function bandlog.member_name(u uuid, fallback text) returns text
language sql stable security definer set search_path = bandlog, auth as $$
  select coalesce(
    nullif(trim((select p.name from bandlog.profiles p where p.id = u)), ''),
    nullif(trim(fallback), ''),
    (select split_part(x.email, '@', 1) from auth.users x where x.id = u),
    'Member');
$$;
revoke all on function bandlog.member_name(uuid, text) from public, anon, authenticated;

-- Create a squad: a fresh 6-char code (no 0/O/1/I), the caller as owner AND first member.
create or replace function bandlog.create_group(p_name text, p_display text default '')
returns table (id uuid, code text)
language plpgsql security definer set search_path = bandlog as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  gid uuid;
  tries int := 0;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the squad a name'; end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into bandlog.groups (name, code, owner_id) values (left(trim(p_name), 40), c, auth.uid()) returning groups.id into gid;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 20 then raise exception 'Could not generate a code, try again'; end if;
    end;
  end loop;
  insert into bandlog.group_members (group_id, user_id, display_name) values (gid, auth.uid(), coalesce(p_display, ''));
  return query select gid, c;
end $$;
grant execute on function bandlog.create_group(text, text) to authenticated;

-- The squad board: every member with their name, share preference and last 7 days of rollups.
-- Protein / calories / burned / meals are nulled for members who share streaks only.
create or replace function bandlog.squad_board(g uuid)
returns table (user_id uuid, name text, share_stats boolean, is_owner boolean, joined_at timestamptz, days jsonb)
language plpgsql stable security definer set search_path = bandlog as $$
declare
  t date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not bandlog.is_member(g) then raise exception 'Not a member of this squad'; end if;
  return query
  select m.user_id,
         bandlog.member_name(m.user_id, m.display_name),
         coalesce(p.share_stats, true),
         (gr.owner_id = m.user_id),
         m.joined_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'date', s.date,
                    'trained', s.trained,
                    'week_streak', s.week_streak,
                    'protein_g', case when coalesce(p.share_stats, true) then s.protein_g end,
                    'calories', case when coalesce(p.share_stats, true) then s.calories end,
                    'burned', case when coalesce(p.share_stats, true) then s.burned end,
                    'meals', case when coalesce(p.share_stats, true) then s.meals end,
                    'updated_at', s.updated_at
                  ) order by s.date)
           from bandlog.daily_stats s
           where s.user_id = m.user_id and s.date between t - 6 and t
         ), '[]'::jsonb)
  from bandlog.group_members m
  join bandlog.groups gr on gr.id = m.group_id
  left join bandlog.profiles p on p.id = m.user_id
  where m.group_id = g
  order by m.joined_at;
end $$;
grant execute on function bandlog.squad_board(uuid) to authenticated;

-- Leave a squad. The last one out deletes it; an owner leaving hands it to the longest-standing member.
create or replace function bandlog.leave_group(g uuid) returns void
language plpgsql security definer set search_path = bandlog as $$
declare
  next_owner uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from bandlog.group_members where group_id = g and user_id = auth.uid();
  select m.user_id into next_owner from bandlog.group_members m where m.group_id = g order by m.joined_at limit 1;
  if next_owner is null then
    delete from bandlog.groups where id = g;
  elsif exists (select 1 from bandlog.groups where id = g and owner_id = auth.uid()) then
    update bandlog.groups set owner_id = next_owner where id = g;
  end if;
end $$;
grant execute on function bandlog.leave_group(uuid) to authenticated;

-- Nudges sent to the caller in the last 24 h, with who sent them and from which squad.
create or replace function bandlog.my_nudges()
returns table (id uuid, group_id uuid, group_name text, from_user uuid, from_name text, kind text, created_at timestamptz)
language sql stable security definer set search_path = bandlog as $$
  select n.id, n.group_id, g.name, n.from_user,
         bandlog.member_name(n.from_user, (select m.display_name from bandlog.group_members m where m.group_id = n.group_id and m.user_id = n.from_user)),
         n.kind, n.created_at
  from bandlog.nudges n
  join bandlog.groups g on g.id = n.group_id
  where n.to_user = auth.uid() and n.created_at > now() - interval '24 hours'
  order by n.created_at desc;
$$;
grant execute on function bandlog.my_nudges() to authenticated;

create index if not exists nudges_to_user_idx on bandlog.nudges (to_user, created_at desc);
create index if not exists group_members_user_idx on bandlog.group_members (user_id);

-- Restaurant row: common outside dishes mapped onto trustworthy existing foods rows.
-- (No shawarma or chole bhature: there is no food row we trust for them yet.)
insert into bandlog.food_presets (id, food_id, label, label_hi, category, servings, default_serving, sort, icon) values
  ('r-biryani', 'biryani-chicken', 'Chicken biryani', null, 'restaurant', '[{"label":"1 plate","grams":300},{"label":"1 katori","grams":150}]', '1 plate', 10, null),
  ('r-butter-chicken', 'dish-butter-chicken', 'Butter chicken', null, 'restaurant', '[{"label":"1 katori","grams":150},{"label":"1 serving","grams":275}]', '1 katori', 20, null),
  ('r-paneer-butter-masala', 'dish-paneer-in-butter-sauce', 'Paneer butter masala', null, 'restaurant', '[{"label":"1 katori","grams":150},{"label":"1 bowl","grams":250}]', '1 katori', 30, null),
  ('r-masala-dosa', 'dish-masala-dosa', 'Masala dosa', null, 'restaurant', '[{"label":"1 masala dosa","grams":210}]', '1 masala dosa', 40, null),
  ('r-pav-bhaji', 'dish-pav-bhaji', 'Pav bhaji (bhaji)', null, 'restaurant', '[{"label":"1 plate bhaji","grams":200},{"label":"1 katori","grams":150}]', '1 plate bhaji', 50, null),
  ('r-momos', 'momos', 'Momos', null, 'restaurant', '[{"label":"6 momos","grams":210},{"label":"10 momos","grams":350}]', '6 momos', 60, null),
  ('r-pizza', 'pizza', 'Pizza slice', null, 'restaurant', '[{"label":"1 slice","grams":100},{"label":"2 slices","grams":200},{"label":"4 slices","grams":400}]', '1 slice', 70, null),
  ('r-burger', 'burger', 'Burger', null, 'restaurant', '[{"label":"1 burger","grams":200}]', '1 burger', 80, null),
  ('r-fries', 'fries', 'French fries', null, 'restaurant', '[{"label":"1 regular","grams":120},{"label":"1 large","grams":160}]', '1 regular', 90, null)
on conflict (id) do update set food_id = excluded.food_id, label = excluded.label, category = excluded.category,
  servings = excluded.servings, default_serving = excluded.default_serving, sort = excluded.sort;

select 'ok' as v20b;
