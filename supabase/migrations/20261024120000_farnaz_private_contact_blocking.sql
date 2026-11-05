create table if not exists public.blocked_contacts (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_user_id),
  constraint blocked_contacts_no_self check (blocker_id <> blocked_user_id)
);

alter table public.blocked_contacts enable row level security;

drop policy if exists "Users can view their own blocked contacts" on public.blocked_contacts;
create policy "Users can view their own blocked contacts"
  on public.blocked_contacts for select to authenticated
  using ((select auth.uid()) = blocker_id);

drop policy if exists "Users can block contacts" on public.blocked_contacts;
create policy "Users can block contacts"
  on public.blocked_contacts for insert to authenticated
  with check ((select auth.uid()) = blocker_id and blocker_id <> blocked_user_id);

drop policy if exists "Users can unblock contacts" on public.blocked_contacts;
create policy "Users can unblock contacts"
  on public.blocked_contacts for delete to authenticated
  using ((select auth.uid()) = blocker_id);

drop policy if exists "Blocked pairs cannot exchange messages" on public.messages;
create policy "Blocked pairs cannot exchange messages"
  on public.messages as restrictive for insert to authenticated
  with check (
    not exists (
      select 1 from public.blocked_contacts b
      where (b.blocker_id = sender_id and b.blocked_user_id = receiver_id)
         or (b.blocker_id = receiver_id and b.blocked_user_id = sender_id)
    )
  );

grant select, insert, delete on public.blocked_contacts to authenticated;
