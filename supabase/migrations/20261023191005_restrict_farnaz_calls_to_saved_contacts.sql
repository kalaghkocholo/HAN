drop policy if exists "Users can initiate calls as themselves" on public.call_sessions;
create policy "Users can initiate calls as themselves"
on public.call_sessions for insert to authenticated
with check (
  caller_id = (select auth.uid())
  and receiver_id <> (select auth.uid())
  and status = 'ringing'
  and exists (
    select 1 from public.contacts c
    where c.user_id = (select auth.uid())
      and c.contact_user_id = receiver_id
  )
);