create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','active','rejected','ended','missed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (caller_id <> receiver_id)
);

create index if not exists call_sessions_receiver_status_created_idx
  on public.call_sessions (receiver_id, status, created_at desc);
create index if not exists call_sessions_caller_created_idx
  on public.call_sessions (caller_id, created_at desc);

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice-candidate','reject','hangup')),
  payload jsonb,
  created_at timestamptz not null default now(),
  check (sender_id <> target_id),
  check (payload is null or octet_length(payload::text) <= 100000)
);

create index if not exists call_signals_call_created_idx
  on public.call_signals (call_id, created_at);
create index if not exists call_signals_target_created_idx
  on public.call_signals (target_id, created_at desc);

create or replace function public.protect_call_session_participants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.caller_id is distinct from old.caller_id
     or new.receiver_id is distinct from old.receiver_id
     or new.call_type is distinct from old.call_type
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Call participants and type cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_call_session_participants on public.call_sessions;
create trigger protect_call_session_participants
before update on public.call_sessions
for each row execute function public.protect_call_session_participants();

alter table public.call_sessions enable row level security;
alter table public.call_signals enable row level security;

revoke all on public.call_sessions from anon, authenticated;
revoke all on public.call_signals from anon, authenticated;
grant select, insert, update on public.call_sessions to authenticated;
grant select, insert on public.call_signals to authenticated;

drop policy if exists "Participants can read their calls" on public.call_sessions;
create policy "Participants can read their calls"
on public.call_sessions for select to authenticated
using ((select auth.uid()) in (caller_id, receiver_id));

drop policy if exists "Users can initiate calls as themselves" on public.call_sessions;
create policy "Users can initiate calls as themselves"
on public.call_sessions for insert to authenticated
with check (
  caller_id = (select auth.uid())
  and receiver_id <> (select auth.uid())
  and status = 'ringing'
);

drop policy if exists "Participants can update call status" on public.call_sessions;
create policy "Participants can update call status"
on public.call_sessions for update to authenticated
using ((select auth.uid()) in (caller_id, receiver_id))
with check ((select auth.uid()) in (caller_id, receiver_id));

drop policy if exists "Call participants can read signals" on public.call_signals;
create policy "Call participants can read signals"
on public.call_signals for select to authenticated
using (
  (select auth.uid()) in (sender_id, target_id)
  and exists (
    select 1 from public.call_sessions c
    where c.id = call_id
      and (select auth.uid()) in (c.caller_id, c.receiver_id)
  )
);

drop policy if exists "Participants can send signals as themselves" on public.call_signals;
create policy "Participants can send signals as themselves"
on public.call_signals for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and target_id <> (select auth.uid())
  and exists (
    select 1 from public.call_sessions c
    where c.id = call_id
      and (select auth.uid()) in (c.caller_id, c.receiver_id)
      and target_id in (c.caller_id, c.receiver_id)
  )
);