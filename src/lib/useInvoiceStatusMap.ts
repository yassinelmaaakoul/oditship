import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export interface InvoiceStatusInfo {
  invoiced: boolean;
  paid: boolean;
}

/**
 * For a list of order IDs, returns map: orderId → { invoiced, paid } for the
 * VENDOR invoice that contains that order (if any). Used to show sub-badges
 * next to the order's main status.
 */
export const useInvoiceStatusMap = (orderIds: number[]) => {
  const [map, setMap] = useState<Record<number, InvoiceStatusInfo>>({});

  const key = orderIds.slice().sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (orderIds.length === 0) { setMap({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await db
        .from("invoice_items")
        .select("order_id, invoices!inner(status, recipient_type)")
        .in("order_id", orderIds)
        .eq("invoices.recipient_type", "vendeur");
      if (cancelled) return;
      const next: Record<number, InvoiceStatusInfo> = {};
      for (const r of (data ?? []) as any[]) {
        if (!r.order_id) continue;
        next[r.order_id] = { invoiced: true, paid: r.invoices?.status === "paid" };
      }
      setMap(next);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
};
