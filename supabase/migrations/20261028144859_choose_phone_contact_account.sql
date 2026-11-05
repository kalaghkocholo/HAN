CREATE OR REPLACE FUNCTION public.choose_farnaz_phone_contact_account(p_contact_group_id uuid, p_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_contact_group_id IS NULL OR p_account_id IS NULL OR p_account_id = v_user_id THEN
    RAISE EXCEPTION 'Invalid contact account selection';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_phone_contacts upc
    WHERE upc.user_id = v_user_id
      AND upc.contact_group_id = p_contact_group_id
      AND upc.matched_user_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Selected account is not matched to this phone-book contact';
  END IF;

  UPDATE public.user_phone_contacts
  SET selected_user_id = p_account_id
  WHERE user_id = v_user_id AND contact_group_id = p_contact_group_id;

  INSERT INTO public.contacts(user_id, contact_user_id)
  VALUES(v_user_id, p_account_id)
  ON CONFLICT(user_id, contact_user_id) DO NOTHING;

  RETURN jsonb_build_object('selected', true);
END;
$function$


REVOKE EXECUTE ON FUNCTION public.choose_farnaz_phone_contact_account(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_farnaz_phone_contact_account(uuid, uuid) TO authenticated;
