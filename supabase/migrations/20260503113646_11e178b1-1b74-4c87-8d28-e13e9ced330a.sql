CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _username TEXT;
  _role_text TEXT;
  _role_enum public.app_role;
BEGIN
  _username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  _role_text := COALESCE(NEW.raw_user_meta_data->>'role', 'vendeur');
  BEGIN
    _role_enum := _role_text::public.app_role;
  EXCEPTION WHEN others THEN
    _role_enum := 'vendeur'::public.app_role;
  END;

  INSERT INTO public.profiles (
    id, username, role, full_name, phone, cin, city, affiliation_code, is_active
  ) VALUES (
    NEW.id,
    _username,
    _role_text,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'cin',
    NEW.raw_user_meta_data->>'city',
    NEW.raw_user_meta_data->>'affiliation_code',
    true
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role_enum)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;