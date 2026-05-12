import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export interface InvoiceStatusInfo {
  invoiced: boolean;
  paid: boolean;
  invoiceId?: number;
}

/**
 * For a list of order IDs, returns map: orderId → { invoiced, paid }.
 * `recipientType` controls which invoice scope is checked:
 *   - "vendeur" → vendor invoice (used by Vendeur/Admin order listings)
 *   - "livreur" → driver invoice (used by Livreur listings)
 */
export const useInvoiceStatusMap = (
  orderIds: number[],
  recipientType: "vendeur" | "livreur" = "vendeur",
) => {
  const [map, setMap] = useState<Record<number, InvoiceStatusInfo>>({});
  const key = orderIds.slice().sort((a, b) => a - b).join(",") + ":" + recipientType;

  useEffect(() => {
    if (orderIds.length === 0) { setMap({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await db
        .from("invoice_items")
        .select("order_id, invoice_id, invoices!inner(status, recipient_type)")
        .in("order_id", orderIds)
        .eq("invoices.recipient_type", recipientType);
      if (cancelled) return;
      const next: Record<number, InvoiceStatusInfo> = {};
      for (const r of (data ?? []) as any[]) {
        if (!r.order_id) continue;
        next[r.order_id] = {
          invoiced: true,
          paid: r.invoices?.status === "paid",
          invoiceId: r.invoice_id,
        };
      }
      setMap(next);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
};
