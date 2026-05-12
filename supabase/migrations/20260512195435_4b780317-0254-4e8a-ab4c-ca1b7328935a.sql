
-- 1) Bump orders.updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.touch_orders_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_touch_updated_at ON public.orders;
CREATE TRIGGER trg_orders_touch_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.touch_orders_updated_at();

-- 2) When a status-history row is inserted, bump the parent order's updated_at
--    so list sorting reflects the latest activity even when status didn't change.
CREATE OR REPLACE FUNCTION public.bump_order_on_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.orders SET updated_at = COALESCE(NEW.changed_at, now())
  WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_history_bump_order ON public.order_status_history;
CREATE TRIGGER trg_history_bump_order
AFTER INSERT ON public.order_status_history
FOR EACH ROW EXECUTE FUNCTION public.bump_order_on_history();

-- 3) Allow livreurs to manage their OWN livreur-scope pricing packs and links
CREATE POLICY "Livreurs manage own pricing packs"
ON public.pricing_packs
FOR ALL TO authenticated
USING (scope = 'livreur' AND owner_id = auth.uid())
WITH CHECK (scope = 'livreur' AND owner_id = auth.uid());

CREATE POLICY "Livreurs manage own pricing pack links"
ON public.pricing_pack_links
FOR ALL TO authenticated
USING (
  pack_id IN (SELECT id FROM public.pricing_packs WHERE scope = 'livreur' AND owner_id = auth.uid())
)
WITH CHECK (
  pack_id IN (SELECT id FROM public.pricing_packs WHERE scope = 'livreur' AND owner_id = auth.uid())
);
