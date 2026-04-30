import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderDetailsPanel } from "@/components/dashboard/OrderDetailsPanel";
import { cn } from "@/lib/utils";
import { ChevronDown, Package, PackageCheck, Users, Search } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface OrderRow {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_city: string;
  product_name: string;
  status: string;
  vendeur_id: string;
  tracking_number: string | null;
  external_tracking_number: string | null;
  created_at: string;
}

interface VendeurInfo {
  id: string;
  username: string;
  full_name: string | null;
  company_name: string | null;
}

const useVendeurs = (vendeurIds: string[]) => {
  const [map, setMap] = useState<Record<string, VendeurInfo>>({});
  useEffect(() => {
    if (vendeurIds.length === 0) { setMap({}); return; }
    supabase.from("profiles").select("id, username, full_name, company_name")
      .in("id", vendeurIds)
      .then(({ data }) => {
        const m: Record<string, VendeurInfo> = {};
        (data ?? []).forEach((v: any) => { m[v.id] = v; });
        setMap(m);
      });
  }, [vendeurIds.join(",")]);
  return map;
};

const OrdersTab = ({ status, allowAction }: { status: "Pickup" | "Ramassé"; allowAction: boolean }) => {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [vendeurFilter, setVendeurFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = () => {
    setLoading(true);
    supabase.from("orders").select("*")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setOrders((data ?? []) as OrderRow[]); setSelected(new Set()); setLoading(false); });
  };
  useEffect(() => {
    load();
    const channel = supabase.channel(`ramassoire-orders-${status}`).on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
      const next = payload.new as OrderRow | null;
      const old = payload.old as OrderRow | null;
      setOrders((current) => {
        if (payload.eventType === "DELETE") return current.filter((order) => order.id !== old?.id);
        if (!next || next.status !== status) return current.filter((order) => order.id !== next?.id);
        return current.some((order) => order.id === next.id) ? current.map((order) => order.id === next.id ? { ...order, ...next } : order) : [next, ...current];
      });
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [status]);

  const vendeurIds = useMemo(() => Array.from(new Set(orders.map((o) => o.vendeur_id))), [orders]);
  const vendeurs = useVendeurs(vendeurIds);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (vendeurFilter !== "all" && o.vendeur_id !== vendeurFilter) return false;
      if (dateFrom && new Date(o.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(o.created_at) > new Date(dateTo + "T23:59:59")) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const tracking = (o.external_tracking_number || o.tracking_number || `ODiT-${o.id}`).toLowerCase();
        if (!o.customer_name.toLowerCase().includes(q) &&
            !o.customer_phone.toLowerCase().includes(q) &&
            !tracking.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, vendeurFilter, dateFrom, dateTo]);

  const toggleAll = (v: boolean) => setSelected(v ? new Set(filtered.map((o) => o.id)) : new Set());
  const toggleOne = (id: number, v: boolean) => {
    const n = new Set(selected); v ? n.add(id) : n.delete(id); setSelected(n);
  };

  const ramasser = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from("orders").update({ status: "Ramassé" }).in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} colis ramassé(s)`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  const allChecked = filtered.length > 0 && filtered.every((o) => selected.has(o.id));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Recherche client / tél / tracking" className="pl-8 w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={vendeurFilter} onValueChange={setVendeurFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Vendeur" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les vendeurs</SelectItem>
              {vendeurIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {vendeurs[id]?.company_name || vendeurs[id]?.full_name || vendeurs[id]?.username || id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {allowAction && (
          <Button onClick={ramasser} disabled={selected.size === 0 || submitting}>
            <PackageCheck className="h-4 w-4 mr-2" />
            Ramasser {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        )}
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {allowAction && (
                <TableHead className="w-10">
                  <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(!!v)} />
                </TableHead>
              )}
              <TableHead>Tracking</TableHead>
              <TableHead>Vendeur</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Adresse</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Détails</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={allowAction ? 8 : 7} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={allowAction ? 8 : 7} className="text-center py-8 text-muted-foreground">Aucun colis</TableCell></TableRow>
            ) : filtered.map((o) => {
              const v = vendeurs[o.vendeur_id];
              return (
                <Fragment key={o.id}>
                <TableRow data-state={selected.has(o.id) ? "selected" : undefined}>
                  {allowAction && (
                    <TableCell>
                      <Checkbox checked={selected.has(o.id)} onCheckedChange={(val) => toggleOne(o.id, !!val)} />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs">{o.external_tracking_number || o.tracking_number || `ODiT-${o.id}`}</TableCell>
                  <TableCell className="text-sm">{v?.company_name || v?.full_name || v?.username || "—"}</TableCell>
                  <TableCell>
                    <div className="font-medium">{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{o.customer_phone}</div>
                  </TableCell>
                  <TableCell>{o.customer_city}</TableCell>
                  <TableCell className="text-sm">{o.customer_address}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setExpandedOrderId(expandedOrderId === o.id ? null : o.id)} aria-label="Voir détails">
                      <ChevronDown className={cn("h-4 w-4 transition-transform", expandedOrderId === o.id && "rotate-180")} />
                    </Button>
                  </TableCell>
                </TableRow>
                {expandedOrderId === o.id && (
                  <TableRow>
                    <TableCell colSpan={allowAction ? 8 : 7} className="bg-muted/20 p-0">
                      <OrderDetailsPanel order={{ ...o, order_value: 0 }} />
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

const RamassoireList = () => {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Colis</h2>
      <Tabs defaultValue="pickup">
        <TabsList>
          <TabsTrigger value="pickup">Pickup</TabsTrigger>
          <TabsTrigger value="ramasse">Ramassé</TabsTrigger>
        </TabsList>
        <TabsContent value="pickup" className="mt-4">
          <OrdersTab status="Pickup" allowAction />
        </TabsContent>
        <TabsContent value="ramasse" className="mt-4">
          <OrdersTab status="Ramassé" allowAction={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface VendeurCount { vendeur_id: string; count: number; }

const ListeRamassage = () => {
  const [rows, setRows] = useState<VendeurCount[]>([]);
  const [vendeurs, setVendeurs] = useState<Record<string, VendeurInfo>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("orders").select("vendeur_id").eq("status", "Pickup");
    const counts: Record<string, number> = {};
    (data ?? []).forEach((o: any) => { counts[o.vendeur_id] = (counts[o.vendeur_id] || 0) + 1; });
    const ids = Object.keys(counts);
    setRows(ids.map((id) => ({ vendeur_id: id, count: counts[id] })).sort((a, b) => b.count - a.count));
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, username, full_name, company_name").in("id", ids);
      const m: Record<string, VendeurInfo> = {};
      (profs ?? []).forEach((v: any) => { m[v.id] = v; });
      setVendeurs(m);
    } else {
      setVendeurs({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Liste de ramassage</h2>
        <Button variant="outline" onClick={load}>Actualiser</Button>
      </div>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendeur</TableHead>
              <TableHead>Username</TableHead>
              <TableHead className="text-right">Colis Pickup</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Aucun vendeur avec colis Pickup</TableCell></TableRow>
            ) : rows.map((r) => {
              const v = vendeurs[r.vendeur_id];
              return (
                <TableRow key={r.vendeur_id}>
                  <TableCell className="font-medium">{v?.company_name || v?.full_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v?.username || r.vendeur_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-right font-semibold">{r.count}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/ramassoire/colis")}>
                      Voir
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

const RamassoireDashboard = () => (
  <DashboardLayout
    title="Ramassoire"
    nav={[
      { to: "/dashboard/ramassoire/colis", label: "Colis", icon: <Package className="h-4 w-4" /> },
      { to: "/dashboard/ramassoire/liste-ramassage", label: "Liste ramassage", icon: <Users className="h-4 w-4" /> },
    ]}
  />
);

export { RamassoireList, ListeRamassage };
export default RamassoireDashboard;
