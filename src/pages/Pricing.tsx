import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronLeft, ChevronRight, ChevronsUpDown, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { fetchAllPacks, resolvePrice, type PricingPack, type PricingPackLink } from "@/lib/pricingResolver";

interface City { id: number; name: string; }
interface PickupCity { id: number; name: string; }

interface LegacyRule {
  city: string;
  delivery_fee: number;
  refusal_fee: number;
  annulation_fee: number;
}

const PAGE_SIZE = 20;
const formatDelay = (h: number) => {
  if (!h) return "—";
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d} j`;
};

const Pricing = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [pickupCities, setPickupCities] = useState<PickupCity[]>([]);
  const [packs, setPacks] = useState<PricingPack[]>([]);
  const [links, setLinks] = useState<PricingPackLink[]>([]);
  const [legacy, setLegacy] = useState<LegacyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pickup, setPickup] = useState<string>("");
  const [pickupOpen, setPickupOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, pc, packsAll, legacyRes] = await Promise.all([
        supabase.from("cities").select("id, name").order("name"),
        (supabase as any).from("pickup_cities").select("id, name").order("name"),
        fetchAllPacks(),
        supabase.from("pricing_rules").select("city, delivery_fee, refusal_fee, annulation_fee").is("vendeur_id", null),
      ]);
      setCities((c.data ?? []) as City[]);
      const pcList = (pc.data ?? []) as PickupCity[];
      setPickupCities(pcList);
      if (pcList.length > 0) setPickup(pcList[0].name);
      setPacks(packsAll.packs);
      setLinks(packsAll.links);
      setLegacy((legacyRes.data ?? []) as LegacyRule[]);
      setLoading(false);
    })();
  }, []);

  const rows = useMemo(() => {
    const pickupCity = pickup || null;
    const legacyMap = new Map(legacy.map((r) => [r.city, r]));
    return cities.map((city) => {
      const r = resolvePrice(packs, links, { pickupCity, destCity: city.name });
      if (r.source === "fallback") {
        const l = legacyMap.get(city.name);
        if (l) return { city: city.name, delivery_fee: l.delivery_fee, refusal_fee: l.refusal_fee, annulation_fee: l.annulation_fee, delay: 0 };
      }
      return { city: city.name, delivery_fee: r.delivery_fee, refusal_fee: r.refusal_fee, annulation_fee: r.annulation_fee, delay: r.delivery_delay_hours };
    });
  }, [cities, packs, links, legacy, pickup]);

  const filtered = useMemo(
    () => rows.filter((r) => r.city.toLowerCase().includes(search.toLowerCase())),
    [rows, search]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="container py-12 md:py-20">
      <div className="max-w-2xl mb-10">
        <p className="text-accent text-sm font-bold uppercase tracking-wider mb-3">Tarification</p>
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Tarifs par ville</h1>
        <p className="text-muted-foreground text-lg">
          Tarifs personnalisés disponibles sur demande pour les gros volumes.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Rechercher une ville..."
                  className="pl-9"
                />
              </div>
              <Popover open={pickupOpen} onOpenChange={setPickupOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full sm:w-64 justify-between font-normal">
                    {pickup ? `Ramassage : ${pickup}` : "Ville de ramassage"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Rechercher une ville..." />
                    <CommandList>
                      <CommandEmpty>Aucune ville.</CommandEmpty>
                      <CommandGroup>
                        {pickupCities.map((c) => (
                          <CommandItem key={c.id} value={c.name} onSelect={() => { setPickup(c.name); setPickupOpen(false); setPage(1); }}>
                            <Check className={cn("mr-2 h-4 w-4", pickup === c.name ? "opacity-100" : "opacity-0")} />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-sm text-muted-foreground">{filtered.length} villes</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Ville</th>
                  <th className="px-4 py-3 font-semibold text-right">Frais de livraison</th>
                  <th className="px-4 py-3 font-semibold text-right">Frais de refus</th>
                  <th className="px-4 py-3 font-semibold text-right">Frais d'annulation</th>
                  <th className="px-4 py-3 font-semibold text-right">Délai livraison</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : slice.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Aucune ville trouvée.</td></tr>
                ) : slice.map((r) => (
                  <tr key={r.city} className="border-t border-border hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-3 capitalize font-medium">{r.city}</td>
                    <td className="px-4 py-3 text-right font-mono">{Number(r.delivery_fee).toFixed(2)} MAD</td>
                    <td className="px-4 py-3 text-right font-mono">{Number(r.refusal_fee).toFixed(2)} MAD</td>
                    <td className="px-4 py-3 text-right font-mono">{Number(r.annulation_fee).toFixed(2)} MAD</td>
                    <td className="px-4 py-3 text-right font-mono">{formatDelay(r.delay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Page {currentPage} sur {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4" /> Précédent
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                Suivant <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Pricing;
