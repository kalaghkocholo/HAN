drop policy if exists "Users can see blocks involving themselves" on public.blocked_contacts;
create policy "Users can see blocks involving themselves"
  on public.blocked_contacts for select to authenticated
  using ((select auth.uid()) = blocker_id or (select auth.uid()) = blocked_user_id);
