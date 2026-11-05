create or replace function public.enforce_call_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'ringing' and new.status = 'active' and actor = old.receiver_id then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'ringing' and new.status = 'rejected' and actor = old.receiver_id then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'ringing' and new.status in ('ended','missed') and actor in (old.caller_id,old.receiver_id) then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'active' and new.status = 'ended' and actor in (old.caller_id,old.receiver_id) then
    new.updated_at := now();
    return new;
  end if;
  raise exception 'Invalid call status transition or unauthorized actor: % -> %', old.status, new.status;
end;
$$;