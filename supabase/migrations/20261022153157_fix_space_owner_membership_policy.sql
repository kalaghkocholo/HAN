create or replace function private.is_space_creator(p_space_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (select 1 from public.spaces s where s.id=p_space_id and s.created_by=auth.uid()); $$;
grant execute on function private.is_space_creator(uuid) to authenticated;
drop policy if exists "Self join or managers add members" on public.space_members;
create policy "Self join or managers add members" on public.space_members for insert to authenticated with check (
 (user_id=(select auth.uid()) and role='member' and (exists(select 1 from public.spaces s where s.id=space_id and s.type='channel' and s.is_public=true) or private.is_space_creator(space_id)))
 or (user_id=(select auth.uid()) and role='owner' and private.is_space_creator(space_id))
 or (user_id<>(select auth.uid()) and private.can_manage_space(space_id) and role in ('admin','member'))
);
