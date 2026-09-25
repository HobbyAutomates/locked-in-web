-- REVERT for schema_v33 (bandlog.app_events). Drops every recorded beta usage event.
-- Safe with any client: web and Android trackers stop sending once the table is missing
-- (they treat "relation does not exist" as off for the rest of the session).
drop table if exists bandlog.app_events;
notify pgrst, 'reload schema';
