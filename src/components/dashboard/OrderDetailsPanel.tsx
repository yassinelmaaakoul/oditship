import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { statusLabel } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";
import { Truck, UserRound } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  buildDetailsData,
  renderCanvasTemplate,
  sanitizeCanvasHtml,
  type ColisCanvasTemplate,
} from "@/lib/colisCanvas";
import { useCanvasSurface } from "@/lib/useColisCanvas";

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

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

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
  // Naive scoping: wrap every CSS selector with `.${scopeClass} `. Splits on
  // top-level commas/braces. Good enough for templates we author or that
  // admins write (no @media nesting, etc.).
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

  const history = useMemo(() => {
    const seen = new Set<string>();
    const visibleHistory = (data?.history ?? []).filter((item) => {
      if (isInternalConfirmed(item) || isApiCreatedConfirmed(item)) return false;
      const key = historyKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (visibleHistory.length) return visibleHistory;
    return [
      {
        source: "odit",
        status: displayOrder.status,
        message: "Statut actuel",
        changed_at: displayOrder.created_at,
        actor: null,
      },
    ] as HistoryItem[];
  }, [data?.history, displayOrder.status, displayOrder.created_at]);

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

  return (
    <div className={cn("grid gap-4 p-4 lg:grid-cols-[1fr_1fr]", className)}>
      {/* Left card: rendered from the canvas template */}
      <div>
        <ScopedCanvas
          template={detailsTemplate}
          data={detailsData}
          scopeClass={`canvas-details-${order.id}`}
        />
      </div>

      {/* Right card: activity timeline (kept React-rendered) */}
      <Card className="p-5 shadow-card">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Chronologie d'activité</h3>
        </div>
        {data?.package_error && (
          <p className="mb-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Tracking externe indisponible
          </p>
        )}
        <div className="relative space-y-0 pl-7">
          <div className="absolute left-[15px] top-2 h-[calc(100%-1rem)] w-px bg-border" />
          {loading && history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : (
            history.map((item, index) => {
              const actor =
                actorName(item) === "Système" ? vendeurName(data?.vendeur) : actorName(item);
              const message = item.message
                ? item.message
                : item.old_status == null || item.status === "Crée" || item.status === "Créé"
                ? "Commande créée"
                : `Statut mis à jour vers ${statusLabel(item.status)}`;
              return (
                <div key={`${item.changed_at}-${index}`} className="relative pb-5 last:pb-0">
                  <div className="absolute -left-7 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div className="ml-4 space-y-1">
                    <StatusBadge status={item.status} />
                    <p className="text-sm font-medium">{message}</p>
                    {item.note && (
                      <p className="rounded-md bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                        {item.note}
                      </p>
                    )}
                    {(item.reported_date || item.scheduled_date) && (
                      <p className="text-xs text-muted-foreground">
                        {[item.reported_date, item.scheduled_date]
                          .filter(Boolean)
                          .map((d) => formatDate(d))
                          .join(" · ")}
                      </p>
                    )}
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <UserRound className="h-3 w-3" />
                      {actor} · {formatDate(item.changed_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
};
