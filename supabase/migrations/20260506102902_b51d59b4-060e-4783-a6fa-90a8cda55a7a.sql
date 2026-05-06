-- Track scheduled & recurring API operation runs per livreur
CREATE TABLE IF NOT EXISTS public.livreur_scheduled_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  livreur_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  operation_key text NOT NULL,
  trigger text NOT NULL,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (livreur_id, operation_key)
);

ALTER TABLE public.livreur_scheduled_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage scheduled runs"
  ON public.livreur_scheduled_runs
  FOR ALL
  USING (public.has_role(auth.uid(), 'administrateur'))
  WITH CHECK (public.has_role(auth.uid(), 'administrateur'));

CREATE TRIGGER update_livreur_scheduled_runs_updated_at
  BEFORE UPDATE ON public.livreur_scheduled_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
