import { supabase } from "@/integrations/supabase/client";

export interface ResolvedPrice {
  delivery_fee: number;
  refusal_fee: number;
  annulation_fee: number;
  delivery_delay_hours: number;
  source: "livreur" | "vendeur" | "global" | "fallback";
  pack_id?: number;
  pack_name?: string;
}

export interface PricingPack {
  id: number;
  name: string;
  delivery_fee: number;
  refusal_fee: number;
  annulation_fee: number;
  delivery_delay_hours: number;
  scope: "global" | "vendeur" | "livreur";
  owner_id: string | null;
}

export interface PricingPackLink {
  id: number;
  pack_id: number;
  pickup_city: string;
  destination_city: string;
}

const matches = (link: PricingPackLink, pickupCity: string | null, destCity: string) => {
  const pickupOk = link.pickup_city === "*" || (pickupCity && link.pickup_city === pickupCity);
  const destOk = link.destination_city === "*" || link.destination_city === destCity;
  return pickupOk && destOk;
};

const pickFromPacks = (
  packs: PricingPack[],
  links: PricingPackLink[],
  pickupCity: string | null,
  destCity: string,
  scope: "global" | "vendeur" | "livreur",
  ownerId?: string | null,
): PricingPack | null => {
  const candidatePacks = packs.filter(
    (p) => p.scope === scope && (scope === "global" || p.owner_id === ownerId),
  );
  // Prefer the most specific link (both non-wildcard)
  let best: { pack: PricingPack; specificity: number } | null = null;
  for (const pack of candidatePacks) {
    for (const link of links.filter((l) => l.pack_id === pack.id)) {
      if (!matches(link, pickupCity, destCity)) continue;
      const specificity = (link.pickup_city !== "*" ? 2 : 0) + (link.destination_city !== "*" ? 1 : 0);
      if (!best || specificity > best.specificity) best = { pack, specificity };
    }
  }
  return best?.pack ?? null;
};

export const resolvePrice = (
  packs: PricingPack[],
  links: PricingPackLink[],
  args: { pickupCity: string | null; destCity: string; vendeurId?: string | null; livreurId?: string | null },
): ResolvedPrice => {
  const { pickupCity, destCity, vendeurId, livreurId } = args;
  if (livreurId) {
    const p = pickFromPacks(packs, links, pickupCity, destCity, "livreur", livreurId);
    if (p) return { ...p, source: "livreur", pack_id: p.id, pack_name: p.name };
  }
  if (vendeurId) {
    const p = pickFromPacks(packs, links, pickupCity, destCity, "vendeur", vendeurId);
    if (p) return { ...p, source: "vendeur", pack_id: p.id, pack_name: p.name };
  }
  const g = pickFromPacks(packs, links, pickupCity, destCity, "global");
  if (g) return { ...g, source: "global", pack_id: g.id, pack_name: g.name };
  return { delivery_fee: 0, refusal_fee: 0, annulation_fee: 0, delivery_delay_hours: 0, source: "fallback" };
};

export const fetchAllPacks = async () => {
  const [{ data: packs }, { data: links }] = await Promise.all([
    (supabase as any).from("pricing_packs").select("*"),
    (supabase as any).from("pricing_pack_links").select("*"),
  ]);
  return {
    packs: (packs ?? []) as PricingPack[],
    links: (links ?? []) as PricingPackLink[],
  };
};
