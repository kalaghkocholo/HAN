-- Farnaz security and message query hardening
-- Applied to the Farnaz-app Supabase project as migration 20261021170946.

DROP INDEX IF EXISTS public.contacts_user_contact_unique;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_message_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Message identity and participants cannot be changed';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.prevent_message_identity_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_message_identity_change ON public.messages;
CREATE TRIGGER prevent_message_identity_change
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.prevent_message_identity_change();

DROP POLICY IF EXISTS "Users can send messages as themselves" ON public.messages;
CREATE POLICY "Users can send messages as themselves"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = sender_id
  AND sender_id <> receiver_id
  AND (
    (body IS NOT NULL AND char_length(trim(body)) > 0 AND char_length(body) <= 5000)
    OR attachment_path IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Users can edit their own messages" ON public.messages;
CREATE POLICY "Users can edit their own messages"
ON public.messages FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = sender_id)
WITH CHECK ((SELECT auth.uid()) = sender_id);

DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
CREATE POLICY "Users can delete their own messages"
ON public.messages FOR DELETE TO authenticated
USING ((SELECT auth.uid()) = sender_id);

DROP POLICY IF EXISTS "Users manage their conversation preferences" ON public.conversation_preferences;
CREATE POLICY "Users manage their conversation preferences"
ON public.conversation_preferences FOR ALL TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users manage hidden messages" ON public.message_hidden;
CREATE POLICY "Users manage hidden messages"
ON public.message_hidden FOR ALL TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_hidden.message_id
      AND (m.sender_id = (SELECT auth.uid()) OR m.receiver_id = (SELECT auth.uid()))
  )
)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_hidden.message_id
      AND (m.sender_id = (SELECT auth.uid()) OR m.receiver_id = (SELECT auth.uid()))
  )
);

CREATE INDEX IF NOT EXISTS messages_sender_receiver_created_at_idx
  ON public.messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_receiver_sender_created_at_idx
  ON public.messages (receiver_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_reply_to_id_idx
  ON public.messages (reply_to_id);
CREATE INDEX IF NOT EXISTS contacts_contact_user_id_idx
  ON public.contacts (contact_user_id);
CREATE INDEX IF NOT EXISTS conversation_preferences_contact_user_id_idx
  ON public.conversation_preferences (contact_user_id);
CREATE INDEX IF NOT EXISTS message_hidden_message_id_idx
  ON public.message_hidden (message_id);
