
-- Workflows definitions
CREATE TABLE public.livreur_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  livreur_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_livreur_workflows_livreur ON public.livreur_workflows(livreur_id);
CREATE INDEX idx_livreur_workflows_enabled ON public.livreur_workflows(enabled) WHERE enabled = true;

ALTER TABLE public.livreur_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage workflows" ON public.livreur_workflows
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrateur'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrateur'::app_role));

CREATE POLICY "Livreurs view their workflows" ON public.livreur_workflows
  FOR SELECT TO authenticated
  USING (livreur_id = auth.uid());

CREATE TRIGGER trg_workflows_updated
  BEFORE UPDATE ON public.livreur_workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Workflow execution runs
CREATE TABLE public.livreur_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  livreur_id uuid NOT NULL,
  order_id integer,
  trigger_type text NOT NULL,
  trigger_payload jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  step_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  output jsonb DEFAULT '{}'::jsonb,
  is_test boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_workflow_runs_workflow ON public.livreur_workflow_runs(workflow_id, started_at DESC);
CREATE INDEX idx_workflow_runs_order ON public.livreur_workflow_runs(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.livreur_workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage workflow runs" ON public.livreur_workflow_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrateur'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrateur'::app_role));

CREATE POLICY "Livreurs view their workflow runs" ON public.livreur_workflow_runs
  FOR SELECT TO authenticated
  USING (livreur_id = auth.uid());

-- Workflow schedules tracking
CREATE TABLE public.livreur_workflow_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  trigger_key text NOT NULL,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_status text,
  last_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, trigger_key)
);

ALTER TABLE public.livreur_workflow_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage workflow schedules" ON public.livreur_workflow_schedules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrateur'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrateur'::app_role));
