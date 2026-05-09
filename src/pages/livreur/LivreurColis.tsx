import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderDetailsPanel } from "@/components/dashboard/OrderDetailsPanel";
import { cn } from "@/lib/utils";
import { ChevronDown, Printer } from "lucide-react";
import { printSticker } from "@/lib/printSticker";

const ORDERS_COLUMNS = "id,customer_name,customer_phone,customer_address,customer_city,product_name,order_value,open_package,comment,status,tracking_number,external_tracking_number,status_note,postponed_date,scheduled_date,created_at,vendeur_id,assigned_livreur_id,driver_name,driver_phone";

const LivreurColis = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("orders").select(ORDERS_COLUMNS).order("created_at", { ascending: false }).limit(500)
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

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Mes colis</h2>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tracking</TableHead>
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
            ) : orders.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun colis assigné</TableCell></TableRow>
            ) : orders.map((o) => (
              <Fragment key={o.id}>
              <TableRow>
                <TableCell className="font-mono text-xs">{o.external_tracking_number || o.tracking_number || `ODiT-${o.id}`}</TableCell>
                <TableCell><div className="font-medium">{o.customer_name}</div><div className="text-xs text-muted-foreground">{o.product_name}</div></TableCell>
                <TableCell>{o.customer_city}</TableCell>
                <TableCell className="font-mono text-sm">{o.customer_phone}</TableCell>
                <TableCell className="font-semibold">{Number(o.order_value).toFixed(2)} MAD</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
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
                  <TableCell colSpan={7} className="bg-muted/20 p-0">
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
