-- v2.2: avatars + scan thumbnails
insert into storage.buckets (id, name, public) values ('avatars','avatars', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('scan-photos','scan-photos', false) on conflict (id) do nothing;
alter table bandlog.profiles add column if not exists avatar_path text;
drop policy if exists "avatars own write" on storage.objects;
create policy "avatars own write" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update" on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "scan photos own" on storage.objects;
create policy "scan photos own" on storage.objects for all using (bucket_id = 'scan-photos' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'scan-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- Backfill burn rows for workouts saved before v1.8 (MET 5.0 medium band, user's weight or 60 kg).
insert into bandlog.exercise_log (user_id, date, activity_code, name, minutes, intensity, kcal, source, note)
select w.user_id, w.date, 'LI-BAND-' || upper(left(w.band_level,1)), 'Resistance bands', coalesce(w.minutes,30), 'medium',
       round((case w.band_level when 'Light' then 3.5 when 'Heavy' then 6.0 else 5.0 end) * coalesce(p.weight_kg,60) * coalesce(w.minutes,30) / 60.0, 1), 'workout', w.id::text
from bandlog.workouts w left join bandlog.profiles p on p.id = w.user_id
where not exists (select 1 from bandlog.exercise_log e where e.user_id = w.user_id and e.source='workout' and e.note = w.id::text);
select count(*) as burn_rows from bandlog.exercise_log where source='workout';

-- v2.2b: scan thumbnails, OFF image URL column, name-from-email on signup
alter table bandlog.label_scans add column if not exists thumb_path text;
alter table bandlog.label_scans add column if not exists image_url text;
update bandlog.label_scans set image_url = report->>'image_url'
  where image_url is null and coalesce(report->>'image_url','') <> '';

-- "ayaan.khan@x.com" -> "Ayaan": first run of letters in the email local-part, title-cased.
create or replace function bandlog.name_from_email(email text) returns text
language sql immutable as $$
  select nullif(initcap(lower(coalesce(substring(split_part(coalesce(email,''),'@',1) from '[A-Za-z]+'), ''))), '')
$$;

create or replace function bandlog.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'bandlog'
as $function$
begin
  insert into bandlog.profiles (id, name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), bandlog.name_from_email(new.email)))
  on conflict do nothing;
  return new;
end $function$;

-- Existing profiles with no name get the same default.
update bandlog.profiles p set name = bandlog.name_from_email(u.email)
  from auth.users u where u.id = p.id and coalesce(trim(p.name), '') = '';
select json_build_object(
  'names', (select json_agg(coalesce(p.name,'')||' <- '||u.email) from bandlog.profiles p join auth.users u on u.id=p.id),
  'test', bandlog.name_from_email('ayaan.khan@gmail.com'),
  'thumb_cols', (select count(*) from information_schema.columns where table_schema='bandlog' and table_name='label_scans' and column_name in ('thumb_path','image_url')),
  'img_backfilled', (select count(*) from bandlog.label_scans where image_url is not null)
) as result;

-- v2.2c: squad board carries each member's avatar_path (profiles.avatar_path, "<uid>/avatar.jpg?v=<ms>")
drop function if exists bandlog.squad_board(uuid);
create function bandlog.squad_board(g uuid)
 returns table(user_id uuid, name text, share_stats boolean, is_owner boolean, joined_at timestamp with time zone, days jsonb, avatar_path text)
 language plpgsql
 stable security definer
 set search_path to 'bandlog'
as $function$
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
         ), '[]'::jsonb),
         p.avatar_path
  from bandlog.group_members m
  join bandlog.groups gr on gr.id = m.group_id
  left join bandlog.profiles p on p.id = m.user_id
  where m.group_id = g
  order by m.joined_at;
end $function$;
grant execute on function bandlog.squad_board(uuid) to authenticated;
-- The one label saved as "<UNKNOWN>" before v2.2's name fallback.
update bandlog.label_scans set product = 'Unnamed label', report = jsonb_set(report, '{product}', '"Unnamed label"')
  where product in ('<UNKNOWN>', 'UNKNOWN', 'unknown');
