drop policy if exists "Spaces visible to members and public channels" on public.spaces;
create policy "Spaces visible to members and public channels"
on public.spaces for select to authenticated
using (
  created_by = (select auth.uid())
  or private.is_space_member(id)
  or (type = 'channel' and is_public = true)
);
drop policy if exists "Users create spaces as themselves" on public.spaces;
create policy "Users create spaces as themselves"
on public.spaces for insert to authenticated
with check (
  auth.uid() is not null
  and created_by = (select auth.uid())
);
