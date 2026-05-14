import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderBillingBadges } from "@/components/dashboard/OrderBillingBadges";
import { useInvoiceStatusMap } from "@/lib/useInvoiceStatusMap";
import { SubStatusFilter, matchesSubStatus, type SubStatusValue } from "@/components/dashboard/SubStatusFilter";
import { OrderDetailsPanel } from "@/components/dashboard/OrderDetailsPanel";
import { ColisMainRowCell } from "@/components/dashboard/ColisMainRowCell";
import { cn } from "@/lib/utils";
import { ChevronDown, Printer } from "lucide-react";
import { printSticker } from "@/lib/printSticker";

const ORDERS_COLUMNS = "id,customer_name,customer_phone,customer_address,customer_city,product_name,order_value,open_package,comment,status,tracking_number,external_tracking_number,status_note,postponed_date,scheduled_date,created_at,updated_at,vendeur_id,assigned_livreur_id,driver_name,driver_phone,hub_id";

const LivreurColis = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [subStatusFilter, setSubStatusFilter] = useState<SubStatusValue>("all");

  useEffect(() => {
    supabase.from("orders").select(ORDERS_COLUMNS).order("updated_at", { ascending: false }).limit(500)
      .then(({ data }) => { setOrders(data ?? []); setLoading(false); });
    
    const channel = supabase.channel("livreur-orders-live").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
      setOrders((current) => {
        if (payload.eventType === "DELETE") return current.filter((order) => order.id !== (payload.old as any).id);
        const next = payload.new as any;
        return current.some((order) => order.id === next.id) ? current.map((order) => order.id === next.id ? { ...order, ...next } : order) : [next, ...current];
      });
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const billingMap = useInvoiceStatusMap(orders.map((o) => o.id), "livreur");

  const filtered = useMemo(() => orders
    .filter((o) => matchesSubStatus(billingMap[o.id], subStatusFilter))
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()),
    [orders, billingMap, subStatusFilter]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Mes colis</h2>
      <Card className="p-3">
        <div className="md:max-w-xs">
          <SubStatusFilter value={subStatusFilter} onChange={setSubStatusFilter} />
        </div>
      </Card>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun colis assigné</TableCell></TableRow>
            ) : filtered.map((o) => (
              <Fragment key={o.id}>
              <TableRow>
                <TableCell><ColisMainRowCell order={o} /></TableCell>
                <TableCell>{o.customer_city}</TableCell>
                <TableCell className="font-mono text-sm">{o.customer_phone}</TableCell>
                <TableCell className="font-semibold">{Number(o.order_value).toFixed(2)} MAD</TableCell>
                <TableCell><div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={o.status} /><OrderBillingBadges status={o.status} info={billingMap[o.id]} /></div></TableCell>
                <TableCell className="text-right">
                  {o.status === "Pickup" && (
                    <Button variant="outline" size="sm" onClick={() => printSticker(o)}>
                      <Printer className="h-4 w-4 mr-1" /> Sticker
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setExpandedOrderId(expandedOrderId === o.id ? null : o.id)} aria-label="Voir détails">
                    <ChevronDown className={cn("h-4 w-4 transition-transform", expandedOrderId === o.id && "rotate-180")} />
                  </Button>
                </TableCell>
              </TableRow>
              {expandedOrderId === o.id && (
                <TableRow>
                  <TableCell colSpan={6} className="bg-muted/20 p-0">
                    <OrderDetailsPanel order={o} />
                  </TableCell>
                </TableRow>
              )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default LivreurColis;
