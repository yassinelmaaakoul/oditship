
REVOKE EXECUTE ON FUNCTION public.bump_order_on_history() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_orders_updated_at() FROM PUBLIC, anon, authenticated;
