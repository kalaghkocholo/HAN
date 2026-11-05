CREATE OR REPLACE FUNCTION public.start_farnaz_call(
  p_receiver_id uuid,
  p_call_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_session public.call_sessions%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_receiver_id IS NULL OR p_receiver_id = v_caller_id THEN
    RAISE EXCEPTION 'Invalid call recipient';
  END IF;

  IF p_call_type NOT IN ('audio', 'video') THEN
    RAISE EXCEPTION 'Invalid call type';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts AS c
    WHERE c.user_id = v_caller_id
      AND c.contact_user_id = p_receiver_id
  ) THEN
    RAISE EXCEPTION 'Calls are limited to saved contacts' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocked_contacts AS b
    WHERE (b.blocker_id = v_caller_id AND b.blocked_user_id = p_receiver_id)
       OR (b.blocker_id = p_receiver_id AND b.blocked_user_id = v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Calls are not allowed for blocked contacts' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.call_sessions (caller_id, receiver_id, call_type, status)
  VALUES (v_caller_id, p_receiver_id, p_call_type, 'ringing')
  RETURNING * INTO v_session;

  RETURN to_jsonb(v_session);
END;
$function$;

REVOKE ALL ON FUNCTION public.start_farnaz_call(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_farnaz_call(uuid, text) TO authenticated;
