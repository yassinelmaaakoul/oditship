import { supabase } from "@/integrations/supabase/client";
import { fetchAllPacks, resolvePrice } from "./pricingResolver";

const db = supabase as any;

export interface GenerateOptions {
  recipientType: "vendeur" | "livreur";
  /** Optional: only generate for one recipient. Otherwise process all eligible. */
  targetId?: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
}

/**
 * Statuses considered "billable" for both flows.
 * - delivered → full delivery fee + collect order_value
 * - refused/cancelled → only the corresponding fee
 */
const DELIVERED = ["Livré", "Delivered"];
const REFUSED = ["Refusé", "Refused"];
const CANCELLED = ["Annulé", "Cancelled", "Annule"];

const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

export const generateInvoices = async (opts: GenerateOptions) => {
  const { recipientType, targetId, periodStart, periodEnd } = opts;

  // 1. Pull orders updated/delivered in the period
  let q = supabase
    .from("orders")
    .select("id, tracking_number, vendeur_id, assigned_livreur_id, customer_city, product_name, order_value, status, updated_at")
    .gte("updated_at", `${periodStart}T00:00:00Z`)
    .lt("updated_at", `${periodEnd}T23:59:59Z`)
    .in("status", [...DELIVERED, ...REFUSED, ...CANCELLED]);

  if (recipientType === "vendeur" && targetId) q = q.eq("vendeur_id", targetId);
  if (recipientType === "livreur" && targetId) q = q.eq("assigned_livreur_id", targetId);

  const { data: orders, error } = await q;
  if (error) throw error;
  if (!orders || orders.length === 0) return { created: 0, invoices: [] };

  // 2. Group by recipient
  const groups = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = recipientType === "vendeur" ? o.vendeur_id : o.assigned_livreur_id;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  const { packs, links } = await fetchAllPacks();
  const created: any[] = [];

  for (const [recipientId, recipientOrders] of groups) {
    // Build items
    const items = recipientOrders.map((o) => {
      const price = resolvePrice(packs, links, {
        pickupCity: null,
        destCity: o.customer_city,
        vendeurId: recipientType === "vendeur" ? recipientId : o.vendeur_id,
        livreurId: recipientType === "livreur" ? recipientId : o.assigned_livreur_id,
      });
      const isDelivered = DELIVERED.includes(o.status);
      const isRefused = REFUSED.includes(o.status);
      const isCancelled = CANCELLED.includes(o.status);
      const fee = isDelivered ? price.delivery_fee : isRefused ? price.refusal_fee : isCancelled ? price.annulation_fee : 0;
      const feeType = isDelivered ? "livraison" : isRefused ? "refus" : "annulation";
      return {
        order_id: o.id,
        tracking_number: o.tracking_number,
        product_name: o.product_name,
        customer_city: o.customer_city,
        status_snapshot: o.status,
        order_value: isDelivered ? Number(o.order_value || 0) : 0,
        fee_amount: fee,
        fee_type: feeType,
      };
    });

    const total_delivered = sum(items.filter((i) => i.fee_type === "livraison").map((i) => i.order_value));
    const total_refused_fees = sum(items.filter((i) => i.fee_type === "refus").map((i) => i.fee_amount));
    const total_annule_fees = sum(items.filter((i) => i.fee_type === "annulation").map((i) => i.fee_amount));
    const delivery_fees = sum(items.filter((i) => i.fee_type === "livraison").map((i) => i.fee_amount));
    const net_amount =
      recipientType === "vendeur"
        ? total_delivered - delivery_fees - total_refused_fees - total_annule_fees
        : delivery_fees + total_refused_fees + total_annule_fees;

    const invoicePayload: any = {
      recipient_type: recipientType,
      vendeur_id: recipientType === "vendeur" ? recipientId : null,
      livreur_id: recipientType === "livreur" ? recipientId : null,
      period_start: periodStart,
      period_end: periodEnd,
      total_delivered_amount: total_delivered,
      total_refused_fees,
      total_annule_fees,
      delivery_fees,
      packaging_fees: 0,
      net_amount,
      status: "draft",
    };

    const { data: inv, error: e1 } = await db.from("invoices").insert(invoicePayload).select("id").single();
    if (e1) throw e1;

    const itemsRows = items.map((i) => ({ ...i, invoice_id: inv.id }));
    const { error: e2 } = await db.from("invoice_items").insert(itemsRows);
    if (e2) throw e2;

    created.push({ invoice_id: inv.id, recipientId, count: items.length });
  }

  return { created: created.length, invoices: created };
};
