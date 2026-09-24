-- v2.3: water log, richer exercise rows, micronutrient + preference targets, progress photos, public squads.
-- Idempotent: safe to re-run.

-- Water
create table if not exists bandlog.water_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  ml int not null check (ml > 0),
  created_at timestamptz default now()
);
alter table bandlog.water_log enable row level security;
drop policy if exists "water own" on bandlog.water_log;
create policy "water own" on bandlog.water_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists water_log_user_date_idx on bandlog.water_log (user_id, date);
grant all on bandlog.water_log to authenticated, service_role;

-- Google-Fit-style exercise details
alter table bandlog.exercise_log
  add column if not exists started_at timestamptz,
  add column if not exists intensity_pct int,
  add column if not exists distance_km numeric,
  add column if not exists steps int;

-- Micronutrient goals + calorie preferences + water goal
alter table bandlog.profiles
  add column if not exists fiber_target int,
  add column if not exists sugar_target int,
  add column if not exists add_burned_to_goal boolean default false,
  add column if not exists rollover_calories boolean default false,
  add column if not exists water_goal_ml int default 2500;

alter table bandlog.weight_log add column if not exists photo_path text;

-- Progress photos
create table if not exists bandlog.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  path text not null,
  note text,
  created_at timestamptz default now()
);
alter table bandlog.progress_photos enable row level security;
drop policy if exists "progress photos own" on bandlog.progress_photos;
create policy "progress photos own" on bandlog.progress_photos for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists progress_photos_user_date_idx on bandlog.progress_photos (user_id, date);
grant all on bandlog.progress_photos to authenticated, service_role;

insert into storage.buckets (id, name, public) values ('progress-photos','progress-photos', false) on conflict (id) do nothing;
drop policy if exists "progress photos storage own" on storage.objects;
create policy "progress photos storage own" on storage.objects for all
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Public squads
alter table bandlog.groups
  add column if not exists is_public boolean default false,
  add column if not exists cover_url text,
  add column if not exists tagline text;

do $$
declare
  owner uuid;
  s record;
  gid uuid;
begin
  select id into owner from auth.users where email = 'sohumachhabria@gmail.com' limit 1;
  if owner is null then raise notice 'Owner not found; skipping public squad seed'; return; end if;
  for s in select * from (values
    ('Locked In Bengaluru', 'Everyone testing the app, one board', 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400', 'LIBLRU'),
    ('Cutting Season', 'Deficit, protein up, receipts daily', 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400', 'CUTSZN'),
    ('Bulk Szn', 'Eat in a surplus and build together', 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400', 'BULKSZ'),
    ('10k Steps Club', 'Walk it out, every day', 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=400', 'STEPSK')
  ) as t(name, tagline, cover, code) loop
    gid := null;
    select g.id into gid from bandlog.groups g where g.name = s.name limit 1;
    if gid is null then
      insert into bandlog.groups (name, code, owner_id, is_public, cover_url, tagline)
      values (s.name, s.code, owner, true, s.cover, s.tagline) returning id into gid;
    else
      update bandlog.groups g set is_public = true,
        cover_url = coalesce(g.cover_url, s.cover), tagline = coalesce(g.tagline, s.tagline)
      where g.id = gid;
    end if;
    insert into bandlog.group_members (group_id, user_id) values (gid, owner) on conflict (group_id, user_id) do nothing;
  end loop;
end $$;

create or replace function bandlog.public_groups()
 returns table(id uuid, name text, tagline text, cover_url text, member_count bigint, joined boolean)
 language sql stable security definer
 set search_path to 'bandlog'
as $$
  select g.id, g.name, g.tagline, g.cover_url,
         (select count(*) from bandlog.group_members m where m.group_id = g.id),
         exists (select 1 from bandlog.group_members m where m.group_id = g.id and m.user_id = auth.uid())
  from bandlog.groups g
  where coalesce(g.is_public, false)
  order by g.created_at;
$$;
grant execute on function bandlog.public_groups() to authenticated;

create or replace function bandlog.join_public_group(g uuid)
 returns void
 language plpgsql security definer
 set search_path to 'bandlog'
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from bandlog.groups gr where gr.id = g and coalesce(gr.is_public, false)) then
    raise exception 'That squad is not public';
  end if;
  insert into bandlog.group_members (group_id, user_id) values (g, auth.uid())
  on conflict (group_id, user_id) do nothing;
end $$;
grant execute on function bandlog.join_public_group(uuid) to authenticated;

notify pgrst, 'reload schema';

select json_build_object(
  'water_log', to_regclass('bandlog.water_log') is not null,
  'progress_photos', to_regclass('bandlog.progress_photos') is not null,
  'exercise_cols', (select json_agg(column_name order by column_name) from information_schema.columns where table_schema='bandlog' and table_name='exercise_log' and column_name in ('started_at','intensity_pct','distance_km','steps')),
  'profile_cols', (select json_agg(column_name order by column_name) from information_schema.columns where table_schema='bandlog' and table_name='profiles' and column_name in ('fiber_target','sugar_target','add_burned_to_goal','rollover_calories','water_goal_ml')),
  'weight_photo', (select count(*) from information_schema.columns where table_schema='bandlog' and table_name='weight_log' and column_name='photo_path'),
  'group_cols', (select json_agg(column_name order by column_name) from information_schema.columns where table_schema='bandlog' and table_name='groups' and column_name in ('is_public','cover_url','tagline')),
  'bucket', (select count(*) from storage.buckets where id='progress-photos'),
  'functions', (select json_agg(proname order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='bandlog' and proname in ('public_groups','join_public_group')),
  'public_squads', (select json_agg(g.name || ' (' || (select count(*) from bandlog.group_members m where m.group_id=g.id) || ')') from bandlog.groups g where coalesce(g.is_public,false))
) as result;
