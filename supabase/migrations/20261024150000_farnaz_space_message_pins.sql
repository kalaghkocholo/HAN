-- Shared pin/unpin state for messages in groups and channels.
create table if not exists public.space_message_pins (
  message_id uuid primary key references public.space_messages(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.space_message_pins enable row level security;

drop policy if exists "Space readers can view pinned messages" on public.space_message_pins;
create policy "Space readers can view pinned messages"
  on public.space_message_pins for select to authenticated
  using (private.can_read_space(space_id));

drop policy if exists "Space readers can pin messages" on public.space_message_pins;
create policy "Space readers can pin messages"
  on public.space_message_pins for insert to authenticated
  with check (
    pinned_by = (select auth.uid())
    and private.can_read_space(space_id)
    and exists (
      select 1 from public.space_messages m
      where m.id = space_message_pins.message_id
        and m.space_id = space_message_pins.space_id
    )
  );

drop policy if exists "Space readers can unpin messages" on public.space_message_pins;
create policy "Space readers can unpin messages"
  on public.space_message_pins for delete to authenticated
  using (private.can_read_space(space_id));

grant select, insert, delete on public.space_message_pins to authenticated;
