ALTER TABLE public.conversation_preferences
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.conversation_preferences
  DROP CONSTRAINT IF EXISTS conversation_preferences_display_name_length;

ALTER TABLE public.conversation_preferences
  ADD CONSTRAINT conversation_preferences_display_name_length
  CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 120);
