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
    .select("id, tracking_number, external_tracking_number, vendeur_id, assigned_livreur_id, customer_city, product_name, order_value, status, updated_at")
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
      // Vendor billing → only consider vendor & global packs (never livreur).
      // Livreur billing → only consider livreur & global packs (never vendor).
      const price = resolvePrice(packs, links, {
        pickupCity: null,
        destCity: o.customer_city,
        vendeurId: recipientType === "vendeur" ? recipientId : null,
        livreurId: recipientType === "livreur" ? recipientId : null,
      });
      const isDelivered = isIn(DELIVERED, o.status);
      const isRefused = isIn(REFUSED, o.status);
      const isCancelled = isIn(CANCELLED, o.status);
      const fee = isDelivered ? price.delivery_fee : isRefused ? price.refusal_fee : isCancelled ? price.annulation_fee : 0;
      const feeType = isDelivered ? "livraison" : isRefused ? "refus" : "annulation";
      return {
        order_id: o.id,
        tracking_number: o.tracking_number || o.external_tracking_number || `ODiT-${o.id}`,
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
    const totalFees = delivery_fees + total_refused_fees + total_annule_fees;
    // Reste = COD livré − tous les frais (mêmes formule pour vendeur & livreur).
    const net_amount = total_delivered - totalFees;

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

    // Per requirement: only vendor invoice events show up in the order chronology.
    // The chronology row uses "Facturé" as new_status so the badge displays in amber.
    if (recipientType === "vendeur") {
      const histRows = recipientOrders.map((o: any) => ({
        order_id: o.id,
        old_status: o.status,
        new_status: "Facturé",
        notes: `Facture #${inv.id} créée`,
        actor_label: "Facturation",
      }));
      if (histRows.length) await db.from("order_status_history").insert(histRows);
    }

    created.push({ invoice_id: inv.id, recipientId, count: items.length });
  }

  return { created: created.length, invoices: created };
};

/**
 * Mark an invoice as paid (or unpaid) and append a chronologie entry on every
 * order in that invoice. Optionally stores a payment reference + proof URL.
 */
export const setInvoicePaid = async (
  invoiceId: number,
  paid: boolean,
  extra?: { reference?: string | null; proofUrl?: string | null },
) => {
  const patch: any = {
    status: paid ? "paid" : "draft",
    paid_at: paid ? new Date().toISOString() : null,
  };
  if (extra?.reference !== undefined) patch.payment_reference = extra.reference;
  if (extra?.proofUrl !== undefined) patch.payment_proof_url = extra.proofUrl;
  const { data: inv, error } = await db.from("invoices").update(patch).eq("id", invoiceId).select("recipient_type").single();
  if (error) throw error;

  // Only vendor invoice activity is mirrored to the order chronology.
  if (inv?.recipient_type === "vendeur") {
    const { data: its } = await db.from("invoice_items").select("order_id, status_snapshot").eq("invoice_id", invoiceId);
    const rows = ((its ?? []) as any[])
      .filter((r) => r.order_id)
      .map((r) => ({
        order_id: r.order_id,
        old_status: r.status_snapshot,
        new_status: paid ? "Payée" : "Facturé",
        notes: `Facture #${invoiceId} ${paid ? "payée" : "marquée non payée"}`,
        actor_label: "Facturation",
      }));
    if (rows.length) await db.from("order_status_history").insert(rows);
  }
  return inv;
};

/**
 * Recompute and persist net_amount for one invoice. Used after the admin
 * tweaks line items or the "autre tarif" extra fee.
 *
 *   vendor invoice → net = COD(delivered) − (delivery_fees + refused_fees + annule_fees + extra)
 *   livreur invoice → net = (delivery_fees + refused_fees + annule_fees) + extra
 */
export const recomputeInvoiceTotals = async (invoiceId: number) => {
  const { data: inv, error: e1 } = await db
    .from("invoices")
    .select("recipient_type, extra_amount")
    .eq("id", invoiceId)
    .single();
  if (e1) throw e1;
  const { data: its, error: e2 } = await db
    .from("invoice_items")
    .select("order_value, fee_amount, fee_type")
    .eq("invoice_id", invoiceId);
  if (e2) throw e2;

  const items = (its ?? []) as any[];
  const sumBy = (pred: (i: any) => boolean, key: "order_value" | "fee_amount") =>
    items.filter(pred).reduce((a, i) => a + Number(i[key] || 0), 0);

  const total_delivered = sumBy((i) => i.fee_type === "livraison", "order_value");
  const delivery_fees = sumBy((i) => i.fee_type === "livraison", "fee_amount");
  const total_refused_fees = sumBy((i) => i.fee_type === "refus", "fee_amount");
  const total_annule_fees = sumBy((i) => i.fee_type === "annulation", "fee_amount");
  const extra = Number(inv?.extra_amount || 0);
  const totalFees = delivery_fees + total_refused_fees + total_annule_fees;
  const net_amount =
    inv?.recipient_type === "vendeur"
      ? total_delivered - totalFees - extra
      : totalFees + extra;

  const { error: e3 } = await db
    .from("invoices")
    .update({
      total_delivered_amount: total_delivered,
      delivery_fees,
      total_refused_fees,
      total_annule_fees,
      net_amount,
    })
    .eq("id", invoiceId);
  if (e3) throw e3;
  return { net_amount, total_delivered, totalFees, extra };
};
