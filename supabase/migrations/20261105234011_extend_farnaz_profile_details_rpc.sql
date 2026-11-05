-- Expose username and about-me details through the same relationship-gated profile lookup.
-- Phone visibility remains restricted to saved contacts who are allowed to see it.

CREATE OR REPLACE FUNCTION public.get_farnaz_user_profile_details(search_user_id uuid)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, phone text, username text, about text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p.id, p.display_name, p.avatar_url,
         CASE WHEN p.show_phone IS TRUE AND EXISTS (
           SELECT 1 FROM public.contacts c
           WHERE c.user_id = auth.uid()
             AND c.contact_user_id = search_user_id
         ) THEN p.phone ELSE NULL::text END AS phone,
         p.username,
         p.about
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id = search_user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.messages m
        WHERE (m.sender_id = auth.uid() AND m.receiver_id = search_user_id)
           OR (m.receiver_id = auth.uid() AND m.sender_id = search_user_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.user_id = auth.uid() AND c.contact_user_id = search_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.space_members sm
        WHERE sm.user_id = search_user_id
          AND private.is_space_member(sm.space_id)
      )
    )
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_farnaz_user_profile_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_farnaz_user_profile_details(uuid) TO authenticated;
