-- Applied to Supabase as migration 20261021172800.
-- Restrict private attachment paths to the authenticated message sender.
CREATE POLICY "Message attachments must belong to sender"
ON public.messages
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  attachment_path IS NULL
  OR split_part(attachment_path, '/', 1) = (SELECT auth.uid())::text
);
