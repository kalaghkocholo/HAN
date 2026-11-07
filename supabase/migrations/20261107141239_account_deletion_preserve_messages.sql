-- Preserve conversation history when an account is permanently deleted.
-- The UUID remains as a non-authenticated historical sender/recipient reference.
alter table public.messages
  drop constraint if exists messages_sender_id_fkey,
  drop constraint if exists messages_receiver_id_fkey;

alter table public.space_messages
  drop constraint if exists space_messages_sender_id_fkey;

-- The creator reference is retained for history; the deletion Edge Function blocks deletion until ownership is explicitly transferred.
alter table public.spaces
  drop constraint if exists spaces_created_by_fkey;

create or replace function public.farnaz_account_deletion_storage_objects(p_user_id uuid)
returns table(bucket_id text, name text)
language sql
security definer
set search_path = ''
as $$
  select o.bucket_id::text, o.name::text
  from storage.objects as o
  where o.owner_id::text = p_user_id::text
  order by o.bucket_id, o.name;
$$;

revoke all on function public.farnaz_account_deletion_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.farnaz_account_deletion_storage_objects(uuid) to service_role;
