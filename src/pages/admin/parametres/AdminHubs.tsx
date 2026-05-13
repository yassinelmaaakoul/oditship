import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Hub { id: number; name: string; description: string | null; }
interface City { id: number; name: string; }
interface HubCity { hub_id: number; city_name: string; }

const AdminHubs = () => {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [hubCities, setHubCities] = useState<HubCity[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Hub | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("");
  const [deleting, setDeleting] = useState<Hub | null>(null);

  const load = async () => {
    const [h, c, hc] = await Promise.all([
      supabase.from("hubs").select("*").order("name"),
      supabase.from("cities").select("*").order("name"),
      supabase.from("hub_cities").select("hub_id, city_name"),
    ]);
    setHubs((h.data ?? []) as Hub[]);
    setCities((c.data ?? []) as City[]);
    setHubCities((hc.data ?? []) as HubCity[]);
  };
  useEffect(() => { load(); }, []);

  const cityCount = (hubId: number) => hubCities.filter((x) => x.hub_id === hubId).length;
  const cityOwner = (cityName: string) => hubCities.find((x) => x.city_name === cityName)?.hub_id;
  const hubName = (hubId?: number) => hubs.find((h) => h.id === hubId)?.name ?? "hub existant";

  const openCreate = () => { setEditing(null); setForm({ name: "", description: "" }); setSelected(new Set()); setOpen(true); };
  const openEdit = (h: Hub) => {
    setEditing(h);
    setForm({ name: h.name, description: h.description ?? "" });
    setSelected(new Set(hubCities.filter((x) => x.hub_id === h.id).map((x) => x.city_name)));
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let hubId: number;
    if (editing) {
      const { error } = await supabase.from("hubs").update({ name: form.name, description: form.description || null }).eq("id", editing.id);
      if (error) return toast.error(error.message);
      hubId = editing.id;
    } else {
      const { data, error } = await supabase.from("hubs").insert({ name: form.name, description: form.description || null }).select("id").single();
      if (error) return toast.error(error.message);
      hubId = data.id;
    }
    const cityTaken = Array.from(selected).find((city) => {
      const owner = cityOwner(city);
      return owner && owner !== hubId;
    });
    if (cityTaken) return toast.error(`${cityTaken} est déjà assignée à ${hubName(cityOwner(cityTaken))}`);

    // sync hub_cities
    await supabase.from("hub_cities").delete().eq("hub_id", hubId);
    if (selected.size > 0) {
      const rows = Array.from(selected).map((city_name) => ({ hub_id: hubId, city_name }));
      await supabase.from("hub_cities").insert(rows);
    }
    toast.success(editing ? "Hub mis à jour" : "Hub créé");
    setOpen(false); load();
  };

  const doDelete = async () => {
    if (!deleting) return;
    await supabase.from("hub_cities").delete().eq("hub_id", deleting.id);
    await supabase.from("hub_livreur").delete().eq("hub_id", deleting.id);
    const { error } = await supabase.from("hubs").delete().eq("id", deleting.id);
    if (error) toast.error(error.message);
    else toast.success("Hub supprimé");
    setDeleting(null); load();
  };

  const toggleCity = (name: string) => {
    const owner = cityOwner(name);
    if (owner && owner !== editing?.id) {
      toast.error(`${name} est déjà assignée à ${hubName(owner)}`);
      return;
    }
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSelected(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{hubs.length} hub(s)</div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Nouveau hub</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {hubs.map((h) => (
          <Card key={h.id} className="p-4">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-bold text-lg">{h.name}</div>
                {h.description && <div className="text-sm text-muted-foreground">{h.description}</div>}
                <div className="text-xs text-muted-foreground mt-2">{cityCount(h.id)} ville(s)</div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(h)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleting(h)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifier le hub" : "Nouveau hub"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>Nom *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div>
              <Label>Villes assignées ({selected.size})</Label>
              <Input className="mt-1" placeholder="Filtrer" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="mt-2 max-h-64 overflow-y-auto border border-border rounded-md p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                {cities.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase())).map((c) => {
                  const owner = cityOwner(c.name);
                  const takenByOther = !!owner && owner !== editing?.id;
                  return (
                    <label key={c.id} className={`flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary rounded px-2 py-1 ${takenByOther ? "opacity-50" : ""}`}>
                      <Checkbox checked={selected.has(c.name)} disabled={takenByOther} onCheckedChange={() => toggleCity(c.name)} />
                      <span className="truncate flex-1">{c.name}</span>
                      {takenByOther && <span className="text-xs text-muted-foreground">{hubName(owner)}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit">{editing ? "Enregistrer" : "Créer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer "{deleting?.name}" ?</AlertDialogTitle>
            <AlertDialogDescription>Toutes les associations villes/livreurs seront retirées.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminHubs;
