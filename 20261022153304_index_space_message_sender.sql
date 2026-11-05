create index if not exists space_messages_sender_idx on public.space_messages(sender_id, created_at desc);
