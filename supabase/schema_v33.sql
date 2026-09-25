-- v2.10 (schema_v33, area "admin"): bandlog.app_events, lightweight usage events for the closed beta. Idempotent.
--
-- NOT applied to any database by the agent that wrote this file. Review it and run it manually.
-- Undo with supabase/revert_v33.sql.
--
-- Clients (web src/lib/track.ts + src/lib/trackServer.ts, Android util/Analytics.kt) send events only
-- while BETA_ANALYTICS is on, and go quiet on their own if this table doesn't exist yet.
-- Clients can INSERT their own rows and nothing else: there is no select/update/delete policy, so
-- only the service role (the /admin panel, server-side) can read them. See docs/ADMIN.md.

create table if not exists bandlog.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_]{1,39}$'),
  props jsonb not null default '{}'::jsonb,
  platform text check (platform in ('web', 'android')),
  app_version text check (length(app_version) <= 20),
  created_at timestamptz not null default now(),
  -- Keep props small: they are counters and labels, never logged content.
  constraint app_events_props_size check (pg_column_size(props) <= 2048),
  constraint app_events_props_object check (jsonb_typeof(props) = 'object')
);

create index if not exists app_events_user_created_idx on bandlog.app_events (user_id, created_at desc);
create index if not exists app_events_created_idx on bandlog.app_events (created_at desc);
create index if not exists app_events_name_created_idx on bandlog.app_events (name, created_at desc);

alter table bandlog.app_events enable row level security;

drop policy if exists app_events_insert_own on bandlog.app_events;
create policy app_events_insert_own on bandlog.app_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- Insert only. No select grant, so PostgREST inserts must use Prefer: return=minimal.
revoke all on bandlog.app_events from anon, authenticated;
grant insert (user_id, name, props, platform, app_version) on bandlog.app_events to authenticated;
grant all on bandlog.app_events to service_role;

comment on table bandlog.app_events is
  'v2.10 beta usage events (app_open, screen_view, meal_logged, ...). Insert-own only; read by the service role for /admin. Disable with BETA_ANALYTICS=false before public launch.';

notify pgrst, 'reload schema';

-- Verify
select json_build_object(
  'has_table', to_regclass('bandlog.app_events') is not null,
  'rls', (select relrowsecurity from pg_class where oid = 'bandlog.app_events'::regclass),
  'policies', (select json_agg(policyname) from pg_policies where schemaname = 'bandlog' and tablename = 'app_events'),
  'rows', (select count(*) from bandlog.app_events)
) as result;
