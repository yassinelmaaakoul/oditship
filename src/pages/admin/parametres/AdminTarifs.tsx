import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import PackManager from "@/components/dashboard/PackManager";

const db = supabase as any;

interface PickupCity { id: number; name: string; }

const AdminTarifs = () => {
  const [pickupCities, setPickupCities] = useState<PickupCity[]>([]);
  const [editing, setEditing] = useState<PickupCity | null>(null);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await db.from("pickup_cities").select("*").order("name");
    setPickupCities((data ?? []) as PickupCity[]);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing) {
      const { error } = await db.from("pickup_cities").update({ name: trimmed }).eq("id", editing.id);
      if (error) return toast.error(error.message);
      // also update existing pack links pointing at the old name
      await db.from("pricing_pack_links").update({ pickup_city: trimmed }).eq("pickup_city", editing.name);
      toast.success("Mis à jour");
    } else {
      const { error } = await db.from("pickup_cities").insert({ name: trimmed });
      if (error) return toast.error(error.message);
      toast.success("Ville ajoutée");
    }
    setOpen(false); setName(""); setEditing(null); load();
  };

  const del = async (c: PickupCity) => {
    if (!confirm(`Supprimer "${c.name}" ?`)) return;
    await db.from("pricing_pack_links").delete().eq("pickup_city", c.name);
    const { error } = await db.from("pickup_cities").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Supprimée"); load();
  };

  return (
    <Tabs defaultValue="pickup" className="space-y-4">
      <TabsList>
        <TabsTrigger value="pickup">Villes de ramassage</TabsTrigger>
        <TabsTrigger value="packs">Packs tarifaires</TabsTrigger>
      </TabsList>

      <TabsContent value="pickup" className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Villes d'où partent les ramassages. Les frais et délais peuvent varier selon la ville de départ.
          </p>
          <Button size="sm" onClick={() => { setEditing(null); setName(""); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </div>
        <Card className="p-3">
          {pickupCities.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Aucune ville de ramassage.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {pickupCities.map((c) => (
                <div key={c.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
                  <span className="text-sm truncate">{c.name}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(c); setName(c.name); setOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del(c)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Modifier" : "Nouvelle ville de ramassage"}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Nom *</Label><Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit">{editing ? "Enregistrer" : "Ajouter"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </TabsContent>

      <TabsContent value="packs">
        <PackManager scope="global" showPickupDimension title="Packs tarifaires globaux" />
      </TabsContent>
    </Tabs>
  );
};

export default AdminTarifs;
