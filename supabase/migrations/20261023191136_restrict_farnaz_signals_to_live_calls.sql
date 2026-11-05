drop policy if exists "Participants can send signals as themselves" on public.call_signals;
create policy "Participants can send signals as themselves"
on public.call_signals for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and target_id <> (select auth.uid())
  and exists (
    select 1 from public.call_sessions c
    where c.id = call_id
      and c.status in ('ringing','active')
      and (select auth.uid()) in (c.caller_id, c.receiver_id)
      and target_id in (c.caller_id, c.receiver_id)
  )
);