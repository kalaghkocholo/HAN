create or replace function private.can_read_space(p_space_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select auth.uid() is not null and (
   private.is_space_member(p_space_id)
   or private.is_space_creator(p_space_id)
   or exists(select 1 from public.spaces s where s.id=p_space_id and s.type='channel' and s.is_public=true)
 );
$$;
grant execute on function private.can_read_space(uuid) to authenticated;
