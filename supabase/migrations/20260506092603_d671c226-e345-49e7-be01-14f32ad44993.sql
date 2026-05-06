UPDATE public.profiles
SET create_package_config = jsonb_set(
  COALESCE(create_package_config, '{}'::jsonb),
  '{operations}',
  '[
    {
      "name": "Olivraison Pickup",
      "trigger": "after_create",
      "url": "https://partners.olivraison.com/pickup",
      "method": "POST",
      "headers": {"Content-Type": "application/json"},
      "payload": {"packages": ["{{create_response.trackingID}}"]},
      "enabled": true
    }
  ]'::jsonb,
  true
)
WHERE id = 'b019ea14-bdee-479b-8eed-d4c4a05a7d67';