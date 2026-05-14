import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  buildDetailsData,
  buildTimelineData,
  renderCanvasTemplate,
  sanitizeCanvasHtml,
  type ColisCanvasTemplate,
  type TimelineItemSource,
} from "@/lib/colisCanvas";
import { useCanvasSurface } from "@/lib/useColisCanvas";
import { statusColor, statusLabel } from "@/lib/orderStatus";
import { AdminOrderControls } from "@/components/dashboard/AdminOrderControls";

interface OrderSummary {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_city: string;
  product_name: string;
  order_value: number;
  status: string;
  tracking_number: string | null;
  external_tracking_number: string | null;
  comment?: string | null;
  status_note?: string | null;
  postponed_date?: string | null;
  scheduled_date?: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface HistoryItem {
  source: string;
  status: string;
  old_status?: string | null;
  message?: string | null;
  note?: string | null;
  reported_date?: string | null;
  scheduled_date?: string | null;
  changed_at: string;
  actor?: { full_name?: string | null; username?: string | null; role?: string | null } | null;
  actor_label?: string | null;
}

interface DetailsData {
  order?: OrderSummary | null;
  tracking: string | null;
  vendeur?: { full_name?: string | null; username?: string | null; company_name?: string | null } | null;
  livreur: { name: string | null; phone: string | null } | null;
  support: { name: string | null; phone: string | null } | null;
  history: HistoryItem[];
  package_error?: string | null;
}

const cleanActor = (value?: string | null) => (value?.includes("@") ? value.split("@")[0] : value);
const actorName = (item: HistoryItem) => {
  const label = item.actor_label?.trim();
  if (label) return label;
  return (
    cleanActor(item.actor?.full_name) ||
    cleanActor(item.actor?.username) ||
    (item.source === "provider" ? "Transport" : "Système")
  );
};
const vendeurName = (vendeur?: DetailsData["vendeur"]) =>
  vendeur?.full_name || vendeur?.username || vendeur?.company_name || "Système";
const isInternalConfirmed = (item: HistoryItem) =>
  item.source === "odit" &&
  [item.status, item.old_status].some((status) => status?.toLowerCase() === "confirmed");
const isApiCreatedConfirmed = (item: HistoryItem) =>
  item.status?.toLowerCase() === "confirmed" &&
  item.message?.toLowerCase().includes("colis cre") &&
  item.message?.toLowerCase().includes("azizshop") &&
  item.message?.toLowerCase().includes("api");
const historyKey = (item: HistoryItem) =>
  [
    item.source,
    item.status?.toLowerCase() ?? "",
    item.old_status?.toLowerCase() ?? "",
    item.message?.toLowerCase() ?? "",
    item.changed_at,
    item.actor?.username ?? item.actor?.full_name ?? "",
  ].join("|");

const iconForStatus = (s: string) => {
  const k = s.toLowerCase();
  if (k.includes("livr")) return "✓";
  if (k.includes("transit") || k.includes("route") || k.includes("ramass")) return "🚚";
  if (k.includes("pickup")) return "📦";
  if (k.includes("refus") || k.includes("annul")) return "✕";
  if (k.includes("report") || k.includes("program")) return "⏰";
  if (k.includes("confirm")) return "✓";
  return "•";
};

/**
 * Render a canvas template (HTML + CSS) inside an isolated wrapper so its CSS
 * does not leak globally. We scope by prefixing every selector with the wrapper class.
 */
const ScopedCanvas = ({
  template,
  data,
  scopeClass,
}: {
  template: ColisCanvasTemplate;
  data: Record<string, unknown>;
  scopeClass: string;
}) => {
  const html = useMemo(
    () => sanitizeCanvasHtml(renderCanvasTemplate(template.html, data)),
    [template.html, data]
  );
  const css = useMemo(() => {
    const rendered = renderCanvasTemplate(template.css, data);
    return rendered.replace(/(^|\})\s*([^{}@]+)\{/g, (_match, prefix, selectors) => {
      const scoped = selectors
        .split(",")
        .map((sel: string) => {
          const trimmed = sel.trim();
          if (!trimmed) return trimmed;
          return `.${scopeClass} ${trimmed}`;
        })
        .join(", ");
      return `${prefix} ${scoped}{`;
    });
  }, [template.css, data, scopeClass]);

  return (
    <div className={scopeClass}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

export const OrderDetailsPanel = ({
  order,
  className,
  onOrderSynced,
}: {
  order: OrderSummary;
  className?: string;
  onOrderSynced?: (order: OrderSummary) => void;
  /** legacy prop, ignored — kept for signature compatibility */
  previewSettings?: unknown;
}) => {
  const [data, setData] = useState<DetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrSrc, setQrSrc] = useState("");
  const detailsTemplate = useCanvasSurface("details");
  const timelineTemplate = useCanvasSurface("timeline");

  const displayOrder = data?.order ?? order;
  const tracking =
    data?.tracking ||
    displayOrder.external_tracking_number ||
    displayOrder.tracking_number ||
    `ODiT-${displayOrder.id}`;

  const load = async () => {
    setLoading(true);
    const { data: result, error } = await supabase.functions.invoke("order-details", {
      body: { order_id: order.id },
    });
    if (error) {
      toast.error(error.message);
      setData({ tracking, livreur: null, support: null, history: [], package_error: error.message });
    } else {
      const details = result as DetailsData;
      setData(details);
      if (details.order) onOrderSynced?.(details.order);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  useEffect(() => {
    QRCode.toDataURL(tracking, { width: 280, margin: 1 })
      .then(setQrSrc)
      .catch(() => setQrSrc(""));
  }, [tracking]);

  const timelineItems: TimelineItemSource[] = useMemo(() => {
    const seen = new Set<string>();
    const visibleHistory = (data?.history ?? []).filter((item) => {
      if (isInternalConfirmed(item) || isApiCreatedConfirmed(item)) return false;
      const key = historyKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const source = visibleHistory.length
      ? visibleHistory
      : ([
          {
            source: "odit",
            status: displayOrder.status,
            message: "Statut actuel",
            changed_at: displayOrder.created_at,
            actor: null,
          },
        ] as HistoryItem[]);
    return source.map((item) => {
      const actor = actorName(item) === "Système" ? vendeurName(data?.vendeur) : actorName(item);
      const message = item.message
        ? item.message
        : item.old_status == null || item.status === "Crée" || item.status === "Créé"
        ? "Commande créée"
        : `Statut mis à jour vers ${statusLabel(item.status)}`;
      return {
        status: item.status,
        status_label: statusLabel(item.status),
        message,
        note: item.note ?? "",
        actor,
        changed_at: item.changed_at,
        color: statusColor(item.status).hex,
        icon: iconForStatus(item.status),
      };
    });
  }, [data?.history, data?.vendeur, displayOrder.status, displayOrder.created_at]);

  const detailsData = useMemo(
    () =>
      buildDetailsData(displayOrder, {
        qr_image_src: qrSrc,
        livreur_name: data?.livreur?.name ?? null,
        livreur_phone: data?.livreur?.phone ?? null,
        support_name: data?.support?.name ?? null,
        support_phone: data?.support?.phone ?? null,
      }),
    [displayOrder, qrSrc, data?.livreur, data?.support]
  );

  const timelineData = useMemo(() => buildTimelineData(timelineItems), [timelineItems]);

  return (
    <div className={cn("p-4", className)}>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <ScopedCanvas
            template={detailsTemplate}
            data={detailsData}
            scopeClass={`canvas-details-${order.id}`}
          />
        </div>
        <div>
          {loading && timelineItems.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              Chargement de la chronologie…
            </div>
          ) : (
            <ScopedCanvas
              template={timelineTemplate}
              data={timelineData}
              scopeClass={`canvas-timeline-${order.id}`}
            />
          )}
          {data?.package_error && (
            <p className="mt-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Tracking externe indisponible
            </p>
          )}
        </div>
      </div>
      <AdminOrderControls
        orderId={order.id}
        currentStatus={displayOrder.status}
        onChanged={load}
      />
    </div>
  );
};
