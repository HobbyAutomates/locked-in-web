-- v2.10 (schema_v34, area "science"): profiles.hide_numbers + profiles.waist_cm. Idempotent.
--
-- NOT applied to any database by the agent that wrote this file — review and run manually.
-- (schema_v33 is the admin panel's; the two are independent and can run in either order.)
--
--   hide_numbers  Preferences → Tracking "Hide calorie numbers". Opt-in only, default off: the app
--                 shows progress bars and words instead of kcal. Never switched on by the app.
--   waist_cm      Optional waist measurement for the waist-to-height ratio on the BMI card.
--
-- Clients tolerate both columns being missing: web src/lib/data.ts getProfile() reads them in their
-- own query (null = not there yet, the switch shows "Coming with the next update" and the waist row
-- hides) and saveProfile() retries a patch without them; Android's ProfileRepo does the same.
-- Existing RLS on bandlog.profiles (owner-only read/write) already covers the new columns.

alter table bandlog.profiles add column if not exists hide_numbers boolean not null default false;
alter table bandlog.profiles add column if not exists waist_cm numeric(5,1);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_waist_cm_range') then
    alter table bandlog.profiles add constraint profiles_waist_cm_range check (waist_cm is null or (waist_cm >= 30 and waist_cm <= 250));
  end if;
end $$;

comment on column bandlog.profiles.hide_numbers is
  'v2.10: opt-in "Hide calorie numbers" display mode (progress bars and words instead of kcal). Default false.';
comment on column bandlog.profiles.waist_cm is
  'v2.10: optional self-reported waist in cm for the waist-to-height ratio (one signal, not a verdict).';

notify pgrst, 'reload schema';

-- Verify
select json_build_object(
  'has_hide_numbers', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name = 'hide_numbers'),
  'has_waist_cm', exists (select 1 from information_schema.columns where table_schema = 'bandlog' and table_name = 'profiles' and column_name = 'waist_cm'),
  'hiding', (select count(*) from bandlog.profiles where hide_numbers)
) as result;
