create unique index if not exists call_sessions_one_active_per_caller_idx
  on public.call_sessions (caller_id)
  where status in ('ringing','active');

create unique index if not exists call_sessions_one_active_per_receiver_idx
  on public.call_sessions (receiver_id)
  where status in ('ringing','active');