-- Permit user-selected emoji reactions while keeping values bounded.
ALTER TABLE public.message_reactions DROP CONSTRAINT IF EXISTS message_reactions_emoji_check;
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_emoji_check
  CHECK (char_length(emoji) BETWEEN 1 AND 16 AND emoji !~ '[[:space:]]');
