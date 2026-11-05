-- Keep exact-phone lookup functional without disclosing the matched user's phone number.
-- The frontend only needs user_id, display_name, and avatar_url to start a conversation.
CREATE OR REPLACE FUNCTION public.find_farnaz_user_by_phone(search_phone text)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, phone text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.display_name, p.avatar_url, NULL::text AS phone
  FROM public.profiles AS p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND public.normalize_farnaz_phone(p.phone) <> ''
    AND public.normalize_farnaz_phone(p.phone) = public.normalize_farnaz_phone(search_phone)
  ORDER BY p.created_at ASC
  LIMIT 1;
$function$;
