import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  COLIS_CANVAS_SETTING_KEY,
  buildDetailsData,
  buildMainRowData,
  canvasSampleOrder,
  defaultColisCanvasSettings,
  normalizeColisCanvasSettings,
  renderCanvasTemplate,
  sanitizeCanvasHtml,
  type ColisCanvasSettings,
  type ColisCanvasSurface,
} from "@/lib/colisCanvas";
import { invalidateCanvasSettings, setCanvasSettingsCache } from "@/lib/useColisCanvas";
import { ORDER_STATUSES, statusColor, statusLabel } from "@/lib/orderStatus";
import {
  STATUS_BADGE_OVERRIDES_KEY, invalidateStatusBadgeOverrides,
  type StatusBadgeOverrides,
} from "@/lib/statusBadgeOverrides";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

const db = supabase as any;

const surfaces: { key: ColisCanvasSurface; label: string; description: string }[] = [
  { key: "mainRow", label: "Ligne (liste)", description: "Cellule client dans la liste des commandes." },
  { key: "details", label: "Open details (gauche)", description: "Carte gauche du panneau de détails ouverts." },
];

const variableHints: Record<ColisCanvasSurface, string[]> = {
  mainRow: ["customer_name", "customer_phone", "customer_city", "product_name", "tracking", "status", "order_value_formatted", "customer_initials"],
  details: ["customer_name", "customer_phone", "customer_address", "customer_city", "product_name", "tracking", "status", "order_value_formatted", "created_at_formatted", "comment", "status_note", "qr_image_src", "livreur_name", "livreur_name_or_label", "livreur_phone", "livreur_href", "livreur_class", "support_name", "support_phone", "support_href", "support_class"],
};

/** Live preview that scopes CSS to a unique class (mirrors runtime behavior). */
const PreviewBox = ({
  html,
  css,
  data,
  scopeKey,
}: {
  html: string;
  css: string;
  data: Record<string, unknown>;
  scopeKey: string;
}) => {
  const renderedHtml = useMemo(() => sanitizeCanvasHtml(renderCanvasTemplate(html, data)), [html, data]);
  const renderedCss = useMemo(() => {
    const rendered = renderCanvasTemplate(css, data);
    return rendered.replace(/(^|\})\s*([^{}@]+)\{/g, (_match, prefix, selectors) => {
      const scoped = selectors
        .split(",")
        .map((sel: string) => {
          const trimmed = sel.trim();
          if (!trimmed) return trimmed;
          return `.${scopeKey} ${trimmed}`;
        })
        .join(", ");
      return `${prefix} ${scoped}{`;
    });
  }, [css, data, scopeKey]);

  return (
    <div className={scopeKey}>
      <style dangerouslySetInnerHTML={{ __html: renderedCss }} />
      <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
    </div>
  );
};

const AdminColisPreview = () => {
  const [settings, setSettings] = useState<ColisCanvasSettings>(defaultColisCanvasSettings);
  const [active, setActive] = useState<ColisCanvasSurface>("mainRow");
  const [saving, setSaving] = useState(false);
  const [badgeOverrides, setBadgeOverrides] = useState<StatusBadgeOverrides>({});
  const [qrSrc, setQrSrc] = useState("");

  useEffect(() => {
    db.from("app_settings").select("value").eq("key", COLIS_CANVAS_SETTING_KEY).maybeSingle()
      .then(({ data }: any) => setSettings(normalizeColisCanvasSettings(data?.value)));
    db.from("app_settings").select("value").eq("key", STATUS_BADGE_OVERRIDES_KEY).maybeSingle()
      .then(({ data }: any) => setBadgeOverrides((data?.value as StatusBadgeOverrides) || {}));
    QRCode.toDataURL(canvasSampleOrder.tracking_number ?? "ODiT-1234", { width: 280, margin: 1 })
      .then(setQrSrc).catch(() => setQrSrc(""));
  }, []);

  const surface = settings[active];
  const sampleData = useMemo(() => {
    if (active === "mainRow") return buildMainRowData(canvasSampleOrder);
    return buildDetailsData(canvasSampleOrder, {
      qr_image_src: qrSrc,
      livreur_name: "Smailerrachidia25 — Samil",
      livreur_phone: "0719302120",
      support_name: "Support ODiT",
      support_phone: "0500000000",
    });
  }, [active, qrSrc]);

  const updateSurface = (patch: Partial<typeof surface>) =>
    setSettings((current) => ({ ...current, [active]: { ...current[active], ...patch } }));

  const resetActive = () =>
    setSettings((current) => ({ ...current, [active]: defaultColisCanvasSettings[active] }));
  const resetAll = () => setSettings(defaultColisCanvasSettings);

  const updateBadge = (status: string, patch: Partial<{ bg: string; text: string; border: string }>) => {
    setBadgeOverrides((current) => {
      const fallback = statusColor(status);
      const existing = current[status] ?? { bg: fallback.hex, text: "#ffffff", border: fallback.hex };
      return { ...current, [status]: { ...existing, ...patch } };
    });
  };
  const resetBadge = (status: string) => {
    setBadgeOverrides((current) => {
      const next = { ...current };
      delete next[status];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const updatedBy = userData.user?.id ?? null;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      db.from("app_settings").upsert(
        { key: COLIS_CANVAS_SETTING_KEY, value: settings, updated_by: updatedBy },
        { onConflict: "key" }
      ),
      db.from("app_settings").upsert(
        { key: STATUS_BADGE_OVERRIDES_KEY, value: badgeOverrides, updated_by: updatedBy },
        { onConflict: "key" }
      ),
    ]);
    setSaving(false);
    const error = e1 || e2;
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidateCanvasSettings();
    setCanvasSettingsCache(settings);
    invalidateStatusBadgeOverrides();
    toast.success("Affichage Colis enregistré");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-semibold">Affichage des colis (Canvas HTML/CSS)</h3>
          <p className="text-sm text-muted-foreground">
            Contrôle total sur la ligne de liste et la carte d'open-details via HTML + CSS.
            La chronologie d'activité reste gérée par le système.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline"><RotateCcw className="mr-1 h-4 w-4" /> Reset cette surface</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Réinitialiser cette surface ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Le HTML et le CSS de <strong>{surfaces.find((s) => s.key === active)?.label}</strong> seront restaurés au design par défaut.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={resetActive}>Réinitialiser</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost"><RotateCcw className="mr-1 h-4 w-4" /> Reset tout</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tout réinitialiser ?</AlertDialogTitle>
                <AlertDialogDescription>Toutes les surfaces reviennent au design par défaut (n'enregistre rien tant que vous ne cliquez pas Enregistrer).</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={resetAll}>Tout réinitialiser</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button onClick={save} disabled={saving}>
            <Save className="mr-1 h-4 w-4" />{saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as ColisCanvasSurface)}>
        <TabsList>
          {surfaces.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>
          ))}
        </TabsList>

        {surfaces.map((s) => (
          <TabsContent key={s.key} value={s.key} className="space-y-3">
            <p className="text-xs text-muted-foreground">{s.description}</p>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-3 space-y-3">
                <div>
                  <Label className="text-xs font-semibold">HTML</Label>
                  <Textarea
                    className="mt-1 min-h-[260px] font-mono text-xs"
                    value={settings[s.key].html}
                    onChange={(e) => setSettings((cur) => ({ ...cur, [s.key]: { ...cur[s.key], html: e.target.value } }))}
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">CSS</Label>
                  <Textarea
                    className="mt-1 min-h-[220px] font-mono text-xs"
                    value={settings[s.key].css}
                    onChange={(e) => setSettings((cur) => ({ ...cur, [s.key]: { ...cur[s.key], css: e.target.value } }))}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Variables : {variableHints[s.key].map((v) => `{{${v}}}`).join("  ·  ")}
                  <br />
                  Conditionnel : <code>{`{{#if comment}}…{{/if}}`}</code>
                </p>
              </Card>

              <Card className="p-3 space-y-2 sticky top-20 self-start">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Aperçu live</Label>
                <div className="rounded-lg border border-border bg-card p-3">
                  <PreviewBox
                    html={settings[s.key].html}
                    css={settings[s.key].css}
                    data={s.key === active ? sampleData : (s.key === "mainRow" ? buildMainRowData(canvasSampleOrder) : buildDetailsData(canvasSampleOrder, { qr_image_src: qrSrc, livreur_name: "Demo Driver", livreur_phone: "0600000000", support_name: "Support ODiT", support_phone: "0500000000" }))}
                    scopeKey={`canvas-preview-${s.key}`}
                  />
                </div>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Status badge customizer (kept) */}
      <Card className="p-4 space-y-3">
        <div>
          <h4 className="font-semibold">Statuts — couleurs des badges</h4>
          <p className="text-xs text-muted-foreground">Surchargez l'apparence des badges par statut.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ORDER_STATUSES.map((status) => {
            const fb = statusColor(status);
            const ov = badgeOverrides[status];
            const bg = ov?.bg ?? fb.hex;
            const text = ov?.text ?? "#ffffff";
            const border = ov?.border ?? bg;
            return (
              <div key={status} className="flex items-center gap-2 rounded-md border border-border p-2">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: bg, color: text, boxShadow: `inset 0 0 0 1px ${border}` }}
                >
                  {statusLabel(status)}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Input type="color" className="h-7 w-7 cursor-pointer p-0.5" value={/^#/.test(bg) ? bg : "#000000"} onChange={(e) => updateBadge(status, { bg: e.target.value })} title="Fond" />
                  <Input type="color" className="h-7 w-7 cursor-pointer p-0.5" value={/^#/.test(text) ? text : "#ffffff"} onChange={(e) => updateBadge(status, { text: e.target.value })} title="Texte" />
                  <Input type="color" className="h-7 w-7 cursor-pointer p-0.5" value={/^#/.test(border) ? border : "#000000"} onChange={(e) => updateBadge(status, { border: e.target.value })} title="Bordure" />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => resetBadge(status)} title="Reset"><RotateCcw className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

export default AdminColisPreview;
