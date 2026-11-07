-- Enforce live Supabase Auth sessions on every authenticated Data API and Storage operation.
-- Supabase access JWTs remain cryptographically valid until exp after sign-out.
-- This restrictive policy checks session_id against auth.sessions so revoked/deleted
-- sessions cannot continue using an otherwise unexpired access token.

create or replace function private.farnaz_has_active_auth_session()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_session_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return false;
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    return false;
  end;

  if v_session_id is null then
    return false;
  end if;

  return exists (
    select 1
    from auth.sessions as s
    where s.id = v_session_id
      and s.user_id = v_user_id
      and (s.not_after is null or s.not_after > now())
  );
end;
$function$;

revoke all on function private.farnaz_has_active_auth_session() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.farnaz_has_active_auth_session() to authenticated;

do $policy$
declare
  v_table text;
  v_tables text[] := array[
    'blocked_contacts',
    'call_sessions',
    'call_signals',
    'contacts',
    'conversation_preferences',
    'message_hidden',
    'message_pins',
    'message_reactions',
    'message_read_receipts',
    'messages',
    'profiles',
    'space_members',
    'space_message_hidden',
    'space_message_pins',
    'space_message_reactions',
    'space_message_reads',
    'space_messages',
    'spaces',
    'user_phone_contacts'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('drop policy if exists %I on public.%I', 'Require active Supabase session', v_table);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (private.farnaz_has_active_auth_session()) with check (private.farnaz_has_active_auth_session())',
      'Require active Supabase session',
      v_table
    );
  end loop;
end;
$policy$;

drop policy if exists "Require active Supabase session" on storage.objects;
create policy "Require active Supabase session"
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (private.farnaz_has_active_auth_session())
  with check (private.farnaz_has_active_auth_session());
