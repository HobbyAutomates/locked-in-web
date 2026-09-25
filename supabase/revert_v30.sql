-- REVERT for schema_v30 (meals.meal_type). Run only to roll the database back to v2.7.
-- Roll back the apps first (web: Railway redeploy of v2.7; Android: see LockedIn-backups/ROLLBACK.md).
-- v2.7 clients never read meal_type, so dropping it loses only the Breakfast/Lunch/Dinner/Snack labels.
alter table bandlog.meals drop constraint if exists meals_meal_type_check;
alter table bandlog.meals drop column if exists meal_type;
notify pgrst, 'reload schema';
