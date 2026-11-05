-- Keep profile phone numbers unique even when the same number is entered
-- with different formatting (for example, 0912... and +98912...).
create unique index if not exists profiles_phone_normalized_unique
  on public.profiles (public.normalize_farnaz_phone(phone))
  where phone is not null and btrim(phone) <> '';

-- Allow each signed-in user to delete only their own saved phone-book entries.
create policy "Users can delete their own phone contacts"
  on public.user_phone_contacts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
