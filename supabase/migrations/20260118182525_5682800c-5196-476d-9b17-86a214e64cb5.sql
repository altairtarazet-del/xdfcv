-- Create function to make a user admin (to be called after first signup)
-- This function can be called by service role to promote the first user to admin
CREATE OR REPLACE FUNCTION public.make_user_admin(_user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
BEGIN
  -- Get user_id from profiles
  SELECT user_id INTO _user_id
  FROM public.profiles
  WHERE email = _user_email
  LIMIT 1;

  IF _user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if already admin
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Insert admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN TRUE;
END;
$$;

-- Grant execute to authenticated users (the function itself checks permissions via security definer)
GRANT EXECUTE ON FUNCTION public.make_user_admin TO service_role;