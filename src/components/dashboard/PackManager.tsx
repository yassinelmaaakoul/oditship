import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";
import type { PricingPack, PricingPackLink } from "@/lib/pricingResolver";

const db = supabase as any;

interface Props {
  scope: "global" | "vendeur" | "livreur";
  ownerId?: string | null;
  /** Restrict destination cities to this list (e.g. cities of livreur's hubs). Empty = all cities. */
  allowedDestinationCities?: string[];
  /** Whether to show the pickup-city dimension (for global packs). For vendeur/livreur it's hidden. */
  showPickupDimension?: boolean;
  /** Hide delivery-delay field (custom packs only override price, not the global delay). */
  hideDelay?: boolean;
  title?: string;
}

interface City { id: number; name: string; }
interface PickupCity { id: number; name: string; }

const PackManager = ({ scope, ownerId, allowedDestinationCities, showPickupDimension = true, hideDelay = false, title }: Props) => {
  const [packs, setPacks] = useState<PricingPack[]>([]);
  const [links, setLinks] = useState<PricingPackLink[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [pickupCities, setPickupCities] = useState<PickupCity[]>([]);

  const [editPack, setEditPack] = useState<Partial<PricingPack> | null>(null);
  const [linkPack, setLinkPack] = useState<PricingPack | null>(null);

  const reload = async () => {
    const filter = (q: any) => scope === "global" ? q.eq("scope", "global") : q.eq("scope", scope).eq("owner_id", ownerId);
    const [p, l, c, pc] = await Promise.all([
      filter(db.from("pricing_packs").select("*")).order("name"),
      db.from("pricing_pack_links").select("*"),
      supabase.from("cities").select("id, name").order("name"),
      db.from("pickup_cities").select("id, name").order("name"),
    ]);
    setPacks((p.data ?? []) as PricingPack[]);
    const packIds = new Set(((p.data ?? []) as PricingPack[]).map((x) => x.id));
    setLinks(((l.data ?? []) as PricingPackLink[]).filter((x) => packIds.has(x.pack_id)));
    setCities((c.data ?? []) as City[]);
    setPickupCities((pc.data ?? []) as PickupCity[]);
  };

  useEffect(() => { 
    reload(); 
  }, [scope, ownerId]);

  const destCityOptions = useMemo(
    () => (allowedDestinationCities && allowedDestinationCities.length
      ? cities.filter((c) => allowedDestinationCities.includes(c.name))
      : cities),
    [cities, allowedDestinationCities],
  );

  const savePack = async () => {
    if (!editPack?.name) return toast.error("Nom requis");
    const payload = {
      name: editPack.name,
      delivery_fee: Number(editPack.delivery_fee || 0),
      refusal_fee: Number(editPack.refusal_fee || 0),
      annulation_fee: Number(editPack.annulation_fee || 0),
      delivery_delay_hours: Number(editPack.delivery_delay_hours || 48),
      scope,
      owner_id: scope === "global" ? null : ownerId,
    };
    if (editPack.id) {
      const { error } = await db.from("pricing_packs").update(payload).eq("id", editPack.id);
      if (error) return toast.error(error.message);
      toast.success("Pack mis à jour");
    } else {
      const { error } = await db.from("pricing_packs").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Pack créé");
    }
    setEditPack(null);
    reload();
  };

  const deletePack = async (id: number) => {
    if (!confirm("Supprimer ce pack et tous ses liens ?")) return;
    const { error } = await db.from("pricing_packs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Supprimé");
    reload();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{title ?? "Packs tarifaires"}</h3>
        <Button size="sm" onClick={() => setEditPack({ name: "", delivery_fee: 0, refusal_fee: 0, annulation_fee: 0, delivery_delay_hours: 48 })}>
          <Plus className="h-4 w-4 mr-1" /> Nouveau pack
        </Button>
      </div>

      {packs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Aucun pack défini.</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {packs.map((p) => {
            const myLinks = links.filter((l) => l.pack_id === p.id);
            return (
              <Card key={p.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Livraison {p.delivery_fee} · Refus {p.refusal_fee} · Annul. {p.annulation_fee}{!hideDelay && ` · Délai ${p.delivery_delay_hours}h`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditPack(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLinkPack(p)}><Link2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePack(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {myLinks.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Non lié à des villes</span>
                  ) : myLinks.slice(0, 6).map((l) => (
                    <Badge key={l.id} variant="secondary" className="text-xs">
                      {showPickupDimension ? `${l.pickup_city === "*" ? "Toutes" : l.pickup_city} → ` : ""}
                      {l.destination_city === "*" ? "Toutes les villes" : l.destination_city}
                    </Badge>
                  ))}
                  {myLinks.length > 6 && <Badge variant="outline" className="text-xs">+{myLinks.length - 6}</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit pack dialog */}
      <Dialog open={!!editPack} onOpenChange={(o) => !o && setEditPack(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editPack?.id ? "Modifier le pack" : "Nouveau pack"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom</Label><Input value={editPack?.name ?? ""} onChange={(e) => setEditPack({ ...editPack!, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Frais de livraison</Label><Input type="number" step="0.01" value={editPack?.delivery_fee ?? 0} onChange={(e) => setEditPack({ ...editPack!, delivery_fee: Number(e.target.value) })} /></div>
              <div><Label>Frais de refus</Label><Input type="number" step="0.01" value={editPack?.refusal_fee ?? 0} onChange={(e) => setEditPack({ ...editPack!, refusal_fee: Number(e.target.value) })} /></div>
              <div><Label>Frais d'annulation</Label><Input type="number" step="0.01" value={editPack?.annulation_fee ?? 0} onChange={(e) => setEditPack({ ...editPack!, annulation_fee: Number(e.target.value) })} /></div>
              {!hideDelay && <div><Label>Délai livraison (heures)</Label><Input type="number" value={editPack?.delivery_delay_hours ?? 48} onChange={(e) => setEditPack({ ...editPack!, delivery_delay_hours: Number(e.target.value) })} /></div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPack(null)}>Annuler</Button>
            <Button onClick={savePack}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link cities dialog */}
      <LinkCitiesDialog
        pack={linkPack}
        onClose={() => { setLinkPack(null); reload(); }}
        cities={destCityOptions}
        pickupCities={pickupCities}
        showPickupDimension={showPickupDimension}
        existingLinks={linkPack ? links.filter((l) => l.pack_id === linkPack.id) : []}
        otherPackLinks={linkPack ? links.filter((l) => l.pack_id !== linkPack.id) : []}
      />
    </div>
  );
};

interface LinkProps {
  pack: PricingPack | null;
  onClose: () => void;
  cities: { id: number; name: string }[];
  pickupCities: { id: number; name: string }[];
  showPickupDimension: boolean;
  existingLinks: PricingPackLink[];
  otherPackLinks: PricingPackLink[];
}

const LinkCitiesDialog = ({ pack, onClose, cities, pickupCities, showPickupDimension, existingLinks, otherPackLinks }: LinkProps) => {
  const [pickup, setPickup] = useState<string>("*");
  const [allDest, setAllDest] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!pack) return;
    setPickup("*");
    setAllDest(false);
    setSelected(new Set());
  }, [pack]);

  const toggleAll = (v: boolean) => {
    setAllDest(v);
    if (v) setSelected(new Set(cities.map((c) => c.name)));
    else setSelected(new Set());
  };

  const apply = async () => {
    if (!pack) return;
    const dests = allDest ? ["*"] : Array.from(selected);
    if (dests.length === 0) return toast.error("Sélectionnez au moins une ville");
    const rows = dests.map((d) => ({ pack_id: pack.id, pickup_city: pickup, destination_city: d }));
    const { error } = await db.from("pricing_pack_links").upsert(rows, { onConflict: "pack_id,pickup_city,destination_city" });
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} lien(s) ajouté(s)`);
    onClose();
  };

  const removeLink = async (id: number) => {
    const { error } = await db.from("pricing_pack_links").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lien retiré");
    onClose();
  };

  return (
    <Dialog open={!!pack} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Lier "{pack?.name}" à des villes</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {existingLinks.length > 0 && (
            <div>
              <Label className="text-xs">Liens existants</Label>
              <div className="flex flex-wrap gap-1 mt-1 max-h-32 overflow-y-auto">
                {existingLinks.map((l) => (
                  <Badge key={l.id} variant="secondary" className="text-xs gap-1">
                    {showPickupDimension && `${l.pickup_city === "*" ? "Toutes" : l.pickup_city} → `}
                    {l.destination_city === "*" ? "Toutes les villes" : l.destination_city}
                    <button onClick={() => removeLink(l.id)} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {showPickupDimension && (
            <div>
              <Label>Ville de ramassage</Label>
              <Select value={pickup} onValueChange={setPickup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="*">Toutes les villes de ramassage</SelectItem>
                  {pickupCities.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Villes de destination</Label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={allDest} onCheckedChange={(v) => toggleAll(!!v)} />
                Toutes les villes
              </label>
            </div>
            {!allDest && (
              <div className="border rounded-md p-2 max-h-64 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1">
                {cities.map((c) => {
                  const checked = selected.has(c.name);
                  return (
                    <label key={c.id} className="flex items-center gap-2 text-sm px-2 py-1 hover:bg-accent rounded cursor-pointer">
                      <Checkbox checked={checked} onCheckedChange={(v) => {
                        const n = new Set(selected);
                        if (v) n.add(c.name); else n.delete(c.name);
                        setSelected(n);
                      }} />
                      <span className="truncate">{c.name}</span>
                    </label>
                  );
                })}
                {cities.length === 0 && <div className="text-sm text-muted-foreground p-2 col-span-full">Aucune ville disponible.</div>}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button onClick={apply}>Ajouter les liens</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PackManager;
