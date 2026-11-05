create or replace function public.enforce_call_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'ringing' and new.status in ('active','rejected','ended','missed') then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'active' and new.status = 'ended' then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'Invalid call status transition: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists enforce_call_status_transition on public.call_sessions;
create trigger enforce_call_status_transition
before update of status on public.call_sessions
for each row execute function public.enforce_call_status_transition();