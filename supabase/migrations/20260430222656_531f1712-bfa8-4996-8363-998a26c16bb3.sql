
ALTER TABLE public.order_status_history
  ADD COLUMN IF NOT EXISTS actor_label text;

ALTER TABLE public.livreur_api_settings
  ADD COLUMN IF NOT EXISTS webhook_actor_field text NOT NULL DEFAULT 'lastmsg',
  ADD COLUMN IF NOT EXISTS polling_actor_field text NOT NULL DEFAULT 'lastmsg';
