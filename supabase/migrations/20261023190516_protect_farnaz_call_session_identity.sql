create or replace function public.protect_call_session_participants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.caller_id is distinct from old.caller_id
     or new.receiver_id is distinct from old.receiver_id
     or new.call_type is distinct from old.call_type
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Call identity, participants, and type cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;