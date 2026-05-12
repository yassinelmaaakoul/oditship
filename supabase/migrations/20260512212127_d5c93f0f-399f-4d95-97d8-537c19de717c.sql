
ALTER TABLE public.pricing_packs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE public.pricing_packs SET status = 'active' WHERE status IS NULL OR status NOT IN ('draft','active');

-- Replace livreur RLS policy: limit insert/update/delete to draft packs only.
DROP POLICY IF EXISTS "Livreurs manage own pricing packs" ON public.pricing_packs;

CREATE POLICY "Livreurs view own pricing packs"
ON public.pricing_packs FOR SELECT
TO authenticated
USING (scope = 'livreur' AND owner_id = auth.uid());

CREATE POLICY "Livreurs insert draft packs"
ON public.pricing_packs FOR INSERT
TO authenticated
WITH CHECK (scope = 'livreur' AND owner_id = auth.uid() AND status = 'draft');

CREATE POLICY "Livreurs update own draft packs"
ON public.pricing_packs FOR UPDATE
TO authenticated
USING (scope = 'livreur' AND owner_id = auth.uid() AND status = 'draft')
WITH CHECK (scope = 'livreur' AND owner_id = auth.uid() AND status = 'draft');

CREATE POLICY "Livreurs delete own draft packs"
ON public.pricing_packs FOR DELETE
TO authenticated
USING (scope = 'livreur' AND owner_id = auth.uid() AND status = 'draft');

-- Pack links: livreurs may only manage links of their DRAFT packs.
DROP POLICY IF EXISTS "Livreurs manage own pricing pack links" ON public.pricing_pack_links;

CREATE POLICY "Livreurs manage own draft pack links"
ON public.pricing_pack_links FOR ALL
TO authenticated
USING (
  pack_id IN (
    SELECT id FROM public.pricing_packs
    WHERE scope = 'livreur' AND owner_id = auth.uid() AND status = 'draft'
  )
)
WITH CHECK (
  pack_id IN (
    SELECT id FROM public.pricing_packs
    WHERE scope = 'livreur' AND owner_id = auth.uid() AND status = 'draft'
  )
);
