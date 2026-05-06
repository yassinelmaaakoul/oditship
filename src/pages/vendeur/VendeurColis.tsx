import { Fragment, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { ORDER_STATUSES } from "@/lib/orderStatus";
import { OrderFormDialog, OrderFormValues } from "@/components/dashboard/OrderFormDialog";
import { OrderDetailsPanel } from "@/components/dashboard/OrderDetailsPanel";
import { printSticker, printStickers } from "@/lib/printSticker";
import { cn } from "@/lib/utils";
import { ChevronDown, Pencil, Trash2, Printer, Plus, Search, CheckCircle2, PackageCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { COLIS_PREVIEW_SETTING_KEY, colisSectionStyle, defaultColisPreviewSettings, getColisPreviewValue, normalizeColisPreviewSettings, renderColisTemplate, sanitizeColisHtml, sortedVisibleFields, type ColisPreviewSettings } from "@/lib/colisPreview";
import { COLIS_PAGE_PRESET_KEY, defaultColisPagePreset, normalizeColisPagePreset, type ColisPagePreset } from "@/lib/colisPagePreset";
import { ColisCanvasPage } from "@/components/dashboard/ColisCanvasPage";
import { getAppSetting } from "@/lib/appSettingsCache";

const ORDERS_COLUMNS = "id,vendeur_id,agent_id,customer_name,customer_phone,customer_address,customer_city,product_name,order_value,open_package,comment,status,tracking_number,external_tracking_number,status_note,postponed_date,scheduled_date,created_at";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Order {
  id: number;
  vendeur_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_city: string;
  product_name: string;
  order_value: number;
  open_package: boolean;
  comment: string | null;
  status: string;
  tracking_number: string | null;
  external_tracking_number: string | null;
  api_sync_status: string | null;
  api_sync_error: string | null;
  status_note: string | null;
  postponed_date: string | null;
  scheduled_date: string | null;
  agent_id: string | null;
  created_at: string;
}

const VendeurColis = () => {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<OrderFormValues> | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [agents, setAgents] = useState<{ id: string; full_name: string | null; username: string }[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [previewSettings, setPreviewSettings] = useState<ColisPreviewSettings>(defaultColisPreviewSettings);
  const [pagePreset, setPagePreset] = useState<ColisPagePreset>(defaultColisPagePreset);

  const [confirming, setConfirming] = useState(false);
  const [pickingUp, setPickingUp] = useState(false);

  const isAgent = profile?.agent_of != null;
  const agentPages = (profile?.agent_pages ?? {}) as Record<string, boolean | string>;
  const colisScope = agentPages.colis_scope === "own" ? "own" : "all";

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from("orders")
      .select(ORDERS_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (isAgent && colisScope === "own") query = query.eq("agent_id", user.id);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setOrders((data ?? []) as Order[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (user) {
      supabase.from("profiles").select("id, full_name, username").eq("agent_of", user.id)
        .then(({ data }) => setAgents(data ?? []));
      getAppSetting(COLIS_PREVIEW_SETTING_KEY).then((v) => setPreviewSettings(normalizeColisPreviewSettings(v)));
      getAppSetting(COLIS_PAGE_PRESET_KEY).then((v) => setPagePreset(normalizeColisPagePreset(v)));
    }
    const channel = supabase.channel("vendeur-orders-live").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
      setOrders((current) => {
        if (payload.eventType === "DELETE") return current.filter((order) => order.id !== (payload.old as Order).id);
        const next = payload.new as Order;
        return current.some((order) => order.id === next.id) ? current.map((order) => order.id === next.id ? { ...order, ...next } : order) : [next, ...current];
      });
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAgent, colisScope]);

  const rowData = (o: Order) => ({ ...o, tracking: o.external_tracking_number || o.tracking_number || `ODiT-${o.id}` });
  const renderMainCell = (o: Order) => {
    const section = previewSettings.main;
    const data = rowData(o);
    if (section.useCustomHtml) return <div style={colisSectionStyle(section, data)} dangerouslySetInnerHTML={{ __html: sanitizeColisHtml(`<style>${renderColisTemplate(section.css, data)}</style>${renderColisTemplate(section.html, data)}`) }} />;
    return <div className={cn("space-y-1 border", section.layout === "inline" && "flex flex-wrap items-center", section.layout === "grid" && "grid grid-cols-2")} style={colisSectionStyle(section, data)}>
      <div className="flex flex-wrap items-center gap-2">{sortedVisibleFields(section, "primary").map((field) => <span key={field.key} className="font-medium">{getColisPreviewValue(data, field.key)}</span>)}</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{sortedVisibleFields(section, "secondary").map((field) => <span key={field.key}>{getColisPreviewValue(data, field.key)}</span>)}</div>
      <div className="flex flex-wrap items-center gap-1.5">{sortedVisibleFields(section, "meta").map((field) => { const value = getColisPreviewValue(data, field.key); return value ? <span key={field.key} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{value}</span> : null; })}</div>
    </div>;
  };

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (agentFilter !== "all" && o.agent_id !== agentFilter) return false;
      if (dateFrom && new Date(o.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(o.created_at) > new Date(dateTo + "T23:59:59")) return false;
      if (search) {
        const s = search.toLowerCase();
        const tracking = (o.external_tracking_number || o.tracking_number || `ODiT-${o.id}`).toLowerCase();
        const matches =
          o.customer_name.toLowerCase().includes(s) ||
          o.customer_phone.includes(search) ||
          o.customer_city.toLowerCase().includes(s) ||
          tracking.includes(s);
        if (!matches) return false;
      }
      return true;
    });
  }, [orders, statusFilter, agentFilter, dateFrom, dateTo, search]);

  const selectedOrders = useMemo(() => orders.filter((o) => selected.has(o.id)), [orders, selected]);
  const eligibleConfirm = selectedOrders.filter((o) => o.status === "Crée");
  const eligiblePickup = selectedOrders.filter((o) => o.status === "Confirmé");
  const eligibleSticker = selectedOrders.filter((o) => o.status === "Pickup");

  const toggleOne = (id: number) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };
  const toggleAllVisible = () => {
    const allIds = filtered.map((o) => o.id);
    const allSel = allIds.every((id) => selected.has(id));
    if (allSel) {
      const n = new Set(selected);
      allIds.forEach((id) => n.delete(id));
      setSelected(n);
    } else {
      const n = new Set(selected);
      allIds.forEach((id) => n.add(id));
      setSelected(n);
    }
  };
  const clearSelection = () => setSelected(new Set());

  const syncOrderInList = (updated: Order) => {
    setOrders((current) => current.map((order) => (order.id === updated.id ? { ...order, ...updated } : order)));
  };

  const deleteOrder = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("orders").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else toast.success("Commande supprimée");
    setDeleteId(null);
    load();
  };

  const groupConfirm = async () => {
    if (eligibleConfirm.length === 0) return;
    setConfirming(true);
    try {
      const ids = eligibleConfirm.map((o) => o.id);
      const { error } = await supabase.from("orders").update({ status: "Confirmé" }).in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} commande(s) confirmée(s)`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Échec de la confirmation");
    } finally {
      setConfirming(false);
    }
  };

  const resolveLivreurForOrder = async (order: Order) => {
    const city = order.customer_city.trim().replace(/\s+/g, " ");
    const { data: hubCity, error: hubError } = await supabase
      .from("hub_cities")
      .select("hub_id")
      .ilike("city_name", city)
      .limit(1)
      .maybeSingle();
    if (hubError) throw hubError;
    if (!hubCity) throw new Error("Un problème système est survenu. Veuillez contacter le support.");

    const { data: hubLivreur, error: livreurError } = await supabase
      .from("hub_livreur")
      .select("livreur_id")
      .eq("hub_id", hubCity.hub_id)
      .maybeSingle();
    if (livreurError) throw livreurError;
    if (!hubLivreur?.livreur_id) throw new Error("Un problème système est survenu. Veuillez contacter le support.");
    return hubLivreur.livreur_id;
  };

  const groupPickup = async () => {
    if (eligiblePickup.length === 0) return;
    setPickingUp(true);
    let success = 0, failed = 0;
    for (const o of eligiblePickup) {
      try {
        const livreurId = await resolveLivreurForOrder(o);
        const { data, error } = await supabase.functions.invoke("livreur-gateway", {
          body: { order_id: o.id, livreur_id: livreurId },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        success++;
      } catch {
        failed++;
        toast.error("Un problème système est survenu. Veuillez contacter le support.");
      }
    }
    if (success) toast.success(`${success} commande(s) envoyée(s) au livreur`);
    if (failed) toast.error(`${failed} commande(s) en échec`);
    await load();
    setPickingUp(false);
  };

  const groupPrintStickers = () => {
    if (eligibleSticker.length === 0) return;
    printStickers(eligibleSticker);
  };

  if (pagePreset.enabled && pagePreset.appliesTo.vendeur) {
    return (
      <div className="space-y-4">
        <ColisCanvasPage
          preset={pagePreset}
          title="Mes commandes"
          orders={filtered as any}
          loading={loading}
          actions={{
            selectable: true,
            isSelected: (id) => selected.has(id),
            onToggleSelect: toggleOne,
            isDetailsOpen: (id) => expandedOrderId === id,
            onToggleDetails: (id) => setExpandedOrderId(expandedOrderId === id ? null : id),
            onPrintSticker: (o) => printSticker(o as any),
            onEdit: (o) => { setEditing({ ...(o as any), comment: (o as any).comment ?? "" }); setFormOpen(true); },
            onDelete: (id) => setDeleteId(id),
          }}
          detailsRenderer={(o) => <OrderDetailsPanel order={o as any} previewSettings={previewSettings} />}
        />
        {user && (
          <OrderFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            initial={editing}
            vendeurId={isAgent ? (profile?.agent_of as string) : user.id}
            agentId={isAgent ? user.id : null}
            onSaved={load}
          />
        )}
        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette commande ?</AlertDialogTitle>
              <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={deleteOrder}>Supprimer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 pt-32 xl:pt-20">
      <div className="fixed inset-x-0 top-14 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:left-64 lg:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center">
            <h2 className="shrink-0 text-2xl font-bold">Mes commandes</h2>
            {selected.size > 0 && (
              <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-border bg-card px-3 py-2 shadow-elegant md:min-w-0">
                <span className="whitespace-nowrap px-1 text-sm font-medium">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
                <Button size="sm" onClick={groupConfirm} disabled={eligibleConfirm.length === 0 || confirming}>
                  {confirming ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Confirm ({eligibleConfirm.length})
                </Button>
                <Button size="sm" variant="default" onClick={groupPickup} disabled={eligiblePickup.length === 0 || pickingUp}>
                  {pickingUp ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-1" />}
                  Pickup ({eligiblePickup.length})
                </Button>
                <Button size="sm" variant="outline" onClick={groupPrintStickers} disabled={eligibleSticker.length === 0}>
                  <Printer className="h-4 w-4 mr-1" />
                  Sticker ({eligibleSticker.length})
                </Button>
                <Button size="icon" variant="ghost" onClick={clearSelection} aria-label="Effacer la sélection">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <Button className="w-full sm:w-auto" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nouvelle commande
          </Button>
        </div>
      </div>

      {(profile?.bank_account_name || profile?.bank_account_number) && !isAgent && (
        <Card className="p-3 bg-secondary/40 text-sm flex flex-wrap gap-x-6 gap-y-1">
          <div><span className="text-muted-foreground">Compte bancaire :</span> <strong>{profile?.bank_account_name || "—"}</strong></div>
          <div><span className="text-muted-foreground">N° :</span> <strong className="font-mono">{profile?.bank_account_number || "—"}</strong></div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher (nom, téléphone, ville, tracking)" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger><SelectValue placeholder="Agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous agents</SelectItem>
              <SelectItem value="__none__" disabled>—</SelectItem>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name || a.username}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((o) => selected.has(o.id))}
                  onCheckedChange={toggleAllVisible}
                  aria-label="Tout sélectionner"
                />
              </TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucune commande</TableCell></TableRow>
            ) : filtered.map((o) => (
              <Fragment key={o.id}>
              <TableRow data-state={selected.has(o.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} aria-label={`Sélectionner ${o.id}`} />
                </TableCell>
                <TableCell>
                  {renderMainCell(o)}
                </TableCell>
                <TableCell>{o.customer_city}</TableCell>
                <TableCell className="font-mono text-sm">{o.customer_phone}</TableCell>
                <TableCell className="font-semibold">{Number(o.order_value).toFixed(2)} MAD</TableCell>
                <TableCell>
                  <StatusBadge status={o.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {o.status === "Crée" && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => { setEditing({ ...o, comment: o.comment ?? "" }); setFormOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(o.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    {o.status === "Pickup" && (
                      <Button variant="outline" size="sm" onClick={() => printSticker(o)}>
                        <Printer className="h-4 w-4 mr-1" /> Sticker
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setExpandedOrderId(expandedOrderId === o.id ? null : o.id)} aria-label="Voir détails">
                      <ChevronDown className={cn("h-4 w-4 transition-transform", expandedOrderId === o.id && "rotate-180")} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {expandedOrderId === o.id && (
                <TableRow key={`${o.id}-details`}>
                  <TableCell colSpan={7} className="bg-muted/20 p-0">
                    <OrderDetailsPanel order={o} onOrderSynced={syncOrderInList} previewSettings={previewSettings} />
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>

      {user && (
        <OrderFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          initial={editing}
          vendeurId={isAgent ? (profile?.agent_of as string) : user.id}
          agentId={isAgent ? user.id : null}
          onSaved={load}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la commande ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={deleteOrder} className="bg-destructive">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VendeurColis;
