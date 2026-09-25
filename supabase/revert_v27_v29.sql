-- REVERT for v2.7 database changes: schema_v29 (battle) -> schema_v28 (foods source) -> schema_v27 (challenges)
-- and seeds/foods_v28.sql. Run ONLY to roll the database back to its v2.6 state (2026-09-25).
-- Full pre-migration table backup: C:\Users\Aditya\LockedIn-backups\pre-v2.7-2026-09-25\*.json
-- Order matters: roll back the v2.7 apps first (web on Railway, Android APK) so nothing writes
-- 'challenge'/'battle' posts while this runs.

begin;

-- seeds/foods_v28.sql: remove the 223 aliases + 2 foods it added, restore the pre-fix calorie values.
delete from bandlog.food_aliases where alias in ('cucumber','kheera','kakdi','tomato','tamatar','onion','pyaz','kanda','potato','aloo','batata','carrot','gajar','cauliflower','gobi','phool gobi','cabbage','patta gobi','bandh gobi','brinjal','baingan','eggplant','vangi','okra','bhindi','ladies finger','spinach','palak','bottle gourd','lauki','dudhi','ghia','ridge gourd','turai','tori','bitter gourd','karela','pumpkin','kaddu','sitaphal vegetable','radish','mooli','beetroot','chukandar','green peas','matar','hara matar','french beans','farasbi','capsicum','shimla mirch','bell pepper','green chilli','hari mirch','ginger','adrak','garlic','lehsun','coriander leaves','dhaniya patta','cilantro','curry leaves','kadi patta','mint leaves','pudina','lemon','nimbu','banana','kela','apple','seb','mango','aam','papaya','papita','guava','amrud','pomegranate','anar','grapes','angoor','watermelon','tarbooz','muskmelon','kharbooja','orange','santra','pineapple','ananas','sapota','chikoo','sapodilla','custard apple','sitaphal','jackfruit','kathal','fig','anjeer','dates','khajur','raisins','kishmish','toor dal','arhar dal','pigeon pea','moong dal','mung dal','chana dal','bengal gram dal','masoor dal','red lentil','urad dal','black gram','rajma','kidney beans','chole','soybean','soya bean','basmati rice','basmati chawal','wheat flour','atta','maida','refined flour','semolina','suji','rava','ragi','finger millet','nachni','jowar','sorghum','bajra','pearl millet','oats','yogurt','cottage cheese','ghee','butter','makhan','buttermilk','chaas','chhaach','mustard oil','sarson tel','groundnut oil','peanut oil','sunflower oil','coconut oil','nariyal tel','olive oil','groundnut','peanut','moongphali','almond','badam','cashew','kaju','walnut','akhrot','pistachio','pista','sesame seed','til','flax seed','alsi','jaggery','gur','honey','shahad','turmeric powder','haldi','cumin seed','jeera','coriander seed','black pepper','kali mirch','chicken breast','murgi','fish rohu','rohu','prawns','shrimp','tofu','soy paneer','dal tadka','yellow dal','dal makhani','paneer butter masala','butter paneer','shahi paneer','matar paneer','aloo gobi','plain paratha','paratha','naan','poha','upma','idli','masala dosa','plain dosa','dosa','sambar','rasam','pav bhaji','samosa','pakora','biryani','veg pulao','pulao','khichdi','butter chicken','chicken curry','egg curry','mutton curry','fish curry','gulab jamun','rasgulla','rosogolla','besan ladoo','gram flour ladoo','kheer','halwa');
delete from bandlog.foods where id in ('usda-besan', 'usda-sesame-seeds');
update bandlog.foods set calories = 0 where id in ('ifct-coconut-oil','ifct-corn-oil','ifct-cotton-seed-oil','ifct-ghee','ifct-gingelly-oil','ifct-groundnut-oil','ifct-mustard-oil','ifct-palm-oil','ifct-rice-bran-oil','ifct-safflower-oil','ifct-safflower-oil-blended','ifct-soyabean-oil','ifct-sunflower-oil','ifct-vanaspati');
update bandlog.foods set calories = 383.6 where id = 'ifct-chicken-poultry-leg-skinless';

-- schema_v29 (battle)
drop function if exists bandlog.my_graffiti(uuid);
drop function if exists bandlog.battle_close(uuid, date);
drop function if exists bandlog.battle_board(uuid, date);
drop function if exists bandlog.battle_score(text, numeric);
drop table if exists bandlog.battle_wins;
alter table bandlog.groups drop column if exists battle_enabled;

-- schema_v27 (challenges) + posts kinds added by v27/v29
delete from bandlog.group_posts where kind in ('challenge', 'battle');
alter table bandlog.group_posts drop constraint if exists group_posts_kind_check;
alter table bandlog.group_posts add constraint group_posts_kind_check check (kind in ('message', 'meal', 'workout', 'pr', 'photo'));
drop function if exists bandlog.group_challenge_list(uuid);
drop function if exists bandlog.challenge_board(uuid);
drop function if exists bandlog.create_challenge(uuid, text, text, int, int, date, date);
drop table if exists bandlog.group_challenges;

-- schema_v28 (foods source check; v2.6 had no constraint). AI-sourced rows are dropped first so nothing
-- references a source the v2.6 apps don't know about.
delete from bandlog.foods where source = 'ai';
alter table bandlog.foods drop constraint if exists foods_source_check;

commit;
notify pgrst, 'reload schema';
