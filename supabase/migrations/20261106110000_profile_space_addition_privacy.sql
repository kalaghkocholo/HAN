-- Let users opt out of being directly added to groups and channels.
-- Self-joining through a public channel or invite link remains available.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_space_additions boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.enforce_space_addition_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_allow boolean;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.space_members sm
    WHERE sm.space_id = NEW.space_id
      AND sm.user_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    SELECT p.allow_space_additions
      INTO v_allow
      FROM public.profiles p
     WHERE p.id = NEW.user_id;

    IF FOUND AND v_allow IS FALSE THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'space_additions_disabled';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_space_addition_preference() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_space_addition_preference ON public.space_members;
CREATE TRIGGER enforce_space_addition_preference
BEFORE INSERT ON public.space_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_space_addition_preference();
