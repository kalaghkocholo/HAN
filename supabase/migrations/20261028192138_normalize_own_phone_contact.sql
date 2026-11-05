-- Normalize the account's own profile/auth phone before comparing it with
-- selected contacts, so 09..., 989..., and +989... forms are treated equally.
CREATE OR REPLACE FUNCTION public.sync_farnaz_phone_contacts(p_contacts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_own_digits text[];
  v_item jsonb;
  v_phone_item jsonb;
  v_phones jsonb;
  v_kept_phones jsonb;
  v_phone_text text;
  v_digits text;
  v_primary_digits text;
  v_primary_phone text;
  v_filtered jsonb := '[]'::jsonb;
  v_result jsonb;
  v_skipped_self integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_contacts) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Contacts must be an array'; END IF;
  IF jsonb_array_length(p_contacts) > 5000 THEN RAISE EXCEPTION 'Too many contacts in one import'; END IF;

  SELECT array_remove(ARRAY[
    nullif(regexp_replace(coalesce(public.normalize_farnaz_phone(p.phone), ''), '[^0-9]', '', 'g'), ''),
    nullif(regexp_replace(coalesce(public.normalize_farnaz_phone(u.phone), ''), '[^0-9]', '', 'g'), '')
  ], NULL)
  INTO v_own_digits
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_user_id;

  v_own_digits := coalesce(v_own_digits, ARRAY[]::text[]);

  DELETE FROM public.user_phone_contacts upc
  WHERE upc.user_id = v_user_id
    AND (
      regexp_replace(coalesce(public.normalize_farnaz_phone(upc.phone), ''), '[^0-9]', '', 'g') = ANY(v_own_digits)
      OR upc.matched_user_id = v_user_id
    );

  DELETE FROM public.contacts
  WHERE user_id = v_user_id AND contact_user_id = v_user_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_contacts) LOOP
    v_phones := CASE
      WHEN jsonb_typeof(v_item->'phones') = 'array' THEN v_item->'phones'
      WHEN nullif(v_item->>'phone', '') IS NOT NULL THEN jsonb_build_array(v_item->>'phone')
      ELSE '[]'::jsonb
    END;
    v_kept_phones := '[]'::jsonb;

    FOR v_phone_item IN SELECT value FROM jsonb_array_elements(v_phones) LOOP
      v_phone_text := CASE
        WHEN jsonb_typeof(v_phone_item) = 'string' THEN v_phone_item #>> '{}'
        ELSE coalesce(v_phone_item->>'phone', '')
      END;
      v_digits := regexp_replace(coalesce(v_phone_text, ''), '[^0-9]', '', 'g');
      IF length(v_digits) NOT BETWEEN 8 AND 15 THEN CONTINUE; END IF;
      IF v_digits = ANY(v_own_digits) THEN
        v_skipped_self := v_skipped_self + 1;
        CONTINUE;
      END IF;
      v_kept_phones := v_kept_phones || jsonb_build_array('+' || v_digits);
    END LOOP;

    IF jsonb_array_length(v_kept_phones) = 0 THEN CONTINUE; END IF;
    v_primary_digits := regexp_replace(coalesce(v_item->>'primary_phone', ''), '[^0-9]', '', 'g');
    IF v_primary_digits = ANY(v_own_digits) OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_kept_phones) ph(value)
      WHERE regexp_replace(ph.value, '[^0-9]', '', 'g') = v_primary_digits
    ) THEN
      v_primary_phone := v_kept_phones->>0;
    ELSE
      v_primary_phone := '+' || v_primary_digits;
    END IF;

    v_filtered := v_filtered || jsonb_build_array(jsonb_build_object(
      'display_name', coalesce(v_item->>'display_name', 'Contact'),
      'phones', v_kept_phones,
      'primary_phone', v_primary_phone
    ));
  END LOOP;

  v_result := public.sync_farnaz_phone_contacts_pre_self_filter(v_filtered);
  RETURN coalesce(v_result, '{}'::jsonb) || jsonb_build_object('skipped_self', v_skipped_self);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_farnaz_phone_contacts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_farnaz_phone_contacts(jsonb) TO authenticated;
