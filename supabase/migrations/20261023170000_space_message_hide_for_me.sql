create table if not exists public.space_message_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.space_messages(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.space_message_hidden enable row level security;
grant select, insert, delete on public.space_message_hidden to authenticated;
drop policy if exists "Users view their own hidden space messages" on public.space_message_hidden;
create policy "Users view their own hidden space messages"
  on public.space_message_hidden for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users hide space messages for themselves" on public.space_message_hidden;
create policy "Users hide space messages for themselves"
  on public.space_message_hidden for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "Users unhide their own space messages" on public.space_message_hidden;
create policy "Users unhide their own space messages"
  on public.space_message_hidden for delete to authenticated
  using (user_id = (select auth.uid()));