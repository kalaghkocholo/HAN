create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('group','channel')),
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  is_public boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  invite_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channels_visibility_only check (type = 'channel' or is_public = false)
);
create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (space_id,user_id)
);
create table if not exists public.space_messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists spaces_created_by_idx on public.spaces(created_by,created_at desc);
create index if not exists spaces_public_channels_idx on public.spaces(type,is_public,created_at desc) where type='channel' and is_public=true;
create index if not exists space_members_user_idx on public.space_members(user_id,joined_at desc);
create index if not exists space_messages_space_time_idx on public.space_messages(space_id,created_at desc);

create or replace function private.is_space_member(p_space_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (select 1 from public.space_members sm where sm.space_id=p_space_id and sm.user_id=auth.uid()); $$;
create or replace function private.can_manage_space(p_space_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (select 1 from public.space_members sm where sm.space_id=p_space_id and sm.user_id=auth.uid() and sm.role in ('owner','admin')); $$;
create or replace function private.can_read_space(p_space_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and (private.is_space_member(p_space_id) or exists (select 1 from public.spaces s where s.id=p_space_id and s.type='channel' and s.is_public=true)); $$;
create or replace function private.can_post_space(p_space_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (select 1 from public.spaces s where s.id=p_space_id and ((s.type='group' and private.is_space_member(s.id)) or (s.type='channel' and private.can_manage_space(s.id)))); $$;

create or replace function public.join_space_by_invite(p_invite_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_space_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select s.id into v_space_id from public.spaces s where s.type='channel' and s.is_public=false and s.invite_code=p_invite_code;
  if v_space_id is null then raise exception 'Invalid invite code'; end if;
  insert into public.space_members(space_id,user_id,role) values(v_space_id,auth.uid(),'member') on conflict(space_id,user_id) do nothing;
  return v_space_id;
end;
$$;

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_messages enable row level security;
create policy "Spaces visible to members and public channels" on public.spaces for select to authenticated using (private.can_read_space(id));
create policy "Users create spaces as themselves" on public.spaces for insert to authenticated with check (created_by=(select auth.uid()));
create policy "Managers update spaces" on public.spaces for update to authenticated using (private.can_manage_space(id)) with check (private.can_manage_space(id));
create policy "Owners delete spaces" on public.spaces for delete to authenticated using (created_by=(select auth.uid()));
create policy "Members and managers view space members" on public.space_members for select to authenticated using (user_id=(select auth.uid()) or private.can_manage_space(space_id));
create policy "Self join or managers add members" on public.space_members for insert to authenticated with check (
 (user_id=(select auth.uid()) and role='member' and (exists(select 1 from public.spaces s where s.id=space_id and s.type='channel' and s.is_public=true) or exists(select 1 from public.spaces s where s.id=space_id and s.created_by=(select auth.uid()) and role='member')))
 or (user_id=(select auth.uid()) and role='owner' and exists(select 1 from public.spaces s where s.id=space_id and s.created_by=(select auth.uid())))
 or (user_id<>(select auth.uid()) and private.can_manage_space(space_id) and role in ('admin','member'))
);
create policy "Users leave or managers remove members" on public.space_members for delete to authenticated using ((user_id=(select auth.uid()) and role<>'owner') or (private.can_manage_space(space_id) and role<>'owner'));
create policy "Readable space messages" on public.space_messages for select to authenticated using (private.can_read_space(space_id));
create policy "Members can send group messages and managers can post channels" on public.space_messages for insert to authenticated with check (sender_id=(select auth.uid()) and private.can_post_space(space_id));
create policy "Authors or managers edit space messages" on public.space_messages for update to authenticated using (sender_id=(select auth.uid()) or private.can_manage_space(space_id)) with check (sender_id=(select auth.uid()) or private.can_manage_space(space_id));
create policy "Authors or managers delete space messages" on public.space_messages for delete to authenticated using (sender_id=(select auth.uid()) or private.can_manage_space(space_id));

grant select,insert,update,delete on public.spaces to authenticated;
grant select,insert,delete on public.space_members to authenticated;
grant select,insert,update,delete on public.space_messages to authenticated;
revoke all on function public.join_space_by_invite(text) from public,anon;
grant execute on function public.join_space_by_invite(text) to authenticated;
grant execute on function private.is_space_member(uuid),private.can_manage_space(uuid),private.can_read_space(uuid),private.can_post_space(uuid) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='space_messages') then
  alter publication supabase_realtime add table public.space_messages;
 end if;
end $$;
