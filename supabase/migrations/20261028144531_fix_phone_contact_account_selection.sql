CREATE OR REPLACE FUNCTION public.sync_farnaz_phone_contacts(p_contacts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_phone_item jsonb;
  v_phones jsonb;
  v_name text;
  v_phone_text text;
  v_digits text;
  v_phone text;
  v_primary_phone text;
  v_group_id uuid;
  v_matched_user_id uuid;
  v_single_match uuid;
  v_selected_match uuid;
  v_match_count integer;
  v_imported integer := 0;
  v_processed integer := 0;
  v_matched integer := 0;
  v_unmatched integer := 0;
  v_rows integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_contacts) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Contacts must be an array'; END IF;
  IF jsonb_array_length(p_contacts) > 5000 THEN RAISE EXCEPTION 'Too many contacts in one import'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_contacts) LOOP
    v_name := left(coalesce(nullif(btrim(v_item->>'display_name'), ''), 'Contact'), 120);
    v_phones := CASE
      WHEN jsonb_typeof(v_item->'phones') = 'array' THEN v_item->'phones'
      WHEN nullif(v_item->>'phone','') IS NOT NULL THEN jsonb_build_array(v_item->>'phone')
      ELSE '[]'::jsonb
    END;
    IF jsonb_array_length(v_phones) = 0 THEN CONTINUE; END IF;

    v_group_id := NULL;
    SELECT upc.contact_group_id INTO v_group_id
    FROM public.user_phone_contacts upc
    WHERE upc.user_id = v_user_id
      AND regexp_replace(upc.phone, '[^0-9]', '', 'g') IN (
        SELECT regexp_replace(value #>> '{}', '[^0-9]', '', 'g')
        FROM jsonb_array_elements(v_phones)
      )
    ORDER BY upc.updated_at DESC
    LIMIT 1;
    v_group_id := coalesce(v_group_id, gen_random_uuid());

    v_primary_phone := nullif(v_item->>'primary_phone','');
    IF v_primary_phone IS NULL THEN v_primary_phone := v_phones->>0; END IF;
    v_primary_phone := '+' || regexp_replace(coalesce(v_primary_phone,''), '[^0-9]', '', 'g');

    FOR v_phone_item IN SELECT value FROM jsonb_array_elements(v_phones) LOOP
      v_phone_text := CASE
        WHEN jsonb_typeof(v_phone_item) = 'string' THEN v_phone_item #>> '{}'
        ELSE coalesce(v_phone_item->>'phone','')
      END;
      v_digits := regexp_replace(coalesce(v_phone_text,''), '[^0-9]', '', 'g');
      IF length(v_digits) NOT BETWEEN 8 AND 15 THEN CONTINUE; END IF;
      v_phone := '+' || v_digits;
      v_processed := v_processed + 1;

      SELECT p.id INTO v_matched_user_id
      FROM public.profiles p
      WHERE p.id <> v_user_id
        AND p.phone IS NOT NULL
        AND regexp_replace(p.phone, '[^0-9]', '', 'g') = v_digits
      ORDER BY p.created_at ASC
      LIMIT 1;

      INSERT INTO public.user_phone_contacts(
        user_id, display_name, phone, matched_user_id, updated_at,
        contact_group_id, is_primary
      )
      VALUES(v_user_id, v_name, v_phone, v_matched_user_id, now(), v_group_id, false)
      ON CONFLICT(user_id, phone) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          matched_user_id = EXCLUDED.matched_user_id,
          updated_at = now(),
          contact_group_id = v_group_id,
          is_primary = false;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_imported := v_imported + v_rows;
      IF v_matched_user_id IS NULL THEN v_unmatched := v_unmatched + 1;
      ELSE v_matched := v_matched + 1;
      END IF;
    END LOOP;

    UPDATE public.user_phone_contacts
      SET is_primary = (phone = v_primary_phone)
    WHERE user_id = v_user_id AND contact_group_id = v_group_id;

    IF NOT EXISTS (
      SELECT 1 FROM public.user_phone_contacts
      WHERE user_id = v_user_id AND contact_group_id = v_group_id AND is_primary
    ) THEN
      UPDATE public.user_phone_contacts
      SET is_primary = true
      WHERE id = (
        SELECT id FROM public.user_phone_contacts
        WHERE user_id = v_user_id AND contact_group_id = v_group_id
        ORDER BY updated_at DESC, id
        LIMIT 1
      );
    END IF;

    SELECT count(DISTINCT matched_user_id),
           (array_agg(DISTINCT matched_user_id) FILTER (WHERE matched_user_id IS NOT NULL))[1]
      INTO v_match_count, v_single_match
    FROM public.user_phone_contacts
    WHERE user_id = v_user_id AND contact_group_id = v_group_id;

    SELECT (array_agg(DISTINCT selected_user_id) FILTER (WHERE selected_user_id IS NOT NULL))[1]
      INTO v_selected_match
    FROM public.user_phone_contacts
    WHERE user_id = v_user_id AND contact_group_id = v_group_id;

    IF v_selected_match IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_phone_contacts
      WHERE user_id = v_user_id AND contact_group_id = v_group_id
        AND matched_user_id = v_selected_match
    ) THEN
      INSERT INTO public.contacts(user_id, contact_user_id)
      VALUES(v_user_id, v_selected_match)
      ON CONFLICT(user_id, contact_user_id) DO NOTHING;
    ELSIF v_match_count = 1 AND v_single_match <> v_user_id THEN
      INSERT INTO public.contacts(user_id, contact_user_id)
      VALUES(v_user_id, v_single_match)
      ON CONFLICT(user_id, contact_user_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'saved_rows', v_imported,
    'matched', v_matched,
    'unmatched', v_unmatched
  );
END;
$function$
