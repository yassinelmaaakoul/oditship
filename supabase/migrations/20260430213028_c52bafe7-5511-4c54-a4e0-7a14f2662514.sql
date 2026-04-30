ALTER TABLE public.livreur_api_settings
  ADD COLUMN IF NOT EXISTS polling_driver_name_field text NOT NULL DEFAULT 'transport.currentDriverName',
  ADD COLUMN IF NOT EXISTS polling_driver_phone_field text NOT NULL DEFAULT 'transport.currentDriverPhone',
  ADD COLUMN IF NOT EXISTS polling_extra_fields_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS webhook_order_fields_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS polling_order_fields_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;