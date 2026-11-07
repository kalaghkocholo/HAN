-- Require a live Auth session inside every exposed SECURITY DEFINER RPC callable by authenticated users.
-- RLS policies do not protect queries executed by SECURITY DEFINER functions.

CREATE OR REPLACE FUNCTION public.choose_farnaz_phone_contact_account(p_contact_group_id uuid, p_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT private.farnaz_has_active_auth_session() THEN
    RAISE EXCEPTION 'Active authenticated session required' USING ERRCODE = '42501';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.find_farnaz_user(search_email text)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, phone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF NOT private.farnaz_has_active_auth_session() THEN
    RAISE EXCEPTION 'Active authenticated session required' USING ERRCODE = '42501';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO private.farnaz_user_search_limits AS limits
    (user_id, window_started_at, attempt_count)
  VALUES (v_uid, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET window_started_at = CASE
          WHEN now() - limits.window_started_at >= interval '10 minutes' THEN now()
          ELSE limits.window_started_at
        END,
        attempt_count = CASE
          WHEN now() - limits.window_started_at >= interval '10 minutes' THEN 1
          ELSE limits.attempt_count + 1
        END
  RETURNING attempt_count INTO v_count;

  IF v_count > 20 THEN
    RAISE EXCEPTION 'Too many user searches. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, NULL::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = lower(btrim(search_email))
     OR (
       nullif(regexp_replace(coalesce(p.phone, ''), '[^0-9+]', '', 'g'), '') IS NOT NULL
       AND regexp_replace(coalesce(p.phone, ''), '[^0-9+]', '', 'g')
           = regexp_replace(coalesce(search_email, ''), '[^0-9+]', '', 'g')
     )
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_farnaz_user_by_phone(search_phone text)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, phone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF NOT private.farnaz_has_active_auth_session() THEN
    RAISE EXCEPTION 'Active authenticated session required' USING ERRCODE = '42501';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO private.farnaz_user_search_limits AS limits
    (user_id, window_started_at, attempt_count)
  VALUES (v_uid, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET window_started_at = CASE
          WHEN now() - limits.window_started_at >= interval '10 minutes' THEN now()
          ELSE limits.window_started_at
        END,
        attempt_count = CASE
          WHEN now() - limits.window_started_at >= interval '10 minutes' THEN 1
          ELSE limits.attempt_count + 1
        END
  RETURNING attempt_count INTO v_count;

  IF v_count > 20 THEN
    RAISE EXCEPTION 'Too many user searches. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, NULL::text
  FROM public.profiles p
  WHERE p.id <> v_uid
    AND public.normalize_farnaz_phone(p.phone) <> ''
    AND public.normalize_farnaz_phone(p.phone) = public.normalize_farnaz_phone(search_phone)
  ORDER BY p.created_at ASC
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_farnaz_mutual_contact_ids()
 RETURNS TABLE(contact_user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.contact_user_id
  from public.contacts a
  join public.contacts b
    on b.user_id = a.contact_user_id
   and b.contact_user_id = a.user_id
  where (
    a.user_id = auth.uid()
    and a.contact_user_id <> auth.uid()
    and not exists (
      select 1 from public.blocked_contacts bl
      where (bl.blocker_id = auth.uid() and bl.blocked_user_id = a.contact_user_id)
         or (bl.blocker_id = a.contact_user_id and bl.blocked_user_id = auth.uid())
    )
  )
    and private.farnaz_has_active_auth_session()
  ;
$function$;

CREATE OR REPLACE FUNCTION public.get_farnaz_presence_status(p_user_id uuid)
 RETURNS TABLE(is_online boolean, last_seen_at timestamp with time zone, can_see_online boolean, can_see_last_seen boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    (
      exists (
        select 1 from private.farnaz_presence_sessions s
        where s.user_id = p.id
          and s.is_active = true
          and s.last_seen_at > now() - interval '90 seconds'
      )
      and (
        p.id = auth.uid()
        or (
          coalesce(p.presence_visibility, 'contacts') <> 'nobody'
          and exists (
            select 1 from public.contacts a
            join public.contacts b
              on b.user_id = a.contact_user_id
             and b.contact_user_id = a.user_id
            where a.user_id = auth.uid()
              and a.contact_user_id = p.id
          )
          and not exists (
            select 1 from public.blocked_contacts bl
            where (bl.blocker_id = auth.uid() and bl.blocked_user_id = p.id)
               or (bl.blocker_id = p.id and bl.blocked_user_id = auth.uid())
          )
        )
      )
    ) as is_online,
    case
      when p.id = auth.uid() then p.last_seen_at
      when not exists (
        select 1 from public.blocked_contacts bl
        where (bl.blocker_id = auth.uid() and bl.blocked_user_id = p.id)
           or (bl.blocker_id = p.id and bl.blocked_user_id = auth.uid())
      ) and (
        p.last_seen_visibility = 'everyone'
        or (
          p.last_seen_visibility = 'contacts'
          and exists (
            select 1 from public.contacts a
            join public.contacts b
              on b.user_id = a.contact_user_id
             and b.contact_user_id = a.user_id
            where a.user_id = auth.uid()
              and a.contact_user_id = p.id
          )
        )
      )
      then p.last_seen_at else null
    end as last_seen_at,
    (
      p.id = auth.uid()
      or (
        coalesce(p.presence_visibility, 'contacts') <> 'nobody'
        and exists (
          select 1 from public.contacts a
          join public.contacts b
            on b.user_id = a.contact_user_id
           and b.contact_user_id = a.user_id
          where a.user_id = auth.uid()
            and a.contact_user_id = p.id
        )
        and not exists (
          select 1 from public.blocked_contacts bl
          where (bl.blocker_id = auth.uid() and bl.blocked_user_id = p.id)
             or (bl.blocker_id = p.id and bl.blocked_user_id = auth.uid())
        )
      )
    ) as can_see_online,
    (
      p.id = auth.uid()
      or (
        not exists (
          select 1 from public.blocked_contacts bl
          where (bl.blocker_id = auth.uid() and bl.blocked_user_id = p.id)
             or (bl.blocker_id = p.id and bl.blocked_user_id = auth.uid())
        )
        and (
          p.last_seen_visibility = 'everyone'
          or (
            p.last_seen_visibility = 'contacts'
            and exists (
              select 1 from public.contacts a
              join public.contacts b
                on b.user_id = a.contact_user_id
               and b.contact_user_id = a.user_id
              where a.user_id = auth.uid()
                and a.contact_user_id = p.id
            )
          )
        )
      )
    ) as can_see_last_seen
  from public.profiles p
  where (
    auth.uid() is not null and p.id = p_user_id
  )
    and private.farnaz_has_active_auth_session()
  ;
$function$;

CREATE OR REPLACE FUNCTION public.get_farnaz_user_profile(search_user_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, phone text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.avatar_url,
         case when p.show_phone is true and exists (
           select 1 from public.contacts c
           where c.user_id = auth.uid()
             and c.contact_user_id = search_user_id
         ) then p.phone else null::text end as phone
  from public.profiles p
  where (
    auth.uid() is not null
    and p.id = search_user_id
    and (
      exists (
        select 1 from public.messages m
        where (m.sender_id = auth.uid() and m.receiver_id = search_user_id)
           or (m.receiver_id = auth.uid() and m.sender_id = search_user_id)
      )
      or exists (
        select 1 from public.contacts c
        where c.user_id = auth.uid() and c.contact_user_id = search_user_id
      )
      or exists (
        select 1 from public.space_members sm
        where sm.user_id = search_user_id
          and private.is_space_member(sm.space_id)
      )
    )
  )
    and private.farnaz_has_active_auth_session()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_farnaz_user_profile_details(search_user_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, phone text, username text, about text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
  WHERE (
    auth.uid() IS NOT NULL
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
  )
    and private.farnaz_has_active_auth_session()
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_farnaz_user_profile_v2(search_user_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, phone text, username text, about text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.avatar_url,
         case when p.show_phone is true and exists (
           select 1 from public.contacts c
           where c.user_id = auth.uid()
             and c.contact_user_id = search_user_id
         ) then p.phone else null::text end as phone,
         p.username, p.about
  from public.profiles p
  where (
    auth.uid() is not null
    and p.id = search_user_id
    and (
      exists (
        select 1 from public.messages m
        where (m.sender_id = auth.uid() and m.receiver_id = search_user_id)
           or (m.receiver_id = auth.uid() and m.sender_id = search_user_id)
      )
      or exists (
        select 1 from public.contacts c
        where c.user_id = auth.uid() and c.contact_user_id = search_user_id
      )
      or exists (
        select 1 from public.space_members sm
        where sm.user_id = search_user_id
          and private.is_space_member(sm.space_id)
      )
    )
  )
    and private.farnaz_has_active_auth_session()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_farnaz_user_profiles(search_user_ids uuid[])
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.avatar_url,
         case when p.show_phone is true and exists (
           select 1
           from public.contacts c
           where c.user_id = auth.uid()
             and c.contact_user_id = p.id
         ) then p.phone else null::text end as phone
  from public.profiles p
  where (
    auth.uid() is not null
    and p.id <> auth.uid()
    and p.id = any(coalesce(search_user_ids, array[]::uuid[]))
    and (
      exists (
        select 1
        from public.messages m
        where (m.sender_id = auth.uid() and m.receiver_id = p.id)
           or (m.receiver_id = auth.uid() and m.sender_id = p.id)
      )
      or exists (
        select 1
        from public.contacts c
        where c.user_id = auth.uid()
          and c.contact_user_id = p.id
      )
      or exists (
        select 1
        from public.space_members sm
        where sm.user_id = p.id
          and private.is_space_member(sm.space_id)
      )
    )
  )
    and private.farnaz_has_active_auth_session()
  ;
$function$;

CREATE OR REPLACE FUNCTION public.get_farnaz_user_profiles_v2(search_user_ids uuid[])
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, phone text, username text, about text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.avatar_url,
         case when p.show_phone is true and exists (
           select 1
           from public.contacts c
           where c.user_id = auth.uid()
             and c.contact_user_id = p.id
         ) then p.phone else null::text end as phone,
         p.username, p.about
  from public.profiles p
  where (
    auth.uid() is not null
    and p.id <> auth.uid()
    and p.id = any(coalesce(search_user_ids, array[]::uuid[]))
    and (
      exists (
        select 1
        from public.messages m
        where (m.sender_id = auth.uid() and m.receiver_id = p.id)
           or (m.receiver_id = auth.uid() and m.sender_id = p.id)
      )
      or exists (
        select 1
        from public.contacts c
        where c.user_id = auth.uid()
          and c.contact_user_id = p.id
      )
      or exists (
        select 1
        from public.space_members sm
        where sm.user_id = p.id
          and private.is_space_member(sm.space_id)
      )
    )
  )
    and private.farnaz_has_active_auth_session()
  ;
$function$;

CREATE OR REPLACE FUNCTION public.get_space_member_profiles(p_space_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select sm.user_id, p.display_name, p.avatar_url, sm.role
  from public.space_members sm
  join public.spaces s on s.id = sm.space_id
  left join public.profiles p on p.id = sm.user_id
  where (
    auth.uid() is not null
    and s.id = p_space_id
    and s.type = 'group'
    and private.is_space_member(p_space_id)
    and (
      s.member_list_visibility <> 'managers'
      or private.can_manage_space(p_space_id)
    )
  )
    and private.farnaz_has_active_auth_session()
  order by case sm.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.display_name nulls last;
$function$;

CREATE OR REPLACE FUNCTION public.join_space_by_invite(p_invite_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_space_id uuid;
begin
  IF NOT private.farnaz_has_active_auth_session() THEN
    RAISE EXCEPTION 'Active authenticated session required' USING ERRCODE = '42501';
  END IF;

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_invite_code is null or length(trim(p_invite_code)) < 6 then
    raise exception 'Invalid invite code';
  end if;

  select s.id into v_space_id
  from public.spaces s
  where s.type in ('group', 'channel')
    and s.invite_code = upper(trim(p_invite_code));

  if v_space_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.space_members(space_id, user_id, role)
  values (v_space_id, auth.uid(), 'member')
  on conflict (space_id, user_id) do nothing;

  return v_space_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_farnaz_presence_session(p_session_id uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  IF NOT private.farnaz_has_active_auth_session() THEN
    RAISE EXCEPTION 'Active authenticated session required' USING ERRCODE = '42501';
  END IF;

  if auth.uid() is null or p_session_id is null then
    raise exception 'Authentication required';
  end if;

  insert into private.farnaz_presence_sessions(user_id, session_id, last_seen_at, is_active)
  values (auth.uid(), p_session_id, now(), coalesce(p_active, false))
  on conflict (user_id, session_id)
  do update set last_seen_at = excluded.last_seen_at, is_active = excluded.is_active;

  update public.profiles
  set last_seen_at = now()
  where id = auth.uid();
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_space_member_role(p_space_id uuid, p_user_id uuid, p_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  IF NOT private.farnaz_has_active_auth_session() THEN
    RAISE EXCEPTION 'Active authenticated session required' USING ERRCODE = '42501';
  END IF;

  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_role not in ('admin','member') then raise exception 'Invalid role'; end if;
  if not private.is_space_owner(p_space_id) then raise exception 'Only the group owner can change manager roles'; end if;
  if not exists (select 1 from public.space_members where space_id=p_space_id and user_id=p_user_id) then
    raise exception 'Member not found';
  end if;
  if exists (select 1 from public.space_members where space_id=p_space_id and user_id=p_user_id and role='owner') then
    raise exception 'Transfer ownership instead of changing the owner role';
  end if;
  update public.space_members set role=p_role where space_id=p_space_id and user_id=p_user_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_farnaz_call(p_receiver_id uuid, p_call_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_session public.call_sessions%ROWTYPE;
BEGIN
  IF NOT private.farnaz_has_active_auth_session() THEN
    RAISE EXCEPTION 'Active authenticated session required' USING ERRCODE = '42501';
  END IF;

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
    SELECT 1 FROM public.contacts AS c
    WHERE c.user_id = v_caller_id AND c.contact_user_id = p_receiver_id
  ) THEN
    RAISE EXCEPTION 'Calls are limited to saved contacts' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_contacts AS b
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
  IF NOT private.farnaz_has_active_auth_session() THEN
    RAISE EXCEPTION 'Active authenticated session required' USING ERRCODE = '42501';
  END IF;

  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_contacts) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Contacts must be an array';
  END IF;
  IF jsonb_array_length(p_contacts) > 5000 THEN
    RAISE EXCEPTION 'Too many contacts in one import';
  END IF;

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

CREATE OR REPLACE FUNCTION public.transfer_space_ownership(p_space_id uuid, p_new_owner_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old_owner uuid;
begin
  IF NOT private.farnaz_has_active_auth_session() THEN
    RAISE EXCEPTION 'Active authenticated session required' USING ERRCODE = '42501';
  END IF;

  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.is_space_owner(p_space_id) then raise exception 'Only the current owner can transfer ownership'; end if;
  if p_new_owner_id = auth.uid() then return true; end if;
  if not exists (select 1 from public.space_members where space_id=p_space_id and user_id=p_new_owner_id) then
    raise exception 'New owner must already be a group member';
  end if;
  update public.space_members set role='admin' where space_id=p_space_id and user_id=auth.uid();
  update public.space_members set role='owner' where space_id=p_space_id and user_id=p_new_owner_id;
  update public.spaces set created_by=p_new_owner_id, updated_at=now() where id=p_space_id;
  return true;
end;
$function$;
