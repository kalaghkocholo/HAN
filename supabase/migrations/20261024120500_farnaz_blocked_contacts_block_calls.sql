drop policy if exists "Blocked pairs cannot start calls" on public.call_sessions;
create policy "Blocked pairs cannot start calls"
  on public.call_sessions as restrictive for insert to authenticated
  with check (
    not exists (
      select 1 from public.blocked_contacts b
      where (b.blocker_id = caller_id and b.blocked_user_id = receiver_id)
         or (b.blocker_id = receiver_id and b.blocked_user_id = caller_id)
    )
  );
