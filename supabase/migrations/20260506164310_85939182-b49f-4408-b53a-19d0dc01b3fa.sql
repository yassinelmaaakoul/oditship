DROP TABLE IF EXISTS public.livreur_api_settings CASCADE;
DROP FUNCTION IF EXISTS public.validate_livreur_api_settings() CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS authentication_config;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS create_package_config;