-- Cover foreign-key columns used for lookups/deletes and group-message hiding.
-- IF NOT EXISTS makes the migration safe if an equivalent index was created manually.
CREATE INDEX IF NOT EXISTS message_read_receipts_reader_id_idx
  ON public.message_read_receipts (reader_id);

CREATE INDEX IF NOT EXISTS message_read_receipts_receiver_id_idx
  ON public.message_read_receipts (receiver_id);

CREATE INDEX IF NOT EXISTS space_message_hidden_message_id_idx
  ON public.space_message_hidden (message_id);

CREATE INDEX IF NOT EXISTS space_message_reads_user_id_idx
  ON public.space_message_reads (user_id);
