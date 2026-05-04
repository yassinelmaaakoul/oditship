import { Fragment, ReactNode, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown, MessageCircle, Pencil, Phone, Printer, Trash2 } from "lucide-react";
import { sanitizeColisHtml } from "@/lib/colisPreview";
import { type ColisPagePreset } from "@/lib/colisPagePreset";

/**
 * Renders Colis listing pages from a user-defined HTML/CSS template.
 *
 * Strategy:
 *  - The page HTML is split on `{{rows}}` so React can mount filter/toolbar
 *    slots and per-row interactive controls between two safe HTML islands.
 *  - The row HTML is parsed once per row and `{{action:*}}` tokens are
 *    replaced by placeholder spans which we then hydrate with real React
 *    buttons via portals-like mounting (renderToString of inert markers).
 *  - To keep the implementation simple and SSR-free, we use a containing
 *    `<div>` per row with `dangerouslySetInnerHTML` for the static parts
 *    and a sibling absolutely-positioned action toolbar derived from the
 *    same actions that would have been injected. The HTML order is
 *    preserved using flex placement; action-spans inside the HTML are
 *    rendered as `<span data-cp-action="...">` and after mount we mount
 *    React buttons inside them.
 */

export interface ColisPageOrder {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_city: string;
  customer_address: string;
  product_name: string;
  order_value: number;
  status: string;
  tracking_number?: string | null;
  external_tracking_number?: string | null;
  created_at: string;
  vendeur_id?: string;
}

export interface ColisPageActionSet {
  selectable?: boolean;
  isSelected?: (id: number) => boolean;
  onToggleSelect?: (id: number) => void;
  onToggleDetails?: (id: number) => void;
  isDetailsOpen?: (id: number) => boolean;
  onPrintSticker?: (order: ColisPageOrder) => void;
  onEdit?: (order: ColisPageOrder) => void;
  onDelete?: (id: number) => void;
  onConfirm?: (order: ColisPageOrder) => void;
  onPickup?: (order: ColisPageOrder) => void;
}

export interface ColisCanvasPageProps {
  preset: ColisPagePreset;
  title: string;
  orders: ColisPageOrder[];
  toolbarSlot?: ReactNode;
  filtersSlot?: ReactNode;
  loading?: boolean;
  emptyMessage?: string;
  detailsRenderer?: (order: ColisPageOrder) => ReactNode;
  actions?: ColisPageActionSet;
  vendeurMap?: Record<string, string>;
}

const STATUS_CLASS_MAP: Record<string, string> = {
  "Crée": "cree", "Créé": "cree",
  "Confirmé": "confirme",
  "Pickup": "pickup", "Ramassé": "pickup",
  "InHouse": "transit", "En transit": "transit", "Transit": "transit",
  "Reporté": "reporte", "Programmé": "reporte",
  "Receptionné": "transit",
  "Livré": "livre",
  "Refusé": "refuse",
  "Annulé": "annule",
  "Retourné": "retourne", "RETURNED": "retourne",
};

const statusClass = (status: string) =>
  STATUS_CLASS_MAP[status] ?? status.toLowerCase().replace(/[^a-z0-9]+/g, "");

const formatRelative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));
};

const tokenValue = (order: ColisPageOrder, key: string, vendeurMap?: Record<string, string>): string => {
  const tracking = order.external_tracking_number || order.tracking_number || `ODiT-${order.id}`;
  switch (key) {
    case "customer_name": return order.customer_name ?? "";
    case "customer_phone": return order.customer_phone ?? "";
    case "customer_city": return order.customer_city ?? "";
    case "customer_address": return order.customer_address ?? "";
    case "product_name": return order.product_name ?? "";
    case "order_value": return `${Number(order.order_value).toFixed(2)} MAD`;
    case "order_value_raw": return String(order.order_value ?? "");
    case "status": return order.status ?? "";
    case "status_label": return (order.status ?? "").toUpperCase();
    case "status_class": return statusClass(order.status ?? "");
    case "tracking": return tracking;
    case "created_at": return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.created_at));
    case "created_relative": return formatRelative(order.created_at);
    case "seller": return (order.vendeur_id && vendeurMap?.[order.vendeur_id]) || "";
    case "driver": return "";
    default: return "";
  }
};

/** Replace {{var}} tokens (skip {{action:*}} which are handled separately) */
const renderRowTemplate = (template: string, order: ColisPageOrder, vendeurMap?: Record<string, string>) =>
  template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => tokenValue(order, key, vendeurMap));

/** Returns array of fragments and action markers in order */
type RowToken = { kind: "html"; html: string } | { kind: "action"; name: string };
const tokenizeRow = (template: string): RowToken[] => {
  const parts: RowToken[] = [];
  const re = /{{\s*action:([a-z_]+)\s*}}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (m.index > last) parts.push({ kind: "html", html: template.slice(last, m.index) });
    parts.push({ kind: "action", name: m[1] });
    last = m.index + m[0].length;
  }
  if (last < template.length) parts.push({ kind: "html", html: template.slice(last) });
  return parts;
};

const ActionButton = ({
  name, order, actions,
}: { name: string; order: ColisPageOrder; actions?: ColisPageActionSet }) => {
  if (!actions) return null;
  const isPickup = order.status === "Pickup";
  const isCree = order.status === "Crée" || order.status === "Créé";
  const isConfirmed = order.status === "Confirmé";

  switch (name) {
    case "select":
      return actions.selectable ? (
        <Checkbox
          checked={actions.isSelected?.(order.id) ?? false}
          onCheckedChange={() => actions.onToggleSelect?.(order.id)}
          aria-label="Sélectionner"
        />
      ) : null;
    case "details":
      return (
        <button type="button" className="cp-btn cp-btn--icon" onClick={() => actions.onToggleDetails?.(order.id)} aria-label="Détails">
          <ChevronDown className={`h-4 w-4 transition-transform ${actions.isDetailsOpen?.(order.id) ? "rotate-180" : ""}`} />
        </button>
      );
    case "edit":
      return isCree && actions.onEdit ? (
        <button type="button" className="cp-btn cp-btn--icon" onClick={() => actions.onEdit?.(order)} aria-label="Modifier">
          <Pencil className="h-4 w-4" />
        </button>
      ) : null;
    case "delete":
      return isCree && actions.onDelete ? (
        <button type="button" className="cp-btn cp-btn--icon cp-btn--danger" onClick={() => actions.onDelete?.(order.id)} aria-label="Supprimer">
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null;
    case "print_sticker":
      return isPickup && actions.onPrintSticker ? (
        <button type="button" className="cp-btn" onClick={() => actions.onPrintSticker?.(order)}>
          <Printer className="h-4 w-4" /> Sticker
        </button>
      ) : null;
    case "confirm":
      return isCree && actions.onConfirm ? (
        <button type="button" className="cp-btn cp-btn--primary" onClick={() => actions.onConfirm?.(order)}>Confirmer</button>
      ) : null;
    case "pickup":
      return isConfirmed && actions.onPickup ? (
        <button type="button" className="cp-btn cp-btn--primary" onClick={() => actions.onPickup?.(order)}>Pickup</button>
      ) : null;
    case "call":
      return order.customer_phone ? (
        <a className="cp-btn cp-btn--icon" href={`tel:${order.customer_phone}`} aria-label="Appeler"><Phone className="h-4 w-4" /></a>
      ) : null;
    case "whatsapp":
      return order.customer_phone ? (
        <a className="cp-btn cp-btn--icon" target="_blank" rel="noreferrer"
          href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}`}
          aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></a>
      ) : null;
    default:
      return null;
  }
};

const Row = ({
  preset, order, actions, vendeurMap,
}: { preset: ColisPagePreset; order: ColisPageOrder; actions?: ColisPageActionSet; vendeurMap?: Record<string, string> }) => {
  const tokens = useMemo(() => tokenizeRow(preset.rowHtml), [preset.rowHtml]);
  return (
    <div style={{ display: "contents" }}>
      {tokens.map((t, i) => t.kind === "html"
        ? <span key={i} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: sanitizeColisHtml(renderRowTemplate(t.html, order, vendeurMap)) }} />
        : <ActionButton key={i} name={t.name} order={order} actions={actions} />
      )}
    </div>
  );
};

export const ColisCanvasPage = ({
  preset, title, orders, toolbarSlot, filtersSlot, loading, emptyMessage = "Aucune commande",
  detailsRenderer, actions, vendeurMap,
}: ColisCanvasPageProps) => {
  // Page header HTML is split on slots so React owns interactive children.
  const segments = useMemo(() => {
    const head = preset.pageHeaderHtml
      .replace(/{{\s*title\s*}}/g, title)
      .replace(/{{\s*count\s*}}/g, String(orders.length));
    const re = /{{\s*(filters|toolbar|rows)\s*}}/g;
    const out: { kind: "html" | "slot"; value: string }[] = [];
    let last = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(head))) {
      if (m.index > last) out.push({ kind: "html", value: head.slice(last, m.index) });
      out.push({ kind: "slot", value: m[1] });
      last = m.index + m[0].length;
    }
    if (last < head.length) out.push({ kind: "html", value: head.slice(last) });
    return out;
  }, [preset.pageHeaderHtml, title, orders.length]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: preset.css }} />
      {segments.map((seg, i) => {
        if (seg.kind === "html") {
          return <span key={i} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: sanitizeColisHtml(seg.value) }} />;
        }
        if (seg.value === "filters") return <Fragment key={i}>{filtersSlot}</Fragment>;
        if (seg.value === "toolbar") return <Fragment key={i}>{toolbarSlot}</Fragment>;
        if (seg.value === "rows") {
          if (loading) return <div key={i} className="cp-empty">Chargement…</div>;
          if (orders.length === 0) return <div key={i} className="cp-empty" dangerouslySetInnerHTML={{ __html: sanitizeColisHtml(preset.emptyHtml.replace(/Aucune commande/, emptyMessage)) }} />;
          return (
            <Fragment key={i}>
              {orders.map((order) => (
                <Fragment key={order.id}>
                  <Row preset={preset} order={order} actions={actions} vendeurMap={vendeurMap} />
                  {actions?.isDetailsOpen?.(order.id) && detailsRenderer && (
                    <div className="cp-details">{detailsRenderer(order)}</div>
                  )}
                </Fragment>
              ))}
            </Fragment>
          );
        }
        return null;
      })}
    </>
  );
};
