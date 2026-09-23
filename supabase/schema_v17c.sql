-- v1.7c: the private meal-photos bucket — each user reads/writes only their own folder
-- (meal-photos/<user_id>/<uuid>.jpg). Needed for the app's direct Storage uploads and signed URLs.
drop policy if exists "meal photos own read" on storage.objects;
create policy "meal photos own read" on storage.objects for select
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "meal photos own insert" on storage.objects;
create policy "meal photos own insert" on storage.objects for insert
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "meal photos own delete" on storage.objects;
create policy "meal photos own delete" on storage.objects for delete
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
select count(*) as policies from pg_policies where tablename = 'objects' and policyname like 'meal photos%';
