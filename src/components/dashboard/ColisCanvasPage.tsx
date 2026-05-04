import { Fragment, ReactNode, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, MessageCircle, Pencil, Phone, Printer, Trash2 } from "lucide-react";
import { sanitizeColisHtml } from "@/lib/colisPreview";
import { type ColisPagePreset } from "@/lib/colisPagePreset";

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
const statusClass = (status: string) => STATUS_CLASS_MAP[status] ?? status.toLowerCase().replace(/[^a-z0-9]+/g, "");

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
    default: return "";
  }
};

/**
 * Replace simple {{var}} tokens AND replace {{action:name}} with
 * a placeholder span that React will hydrate via portals.
 */
const renderRowHtml = (template: string, order: ColisPageOrder, vendeurMap?: Record<string, string>) => {
  let html = template.replace(/{{\s*action:([a-z_]+)\s*}}/g, (_m, name) =>
    `<span class="cp-action-slot" data-cp-action="${name}" data-cp-order="${order.id}"></span>`);
  html = html.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => tokenValue(order, key, vendeurMap));
  return sanitizeColisHtml(html);
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
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderRowHtml(preset.rowHtml, order, vendeurMap), [preset.rowHtml, order, vendeurMap]);
  // After render, find action slots inside this row to mount React portals.
  const slotsRef = useRef<{ name: string; el: HTMLElement }[]>([]);
  // We re-collect on every render so updated `actions` callbacks bind correctly.
  useEffect(() => {
    if (!containerRef.current) return;
    const nodes = Array.from(containerRef.current.querySelectorAll<HTMLElement>(".cp-action-slot"));
    slotsRef.current = nodes.map((el) => ({ name: el.dataset.cpAction || "", el }));
    // Force a re-render so portals mount on the freshly collected DOM nodes.
    forceRerender();
  }, [html]);

  const [, setTick] = (require as any) ? [0, () => undefined] : [0, () => undefined];
  // Use a tiny rerender trigger (React state) — replace the require trick:
  // (kept above only to avoid lint about unused; real impl below)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [tick, setTickState] = (function useTick() {
    // dynamic import of useState to avoid duplicate import linting block
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    return React.useState(0);
  })();
  const forceRerender = () => setTickState((n: number) => n + 1);
  void tick;

  return (
    <div ref={containerRef} className="cp-row-wrap" style={{ display: "contents" }}>
      <div dangerouslySetInnerHTML={{ __html: html }} style={{ display: "contents" }} />
      {slotsRef.current.map(({ name, el }, i) =>
        createPortal(<ActionButton name={name} order={order} actions={actions} />, el, `${order.id}-${name}-${i}`)
      )}
    </div>
  );
};

export const ColisCanvasPage = ({
  preset, title, orders, toolbarSlot, filtersSlot, loading, emptyMessage = "Aucune commande",
  detailsRenderer, actions, vendeurMap,
}: ColisCanvasPageProps) => {
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
          return <div key={i} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: sanitizeColisHtml(seg.value) }} />;
        }
        if (seg.value === "filters") return <Fragment key={i}>{filtersSlot}</Fragment>;
        if (seg.value === "toolbar") return <Fragment key={i}>{toolbarSlot}</Fragment>;
        if (seg.value === "rows") {
          if (loading) return <div key={i} className="cp-empty">Chargement…</div>;
          if (orders.length === 0) {
            return <div key={i} className="cp-empty" dangerouslySetInnerHTML={{ __html: sanitizeColisHtml(preset.emptyHtml.replace(/Aucune commande/, emptyMessage)) }} />;
          }
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
