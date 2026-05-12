import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, Eye, EyeOff, RefreshCw, Zap, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PackManager from "@/components/dashboard/PackManager";

interface Livreur { id: string; username: string; full_name: string | null; api_enabled: boolean; api_token: string | null; }
interface Hub { id: number; name: string; }
interface HubLivreur { hub_id: number; livreur_id: string; }

const db = supabase as any;

const generateToken = () => {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const AdminLivreurs = () => {
  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubLivreurs, setHubLivreurs] = useState<HubLivreur[]>([]);
  const [show, setShow] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tarifsTarget, setTarifsTarget] = useState<Livreur | null>(null);
  const [hubCities, setHubCities] = useState<Array<{ hub_id: number; city_name: string }>>([]);

  const load = async () => {
    const [p, h, hl, hc] = await Promise.all([
      db.from("profiles").select("id, username, full_name, api_enabled, api_token").eq("role", "livreur").order("username"),
      supabase.from("hubs").select("id, name").order("name"),
      supabase.from("hub_livreur").select("hub_id, livreur_id"),
      supabase.from("hub_cities").select("hub_id, city_name"),
    ]);
    setLivreurs((p.data ?? []) as Livreur[]);
    setHubs((h.data ?? []) as Hub[]);
    setHubLivreurs((hl.data ?? []) as HubLivreur[]);
    setHubCities((hc.data ?? []) as Array<{ hub_id: number; city_name: string }>);
  };
  useEffect(() => { load(); }, []);

  const citiesOfLivreur = (livreurId: string) => {
    const myHubIds = new Set(hubLivreurs.filter((x) => x.livreur_id === livreurId).map((x) => x.hub_id));
    return Array.from(new Set(hubCities.filter((x) => myHubIds.has(x.hub_id)).map((x) => x.city_name)));
  };

  const hubsOf = (livreurId: string) => hubLivreurs.filter((x) => x.livreur_id === livreurId).map((x) => x.hub_id);
  const hubAssignedTo = (hubId: number) => hubLivreurs.find((x) => x.hub_id === hubId)?.livreur_id;

  const toggleHubForLivreur = async (livreurId: string, hubId: number, currentlyAssigned: boolean) => {
    setSavingId(livreurId);
    try {
      if (currentlyAssigned) {
        const { error } = await supabase.from("hub_livreur").delete().eq("livreur_id", livreurId).eq("hub_id", hubId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hub_livreur").insert({ livreur_id: livreurId, hub_id: hubId });
        if (error) throw error;
      }
      await load();
    } catch (e: any) { toast.error(e.message || "Erreur"); } finally { setSavingId(null); }
  };

  const toggleApi = async (l: Livreur, v: boolean) => {
    const { error } = await supabase.from("profiles").update({ api_enabled: v }).eq("id", l.id);
    if (error) toast.error(error.message);
    else { toast.success(v ? "API activée" : "API désactivée"); load(); }
  };

  const regenToken = async (l: Livreur) => {
    const t = generateToken();
    const { error } = await supabase.from("profiles").update({ api_token: t }).eq("id", l.id);
    if (error) toast.error(error.message);
    else { toast.success("Token regenerated"); load(); }
  };

  const masked = (t: string | null) => t ? `${t.slice(0, 6)}${"•".repeat(20)}${t.slice(-4)}` : "—";

  return (
    <>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Livreur</TableHead>
              <TableHead>Hubs assignés</TableHead>
              <TableHead>API</TableHead>
              <TableHead>Workflows</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {livreurs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No drivers</TableCell></TableRow>
            ) : livreurs.map((l) => {
              const assigned = hubsOf(l.id);
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="font-medium">{l.full_name || l.username}</div>
                    <div className="text-xs text-muted-foreground">{l.username}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {assigned.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
                      {assigned.map((hid) => {
                        const h = hubs.find((x) => x.id === hid);
                        return <Badge key={hid} variant="secondary">{h?.name ?? `#${hid}`}</Badge>;
                      })}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" disabled={savingId === l.id}>Modifier <ChevronDown className="h-3 w-3 ml-1" /></Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2 max-h-72 overflow-y-auto" align="start">
                          <div className="text-xs font-medium px-2 py-1 text-muted-foreground">Select hubs</div>
                          {hubs.length === 0 && <div className="text-sm p-2 text-muted-foreground">No hubs</div>}
                          {hubs.map((h) => {
                            const owner = hubAssignedTo(h.id);
                            const isMine = owner === l.id;
                            const takenByOther = !!owner && !isMine;
                            return (
                              <label key={h.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent cursor-pointer ${takenByOther ? "opacity-50" : ""}`}>
                                <Checkbox checked={isMine} disabled={takenByOther || savingId === l.id} onCheckedChange={() => toggleHubForLivreur(l.id, h.id, isMine)} />
                                <span className="flex-1">{h.name}</span>
                                {takenByOther && <span className="text-xs text-muted-foreground">pris</span>}
                              </label>
                            );
                          })}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                  <TableCell>
                    <label className="flex items-center gap-2 text-sm"><Switch checked={l.api_enabled} onCheckedChange={(v) => toggleApi(l, v)} /><span>API</span></label>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input readOnly className="font-mono text-xs h-8 w-64" value={show.has(l.id) ? (l.api_token || "—") : masked(l.api_token)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { const n = new Set(show); n.has(l.id) ? n.delete(l.id) : n.add(l.id); setShow(n); }}>
                        {show.has(l.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => regenToken(l)}><RefreshCw className="h-4 w-4 mr-1" /> Generate</Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="default" size="sm" onClick={() => window.open(`/admin/livreurs/${l.id}/workflows`, "_blank")}>
                        <Zap className="h-4 w-4 mr-1" /> Workflows
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setTarifsTarget(l)}>
                        <Wallet className="h-4 w-4 mr-1" /> Tarifs
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!tarifsTarget} onOpenChange={(o) => !o && setTarifsTarget(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tarifs personnalisés — {tarifsTarget?.full_name || tarifsTarget?.username}</DialogTitle>
          </DialogHeader>
          {tarifsTarget && (
            <PackManager
              scope="livreur"
              ownerId={tarifsTarget.id}
              showPickupDimension={false}
              hideDelay
              allowedDestinationCities={citiesOfLivreur(tarifsTarget.id)}
              title={`Villes restreintes aux hubs assignés (${citiesOfLivreur(tarifsTarget.id).length})`}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminLivreurs;
