import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { statusLabel } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";
import { Bike, Download, Headphones, MapPin, Package, QrCode, Truck, UserRound } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { colisSectionStyle, defaultColisPreviewSettings, getColisPreviewValue, renderColisTemplate, sanitizeColisHtml, sortedVisibleFields, type ColisPreviewSettings } from "@/lib/colisPreview";

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

const cleanActor = (value?: string | null) => value?.includes("@") ? value.split("@")[0] : value;
const actorName = (item: HistoryItem) => {
  const label = item.actor_label?.trim();
  if (label) return label;
  return cleanActor(item.actor?.full_name) || cleanActor(item.actor?.username) || (item.source === "provider" ? "Transport" : "Système");
};
const vendeurName = (vendeur?: DetailsData["vendeur"]) => vendeur?.full_name || vendeur?.username || vendeur?.company_name || "Système";
const isInternalConfirmed = (item: HistoryItem) =>
  item.source === "odit" && [item.status, item.old_status].some((status) => status?.toLowerCase() === "confirmed");
const isApiCreatedConfirmed = (item: HistoryItem) =>
  item.status?.toLowerCase() === "confirmed" && item.message?.toLowerCase().includes("colis cre") && item.message?.toLowerCase().includes("azizshop") && item.message?.toLowerCase().includes("api");
const isTransitStatus = (status?: string | null) => status?.toLowerCase().includes("transit") ?? false;
const historyKey = (item: HistoryItem) => [
  item.source,
  item.status?.toLowerCase() ?? "",
  item.old_status?.toLowerCase() ?? "",
  item.message?.toLowerCase() ?? "",
  item.changed_at,
  item.actor?.username ?? item.actor?.full_name ?? "",
].join("|");
const hasMeta = (note?: string | null, reported?: string | null, scheduled?: string | null) => Boolean(note || reported || scheduled);
const metaValues = (note?: string | null, reported?: string | null, scheduled?: string | null) => [note, reported ? formatDate(reported) : null, scheduled ? formatDate(scheduled) : null].filter(Boolean) as string[];
const sectionLayoutClass = (layout: string) => layout === "inline" ? "flex flex-wrap items-center" : layout === "grid" ? "grid grid-cols-2" : "flex flex-col";
const iconFor = (icon: string) => {
  const map = { package: Package, truck: Truck, bike: Bike, invoice: Download, support: Headphones, qr: QrCode, map: MapPin, user: UserRound };
  return map[icon as keyof typeof map] ?? Package;
};

export const OrderDetailsPanel = ({
  order,
  className,
  onOrderSynced,
  previewSettings = defaultColisPreviewSettings,
}: {
  order: OrderSummary;
  className?: string;
  onOrderSynced?: (order: OrderSummary) => void;
  previewSettings?: ColisPreviewSettings;
}) => {
  const [data, setData] = useState<DetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrSrc, setQrSrc] = useState("");
  const displayOrder = data?.order ?? order;
  const tracking = data?.tracking || displayOrder.external_tracking_number || displayOrder.tracking_number || `ODiT-${displayOrder.id}`;

  const load = async () => {
    setLoading(true);
    const { data: result, error } = await supabase.functions.invoke("order-details", { body: { order_id: order.id } });
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

  useEffect(() => { load(); }, [order.id]);

  useEffect(() => {
    QRCode.toDataURL(tracking, { width: 180, margin: 2 }).then(setQrSrc).catch(() => setQrSrc(""));
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
    return [{ source: "odit", status: displayOrder.status, message: "Statut actuel", changed_at: displayOrder.created_at, actor: null }] as HistoryItem[];
  }, [data?.history, displayOrder.status, displayOrder.created_at]);
  const hasLivreur = Boolean(data?.livreur?.name || data?.livreur?.phone);
  const livreurText = loading
    ? "Chargement..."
    : hasLivreur
      ? data?.livreur?.name || "Livreur assigné"
      : isTransitStatus(displayOrder.status)
        ? "Informations transport en attente"
        : "Disponible après passage en transit";
  const previewData = {
    ...displayOrder,
    tracking,
    vendeur: vendeurName(data?.vendeur),
    livreur: hasLivreur ? [data?.livreur?.name, data?.livreur?.phone].filter(Boolean).join(" · ") : "",
    support: [data?.support?.name, data?.support?.phone].filter(Boolean).join(" · "),
    invoice_label: "Facture client",
    invoice_status: "Disponible après la fin du trajet",
    courier_name: data?.livreur?.name || "",
    courier_phone: data?.livreur?.phone || "",
    support_name: data?.support?.name || "Support ODiT",
    support_phone: data?.support?.phone || "",
    qr_value: tracking,
  };
  const renderConfiguredSection = (section: ColisPreviewSettings["details"], itemData: Record<string, unknown>) => {
    if (section.useCustomHtml) return <div className="rounded-lg border border-border p-3" style={colisSectionStyle(section, itemData)} dangerouslySetInnerHTML={{ __html: sanitizeColisHtml(`<style>${renderColisTemplate(section.css, itemData)}</style>${renderColisTemplate(section.html, itemData)}`) }} />;
    return <div className={cn("rounded-lg border border-border text-sm", sectionLayoutClass(section.layout))} style={colisSectionStyle(section, itemData)}>
      {section.icon !== "none" && (() => { const Icon = iconFor(section.icon); return <Icon className="h-5 w-5 shrink-0" style={{ color: section.style.accent }} />; })()}
      {sortedVisibleFields(section).map((field) => {
        const value = getColisPreviewValue(itemData, field.key);
        return value ? <span key={field.key} className={field.slot === "primary" ? "font-semibold" : "rounded-md bg-muted px-3 py-1 font-medium text-muted-foreground"}>{value}</span> : null;
      })}
    </div>;
  };

  return (
    <div className={cn("grid gap-4 p-4 lg:grid-cols-[1fr_1fr]", className)}>
      <Card className="p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <h3 className="text-lg font-bold">{order.customer_name}</h3>
            <p className="text-sm font-semibold text-foreground/80">{order.customer_phone} · {order.product_name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{order.customer_address} - {order.customer_city}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={displayOrder.status} />
            <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{tracking}</span>
          </div>
        </div>

        <div className="grid gap-4 py-5 md:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            {renderConfiguredSection(previewSettings.details, previewData)}
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Montant</p>
                <p className="font-semibold">{Number(order.order_value).toFixed(2)} MAD</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Destination</p>
                <p className="font-semibold">{order.customer_city}</p>
              </div>
            </div>
            {order.comment && (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{order.comment}</p>
            )}
            {hasMeta(displayOrder.status_note, displayOrder.postponed_date, displayOrder.scheduled_date) && (
              <div className="flex flex-wrap gap-2 rounded-lg border border-border p-3 text-sm">
                {metaValues(displayOrder.status_note, displayOrder.postponed_date, displayOrder.scheduled_date).map((value, index) => (
                  <span key={index} className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">{value}</span>
                ))}
              </div>
            )}
          </div>
          <div className={cn("flex-col items-center rounded-lg border border-border", previewSettings.qr.qrPlacement === "hidden" && "hidden", previewSettings.qr.qrPlacement === "left" && "order-first", previewSettings.qr.qrPlacement === "top" && "md:col-span-2 md:order-first", previewSettings.qr.qrPlacement === "bottom" && "md:col-span-2 md:order-last", previewSettings.qr.qrPlacement === "right" && "flex")} style={colisSectionStyle(previewSettings.qr, previewData)}>
            {qrSrc ? <img src={qrSrc} alt={`QR code ${tracking}`} className="h-36 w-36" /> : <QrCode className="h-24 w-24 text-muted-foreground" />}
            <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground"><QrCode className="h-3.5 w-3.5" />{tracking}</div>
          </div>
        </div>

        <div className={cn("space-y-3 rounded-lg border border-border", previewSettings.actions.buttonPlacement === "hidden" && "hidden")} style={colisSectionStyle(previewSettings.actions, previewData)}>
          <h4 className="text-base font-bold">Actions:</h4>
          <div className={cn("flex items-center justify-between gap-3 rounded-lg border border-border p-3", previewSettings.actions.buttonPlacement === "left" && "flex-row-reverse", previewSettings.actions.buttonPlacement === "bottom" && "flex-col items-start")}>
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-muted-foreground" />
              <div>{renderConfiguredSection(previewSettings.invoice, previewData)}</div>
            </div>
            <Button size="sm" variant="outline" disabled>Télécharger</Button>
          </div>
          <div className={cn("flex items-center justify-between gap-3 rounded-lg border border-border p-3", previewSettings.actions.buttonPlacement === "left" && "flex-row-reverse", previewSettings.actions.buttonPlacement === "bottom" && "flex-col items-start")}>
            <div className="flex items-center gap-3">
              <Bike className="h-5 w-5 text-foreground" />
              <div>{renderConfiguredSection(previewSettings.courier, { ...previewData, courier_name: data?.livreur?.name || livreurText })}</div>
            </div>
            <span className="font-mono text-sm">{hasLivreur ? data?.livreur?.phone || "—" : "—"}</span>
          </div>
          <div className={cn("flex items-center justify-between gap-3 rounded-lg border border-border p-3", previewSettings.actions.buttonPlacement === "left" && "flex-row-reverse", previewSettings.actions.buttonPlacement === "bottom" && "flex-col items-start")}>
            <div className="flex items-center gap-3">
              <Headphones className="h-5 w-5 text-foreground" />
              <div>{renderConfiguredSection(previewSettings.support, previewData)}</div>
            </div>
            <span className="font-mono text-sm">{data?.support?.phone || "—"}</span>
          </div>
        </div>
      </Card>

      <Card className="p-5 shadow-card">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Chronologie d'activité</h3>
        </div>
        {data?.package_error && <p className="mb-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Tracking externe indisponible</p>}
        <div className="relative space-y-0 pl-7">
          <div className="absolute left-[15px] top-2 h-[calc(100%-1rem)] w-px bg-border" />
          {history.map((item, index) => {
            const timelineData = {
              ...previewData,
              status_note: item.note,
              postponed_date: item.reported_date,
              scheduled_date: item.scheduled_date,
              history_status: statusLabel(item.status),
              history_message: item.message && item.message !== item.note ? item.message : `Statut mis à jour vers ${statusLabel(item.status)}`,
              history_actor: actorName(item) === "Système" ? vendeurName(data?.vendeur) : actorName(item),
              history_date: item.changed_at,
            };
            return (
            <div key={`${item.changed_at}-${index}`} className="relative pb-5 last:pb-0">
              <div className="absolute -left-7 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
                <Truck className="h-4 w-4" />
              </div>
              <div className="ml-4 space-y-1">
                {previewSettings.timeline.useCustomHtml ? renderConfiguredSection(previewSettings.timeline, timelineData) : <>
                  {sortedVisibleFields(previewSettings.timeline).some((field) => field.key === "history_status") && <StatusBadge status={item.status} />}
                  {sortedVisibleFields(previewSettings.timeline).map((field) => {
                    if (field.key === "history_status") return null;
                    const value = getColisPreviewValue(timelineData, field.key);
                    if (!value) return null;
                    if (field.key === "history_actor") return <p key={field.key} className="flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" />{value}</p>;
                    return <p key={field.key} className={field.slot === "meta" ? "rounded-md bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground" : "text-sm font-medium"}>{value}</p>;
                  })}
                </>}
              </div>
            </div>
          );})}
        </div>
      </Card>
    </div>
  );
};
