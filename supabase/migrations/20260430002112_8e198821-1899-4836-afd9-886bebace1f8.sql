ALTER TABLE public.livreur_api_settings
ADD COLUMN IF NOT EXISTS webhook_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_livreur_api_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.polling_interval_minutes < 1 THEN
    RAISE EXCEPTION 'polling_interval_minutes must be at least 1';
  END IF;

  IF NEW.rate_limit_per_second <= 0 THEN
    RAISE EXCEPTION 'rate_limit_per_second must be greater than 0';
  END IF;

  IF NEW.create_package_method NOT IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE') THEN
    RAISE EXCEPTION 'create_package_method is invalid';
  END IF;

  IF NEW.polling_status_method NOT IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE') THEN
    RAISE EXCEPTION 'polling_status_method is invalid';
  END IF;

  RETURN NEW;
END;
$$;