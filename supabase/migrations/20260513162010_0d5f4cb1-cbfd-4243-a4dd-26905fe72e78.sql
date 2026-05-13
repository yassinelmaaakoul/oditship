UPDATE public.livreur_workflows
SET steps = jsonb_set(
  steps,
  '{4,config,steps}',
  ('[{"id":"throttle","name":"Délai anti rate-limit","type":"delay","config":{"ms":600},"enabled":true}]'::jsonb) || (steps->4->'config'->'steps')
),
updated_at = now()
WHERE id='bb381e9c-e4ab-43b6-bc07-0ea4377f6569';