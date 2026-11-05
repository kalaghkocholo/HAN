-- Persist emoji reactions and pinned messages in private conversations.
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','😢','🙏')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Conversation participants can read message reactions" ON public.message_reactions;
CREATE POLICY "Conversation participants can read message reactions" ON public.message_reactions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_reactions.message_id AND ((SELECT auth.uid())=m.sender_id OR (SELECT auth.uid())=m.receiver_id)));
DROP POLICY IF EXISTS "Users manage their own message reactions" ON public.message_reactions;
CREATE POLICY "Users manage their own message reactions" ON public.message_reactions FOR ALL TO authenticated
USING (user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_reactions.message_id AND ((SELECT auth.uid())=m.sender_id OR (SELECT auth.uid())=m.receiver_id)))
WITH CHECK (user_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_reactions.message_id AND ((SELECT auth.uid())=m.sender_id OR (SELECT auth.uid())=m.receiver_id)));
CREATE INDEX IF NOT EXISTS message_reactions_message_id_idx ON public.message_reactions(message_id);
CREATE TABLE IF NOT EXISTS public.message_pins (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Conversation participants can read message pins" ON public.message_pins;
CREATE POLICY "Conversation participants can read message pins" ON public.message_pins FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_pins.message_id AND ((SELECT auth.uid())=m.sender_id OR (SELECT auth.uid())=m.receiver_id)));
DROP POLICY IF EXISTS "Conversation participants can pin messages" ON public.message_pins;
CREATE POLICY "Conversation participants can pin messages" ON public.message_pins FOR INSERT TO authenticated
WITH CHECK (pinned_by=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_pins.message_id AND ((SELECT auth.uid())=m.sender_id OR (SELECT auth.uid())=m.receiver_id)));
DROP POLICY IF EXISTS "Conversation participants can unpin messages" ON public.message_pins;
CREATE POLICY "Conversation participants can unpin messages" ON public.message_pins FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_pins.message_id AND ((SELECT auth.uid())=m.sender_id OR (SELECT auth.uid())=m.receiver_id)));
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='message_reactions') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='message_pins') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.message_pins;
    END IF;
  END IF;
END $$;


-- Supabase API roles need explicit table privileges in addition to RLS policies.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.message_reactions TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.message_pins TO authenticated;
