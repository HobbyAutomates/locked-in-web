-- REVERT for schema_v44 (v2.18 social: freezes, referrals, verified squads, coach access, stamps +
-- reactions, live sessions, pledges, event badges, packs, leagues). Run only to roll back.
-- Safe with any client: every v2.18 feature hides when its table / function is missing.
--
-- Loses data: freeze tokens, referral rows and banked referral days, verification requests and
-- verified ticks, coach links + comments, stamps, reactions using the 7 new emojis, live sessions,
-- pledges, event badges, pack unlocks, badge skins, gold covers (reset to the default cover),
-- leagues. Pro weeks already added to pro_until by referrals stay (they're ordinary pro_until).

-- 10. Leagues
drop function if exists bandlog.league_table(uuid);
drop table if exists bandlog.league_weeks;
drop table if exists bandlog.squad_leagues;
delete from bandlog.app_config where key in ('packs', 'leagues');

-- 9. Packs, badge skin, gold covers
drop table if exists bandlog.pack_unlocks;
alter table bandlog.profiles drop constraint if exists profiles_badge_skin_check;
alter table bandlog.profiles drop column if exists badge_skin;
update bandlog.profiles set cover_preset = null where cover_preset like '%-gold';
alter table bandlog.profiles drop constraint if exists profiles_cover_preset_format;
alter table bandlog.profiles add constraint profiles_cover_preset_format
  check (cover_preset is null or cover_preset ~ '^[a-z]{2,16}-(light|dark)$');

-- 8. Event badges
drop table if exists bandlog.event_badges;

-- 7. Pledges
drop function if exists bandlog.squad_pledges(uuid);
drop table if exists bandlog.pledges;

-- 6. Live sessions
drop function if exists bandlog.live_cheer(uuid);
drop function if exists bandlog.squad_live(uuid);
drop table if exists bandlog.live_cheers;
drop table if exists bandlog.live_sessions;
alter table bandlog.profiles drop column if exists live_share;

-- 5. Stamps + the v35 reaction set
drop function if exists bandlog.post_stamp_counts(uuid[]);
drop table if exists bandlog.post_stamps;
delete from bandlog.post_reactions where emoji not in ('❤️', '🔥', '👍', '😂', '😮', '💪');
alter table bandlog.post_reactions drop constraint if exists post_reactions_emoji_check;
alter table bandlog.post_reactions add constraint post_reactions_emoji_check
  check (emoji in ('❤️', '🔥', '👍', '😂', '😮', '💪'));

-- 4. Coach access
drop function if exists bandlog.client_overview(uuid, int);
drop function if exists bandlog.my_clients();
drop function if exists bandlog.my_coaches();
drop function if exists bandlog.coach_revoke(uuid);
drop function if exists bandlog.coach_grant(text);
drop table if exists bandlog.coach_comments;
drop function if exists bandlog.coaches_client(uuid);
drop table if exists bandlog.coach_links;

-- 3. Verified squads
drop function if exists bandlog.request_squad_verification(uuid, text, text, text);
drop table if exists bandlog.squad_verifications;
drop trigger if exists groups_guard_verified_insert on bandlog.groups;
drop function if exists bandlog.groups_guard_verified_insert();
drop trigger if exists groups_guard_verified on bandlog.groups;
drop function if exists bandlog.groups_guard_verified();
alter table bandlog.groups drop constraint if exists groups_org_kind_check;
alter table bandlog.groups drop column if exists org_kind;
alter table bandlog.groups drop column if exists org_name;
alter table bandlog.groups drop column if exists verified;

-- 2. Referrals
drop function if exists bandlog.my_referrals();
drop function if exists bandlog.referral_claim(text);
drop function if exists bandlog.grant_referral_week(uuid);
drop function if exists bandlog.my_referral_code();
drop table if exists bandlog.referrals;
drop trigger if exists profiles_guard_referral on bandlog.profiles;
drop function if exists bandlog.profiles_guard_referral();
drop index if exists bandlog.profiles_referral_code_key;
alter table bandlog.profiles drop column if exists referral_pro_days;
alter table bandlog.profiles drop column if exists referral_code;

-- 1. Streak freezes: day_streak back to v26, then the tables
create or replace function bandlog.day_streak(u uuid) returns int
language sql stable security definer set search_path = bandlog as $$
  with t as (select (now() at time zone 'Asia/Kolkata')::date as d),
  days as (
    select m.date from bandlog.meals m, t where m.user_id = u and m.date between t.d - 400 and t.d
    union select w.date from bandlog.workouts w, t where w.user_id = u and w.date between t.d - 400 and t.d
    union select e.date from bandlog.exercise_log e, t where e.user_id = u and e.date between t.d - 400 and t.d
  ),
  s as (
    select case when exists (select 1 from days, t where days.date = t.d) then (select d from t)
                when exists (select 1 from days, t where days.date = t.d - 1) then (select d from t) - 1 end as start
  ),
  ranked as (
    select (s.start - days.date) as off, (row_number() over (order by days.date desc) - 1) as rn
    from days, s where s.start is not null and days.date <= s.start
  )
  select count(*)::int from ranked where off = rn;
$$;
drop function if exists bandlog.freeze_gift(uuid);
drop function if exists bandlog.freeze_sync();
drop function if exists bandlog.soc_is_frozen(uuid, date);
drop table if exists bandlog.freeze_events;
drop table if exists bandlog.streak_freezes;

-- 0. Helpers; guard_plan back to v36
create or replace function bandlog.guard_plan() returns trigger
language plpgsql security definer set search_path = bandlog as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.plan := old.plan;
    new.pro_until := old.pro_until;
  end if;
  return new;
end $$;
drop function if exists bandlog.soc_shares_squad(uuid);
drop function if exists bandlog.soc_trusted();
drop function if exists bandlog.soc_active_on(uuid, date);
drop function if exists bandlog.soc_today();

notify pgrst, 'reload schema';
