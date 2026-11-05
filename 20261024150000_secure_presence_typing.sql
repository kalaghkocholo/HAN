-- Farnaz presence and typing authorization hardening
-- Safe to re-run: schema objects are created/replaced idempotently.

create table if not exists private.farnaz_presence_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  primary key (user_id, session_id)
);

create index if not exists farnaz_presence_sessions_active_idx
  on private.farnaz_presence_sessions (user_id, last_seen_at desc)
  where is_active = true;

create or replace function private.farnaz_can_view_presence(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null and (
    p_target = auth.uid()
    or (
      exists (
        select 1 from public.contacts a
        join public.contacts b
          on b.user_id = a.contact_user_id
         and b.contact_user_id = a.user_id
        where a.user_id = auth.uid()
          and a.contact_user_id = p_target
      )
      and not exists (
        select 1 from public.blocked_contacts bl
        where (bl.blocker_id = auth.uid() and bl.blocked_user_id = p_target)
           or (bl.blocker_id = p_target and bl.blocked_user_id = auth.uid())
      )
    )
  );
$function$;

create or replace function private.farnaz_can_access_typing_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and split_part(p_topic, ':', 1) = 'farnaz-typing'
    and split_part(p_topic, ':', 2) < split_part(p_topic, ':', 3)
    and auth.uid()::text in (split_part(p_topic, ':', 2), split_part(p_topic, ':', 3))
    and exists (
      select 1 from public.contacts a
      join public.contacts b
        on b.user_id = a.contact_user_id
       and b.contact_user_id = a.user_id
      where a.user_id = auth.uid()
        and a.contact_user_id::text in (split_part(p_topic, ':', 2), split_part(p_topic, ':', 3))
    )
    and not exists (
      select 1 from public.blocked_contacts bl
      where (
        bl.blocker_id = auth.uid()
        and bl.blocked_user_id::text in (split_part(p_topic, ':', 2), split_part(p_topic, ':', 3))
      ) or (
        bl.blocked_user_id = auth.uid()
        and bl.blocker_id::text in (split_part(p_topic, ':', 2), split_part(p_topic, ':', 3))
      )
    );
$function$;

revoke all on function private.farnaz_can_view_presence(uuid) from public, anon;
revoke all on function private.farnaz_can_access_typing_topic(text) from public, anon;
grant execute on function private.farnaz_can_view_presence(uuid) to authenticated;
grant execute on function private.farnaz_can_access_typing_topic(text) to authenticated;

create or replace function public.get_farnaz_mutual_contact_ids()
returns table(contact_user_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  select a.contact_user_id
  from public.contacts a
  join public.contacts b
    on b.user_id = a.contact_user_id
   and b.contact_user_id = a.user_id
  where a.user_id = auth.uid()
    and a.contact_user_id <> auth.uid()
    and not exists (
      select 1 from public.blocked_contacts bl
      where (bl.blocker_id = auth.uid() and bl.blocked_user_id = a.contact_user_id)
         or (bl.blocker_id = a.contact_user_id and bl.blocked_user_id = auth.uid())
    );
$function$;
revoke all on function public.get_farnaz_mutual_contact_ids() from public, anon;
grant execute on function public.get_farnaz_mutual_contact_ids() to authenticated;

create or replace function public.set_farnaz_presence_session(p_session_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or p_session_id is null then
    raise exception 'Authentication required';
  end if;

  insert into private.farnaz_presence_sessions(user_id, session_id, last_seen_at, is_active)
  values (auth.uid(), p_session_id, now(), coalesce(p_active, false))
  on conflict (user_id, session_id)
  do update set last_seen_at = excluded.last_seen_at, is_active = excluded.is_active;

  update public.profiles
  set last_seen_at = now()
  where id = auth.uid();
end;
$function$;
revoke all on function public.set_farnaz_presence_session(uuid, boolean) from public, anon;
grant execute on function public.set_farnaz_presence_session(uuid, boolean) to authenticated;

create or replace function public.get_farnaz_presence_status(p_user_id uuid)
returns table(is_online boolean, last_seen_at timestamptz, can_see_online boolean, can_see_last_seen boolean)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (
      exists (
        select 1 from private.farnaz_presence_sessions s
        where s.user_id = p.id
          and s.is_active = true
          and s.last_seen_at > now() - interval '90 seconds'
      )
      and (
        p.id = auth.uid()
        or (
          coalesce(p.presence_visibility, 'contacts') <> 'nobody'
          and exists (
            select 1 from public.contacts a
            join public.contacts b
              on b.user_id = a.contact_user_id
             and b.contact_user_id = a.user_id
            where a.user_id = auth.uid()
              and a.contact_user_id = p.id
          )
          and not exists (
            select 1 from public.blocked_contacts bl
            where (bl.blocker_id = auth.uid() and bl.blocked_user_id = p.id)
               or (bl.blocker_id = p.id and bl.blocked_user_id = auth.uid())
          )
        )
      )
    ) as is_online,
    case
      when p.id = auth.uid() then p.last_seen_at
      when not exists (
        select 1 from public.blocked_contacts bl
        where (bl.blocker_id = auth.uid() and bl.blocked_user_id = p.id)
           or (bl.blocker_id = p.id and bl.blocked_user_id = auth.uid())
      ) and (
        p.last_seen_visibility = 'everyone'
        or (
          p.last_seen_visibility = 'contacts'
          and exists (
            select 1 from public.contacts a
            join public.contacts b
              on b.user_id = a.contact_user_id
             and b.contact_user_id = a.user_id
            where a.user_id = auth.uid()
              and a.contact_user_id = p.id
          )
        )
      )
      then p.last_seen_at else null
    end as last_seen_at,
    (
      p.id = auth.uid()
      or (
        coalesce(p.presence_visibility, 'contacts') <> 'nobody'
        and exists (
          select 1 from public.contacts a
          join public.contacts b
            on b.user_id = a.contact_user_id
           and b.contact_user_id = a.user_id
          where a.user_id = auth.uid()
            and a.contact_user_id = p.id
        )
        and not exists (
          select 1 from public.blocked_contacts bl
          where (bl.blocker_id = auth.uid() and bl.blocked_user_id = p.id)
             or (bl.blocker_id = p.id and bl.blocked_user_id = auth.uid())
        )
      )
    ) as can_see_online,
    (
      p.id = auth.uid()
      or (
        not exists (
          select 1 from public.blocked_contacts bl
          where (bl.blocker_id = auth.uid() and bl.blocked_user_id = p.id)
             or (bl.blocker_id = p.id and bl.blocked_user_id = auth.uid())
        )
        and (
          p.last_seen_visibility = 'everyone'
          or (
            p.last_seen_visibility = 'contacts'
            and exists (
              select 1 from public.contacts a
              join public.contacts b
                on b.user_id = a.contact_user_id
               and b.contact_user_id = a.user_id
              where a.user_id = auth.uid()
                and a.contact_user_id = p.id
            )
          )
        )
      )
    ) as can_see_last_seen
  from public.profiles p
  where auth.uid() is not null and p.id = p_user_id;
$function$;
revoke all on function public.get_farnaz_presence_status(uuid) from public, anon;
grant execute on function public.get_farnaz_presence_status(uuid) to authenticated;

drop policy if exists "farnaz presence owner publish" on realtime.messages;
create policy "farnaz presence owner publish"
on realtime.messages for insert to authenticated
with check (
  extension = 'presence'
  and topic = 'farnaz-presence:' || (select auth.uid())::text
);

drop policy if exists "farnaz presence mutual contacts read" on realtime.messages;
create policy "farnaz presence mutual contacts read"
on realtime.messages for select to authenticated
using (
  extension = 'presence'
  and topic like 'farnaz-presence:%'
  and case
    when split_part(realtime.topic(), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.farnaz_can_view_presence(split_part(realtime.topic(), ':', 2)::uuid)
    else false
  end
);

drop policy if exists "farnaz private typing mutual contacts read" on realtime.messages;
create policy "farnaz private typing mutual contacts read"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and event = 'typing'
  and private.farnaz_can_access_typing_topic(realtime.topic())
);

drop policy if exists "farnaz private typing mutual contacts send" on realtime.messages;
create policy "farnaz private typing mutual contacts send"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and event = 'typing'
  and payload ->> 'from' = (select auth.uid())::text
  and private.farnaz_can_access_typing_topic(realtime.topic())
);

drop policy if exists "farnaz space members typing read" on realtime.messages;
create policy "farnaz space members typing read"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and event = 'typing'
  and topic like 'space-%'
  and exists (
    select 1 from public.space_members sm
    where sm.space_id::text = substring(realtime.topic() from 7)
      and sm.user_id = (select auth.uid())
  )
);

drop policy if exists "farnaz space members typing send" on realtime.messages;
create policy "farnaz space members typing send"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and event = 'typing'
  and payload ->> 'from' = (select auth.uid())::text
  and topic like 'space-%'
  and exists (
    select 1 from public.space_members sm
    where sm.space_id::text = substring(realtime.topic() from 7)
      and sm.user_id = (select auth.uid())
  )
);
