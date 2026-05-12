import { supabase } from "@/integrations/supabase/client";
import { fetchAllPacks, resolvePrice } from "./pricingResolver";

const db = supabase as any;

export interface GenerateOptions {
  recipientType: "vendeur" | "livreur";
  /** Optional: only generate for one recipient. Otherwise process all eligible. */
  targetId?: string;
}

const DELIVERED = ["livré", "delivered"];
const REFUSED = ["refusé", "refused"];
const CANCELLED = ["annulé", "cancelled", "annule"];
const BILLABLE = [...DELIVERED, ...REFUSED, ...CANCELLED];
const norm = (s: string) => (s || "").toLowerCase().trim();
const isIn = (arr: string[], s: string) => arr.includes(norm(s));

const sum = (arr: number[]) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

/**
 * Returns all billable orders that are NOT yet linked to any invoice
 * for the given recipient type.
 */
export const fetchUnbilledOrders = async (recipientType: "vendeur" | "livreur") => {
  // Pull all already-invoiced order ids for that recipient type
  const { data: linked, error: e0 } = await db
    .from("invoice_items")
    .select("order_id, invoices!inner(recipient_type)")
    .eq("invoices.recipient_type", recipientType);
  if (e0) throw e0;
  const billedIds = new Set<number>((linked ?? []).map((r: any) => r.order_id).filter(Boolean));

  let q = supabase
    .from("orders")
    .select("id, tracking_number, vendeur_id, assigned_livreur_id, customer_city, product_name, order_value, status, updated_at")
    .or(BILLABLE.map((s) => `status.ilike.${s}`).join(","));
  const { data: orders, error } = await q;
  if (error) throw error;

  const recipientKey = recipientType === "vendeur" ? "vendeur_id" : "assigned_livreur_id";
  return (orders ?? []).filter((o: any) => !billedIds.has(o.id) && o[recipientKey]);
};

/** Counts unbilled orders grouped by recipient. */
export const fetchUnbilledCounts = async (recipientType: "vendeur" | "livreur") => {
  const orders = await fetchUnbilledOrders(recipientType);
  const counts = new Map<string, number>();
  const key = recipientType === "vendeur" ? "vendeur_id" : "assigned_livreur_id";
  for (const o of orders as any[]) {
    counts.set(o[key], (counts.get(o[key]) ?? 0) + 1);
  }
  return { counts, total: orders.length };
};

export const generateInvoices = async (opts: GenerateOptions) => {
  const { recipientType, targetId } = opts;

  let orders = await fetchUnbilledOrders(recipientType);
  if (orders.length === 0) return { created: 0, invoices: [] };

  const recipientKey = recipientType === "vendeur" ? "vendeur_id" : "assigned_livreur_id";
  if (targetId) orders = orders.filter((o: any) => o[recipientKey] === targetId);
  if (orders.length === 0) return { created: 0, invoices: [] };

  // Group by recipient
  const groups = new Map<string, any[]>();
  for (const o of orders) {
    const k = (o as any)[recipientKey];
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(o);
  }

  const { packs, links } = await fetchAllPacks();
  const created: any[] = [];

  for (const [recipientId, recipientOrders] of groups) {
    const items = recipientOrders.map((o: any) => {
      const price = resolvePrice(packs, links, {
        pickupCity: null,
        destCity: o.customer_city,
        vendeurId: recipientType === "vendeur" ? recipientId : o.vendeur_id,
        livreurId: recipientType === "livreur" ? recipientId : o.assigned_livreur_id,
      });
      const isDelivered = isIn(DELIVERED, o.status);
      const isRefused = isIn(REFUSED, o.status);
      const isCancelled = isIn(CANCELLED, o.status);
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
        _updated_at: o.updated_at,
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

    const dates = items.map((i) => i._updated_at).filter(Boolean).sort();
    const period_start = (dates[0] ?? new Date().toISOString()).slice(0, 10);
    const period_end = (dates[dates.length - 1] ?? new Date().toISOString()).slice(0, 10);

    const { data: inv, error: e1 } = await db.from("invoices").insert({
      recipient_type: recipientType,
      vendeur_id: recipientType === "vendeur" ? recipientId : null,
      livreur_id: recipientType === "livreur" ? recipientId : null,
      period_start,
      period_end,
      total_delivered_amount: total_delivered,
      total_refused_fees,
      total_annule_fees,
      delivery_fees,
      packaging_fees: 0,
      net_amount,
      status: "draft",
    }).select("id").single();
    if (e1) throw e1;

    const itemsRows = items.map(({ _updated_at, ...i }) => ({ ...i, invoice_id: inv.id }));
    const { error: e2 } = await db.from("invoice_items").insert(itemsRows);
    if (e2) throw e2;

    created.push({ invoice_id: inv.id, recipientId, count: items.length });
  }

  return { created: created.length, invoices: created };
};
