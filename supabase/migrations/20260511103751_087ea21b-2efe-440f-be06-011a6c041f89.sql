
-- Pickup cities
CREATE TABLE public.pickup_cities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pickup_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pickup cities readable by everyone" ON public.pickup_cities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Administrators manage pickup cities" ON public.pickup_cities FOR ALL TO authenticated USING (has_role(auth.uid(), 'administrateur')) WITH CHECK (has_role(auth.uid(), 'administrateur'));

-- Pricing packs
CREATE TABLE public.pricing_packs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  delivery_fee NUMERIC NOT NULL DEFAULT 0,
  refusal_fee NUMERIC NOT NULL DEFAULT 0,
  annulation_fee NUMERIC NOT NULL DEFAULT 0,
  delivery_delay_hours INTEGER NOT NULL DEFAULT 48,
  scope TEXT NOT NULL DEFAULT 'global', -- global | vendeur | livreur
  owner_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pricing_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing packs readable by everyone" ON public.pricing_packs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Administrators manage pricing packs" ON public.pricing_packs FOR ALL TO authenticated USING (has_role(auth.uid(), 'administrateur')) WITH CHECK (has_role(auth.uid(), 'administrateur'));
CREATE TRIGGER pricing_packs_updated_at BEFORE UPDATE ON public.pricing_packs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pricing pack links (pickup x destination)
CREATE TABLE public.pricing_pack_links (
  id SERIAL PRIMARY KEY,
  pack_id INTEGER NOT NULL REFERENCES public.pricing_packs(id) ON DELETE CASCADE,
  pickup_city TEXT NOT NULL DEFAULT '*', -- '*' = toutes
  destination_city TEXT NOT NULL DEFAULT '*',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pack_id, pickup_city, destination_city)
);
CREATE INDEX idx_pack_links_lookup ON public.pricing_pack_links(pickup_city, destination_city);
ALTER TABLE public.pricing_pack_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing pack links readable by everyone" ON public.pricing_pack_links FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Administrators manage pricing pack links" ON public.pricing_pack_links FOR ALL TO authenticated USING (has_role(auth.uid(), 'administrateur')) WITH CHECK (has_role(auth.uid(), 'administrateur'));
