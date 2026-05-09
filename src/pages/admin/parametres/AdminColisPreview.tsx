import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  COLIS_PREVIEW_SETTING_KEY, colisPreviewFieldOptions, colisSectionStyle,
  defaultColisPreviewSettings, normalizeColisPreviewSettings, renderColisTemplate,
  sanitizeColisHtml, sortedVisibleFields,
  type ColisPreviewLocation, type ColisPreviewSettings,
} from "@/lib/colisPreview";
import { ORDER_STATUSES, statusColor, statusLabel } from "@/lib/orderStatus";
import {
  STATUS_BADGE_OVERRIDES_KEY, invalidateStatusBadgeOverrides,
  type StatusBadgeOverrides,
} from "@/lib/statusBadgeOverrides";
import { ArrowDown, ArrowUp, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

const locations: { key: ColisPreviewLocation; label: string }[] = [
  { key: "main", label: "Liste — ligne" },
  { key: "details", label: "Open details — info" },
  { key: "timeline", label: "Open details — chronologie" },
  { key: "actions", label: "Open details — actions" },
  { key: "invoice", label: "Bloc facture" },
  { key: "courier", label: "Bloc livreur" },
  { key: "support", label: "Bloc support" },
  { key: "qr", label: "Bloc QR" },
];

const sample = { customer_name: "Client Exemple", customer_phone: "0600000000", customer_city: "Casablanca", customer_address: "Rue principale", product_name: "Sample product", order_value: 249, status: "Pickup", tracking: "2G76937042673", external_tracking_number: "2G76937042673", comment: "Fragile", status_note: "Livraison soir", postponed_date: "2026-04-30T10:00:00Z", scheduled_date: "2026-05-01T11:00:00Z", created_at: new Date().toISOString(), vendeur: "Demo Seller", livreur: "Driver Demo", support: "Support", invoice_label: "Facture client", invoice_status: "Disponible après la fin du trajet", courier_name: "Driver Demo", courier_phone: "0611111111", support_name: "Support ODiT", support_phone: "0522222222", qr_value: "2G76937042673", history_status: "Reporté", history_message: "Status updated from webhook", history_actor: "Driver Demo", history_date: new Date().toISOString() };

const selectOptions = {
  layout: ["stack", "inline", "grid"],
  backgroundSource: ["none", "status", "city", "seller", "courier", "support", "tracking"],
  icon: ["package", "truck", "bike", "invoice", "support", "qr", "map", "user", "none"],
  buttonPlacement: ["right", "left", "bottom", "hidden"],
  qrPlacement: ["right", "left", "top", "bottom", "hidden"],
};

const AdminColisPreview = () => {
  const [settings, setSettings] = useState<ColisPreviewSettings>(defaultColisPreviewSettings);
  const [active, setActive] = useState<ColisPreviewLocation>("main");
  const [saving, setSaving] = useState(false);
  const [badgeOverrides, setBadgeOverrides] = useState<StatusBadgeOverrides>({});
  const section = settings[active];
  const previewHtml = useMemo(
    () => sanitizeColisHtml(`<style>${renderColisTemplate(section.css, sample)}</style>${renderColisTemplate(section.html, sample)}`),
    [section]
  );

  useEffect(() => {
    db.from("app_settings").select("value").eq("key", COLIS_PREVIEW_SETTING_KEY).maybeSingle()
      .then(({ data }: any) => setSettings(normalizeColisPreviewSettings(data?.value)));
    db.from("app_settings").select("value").eq("key", STATUS_BADGE_OVERRIDES_KEY).maybeSingle()
      .then(({ data }: any) => setBadgeOverrides((data?.value as StatusBadgeOverrides) || {}));
  }, []);

  const updateSection = (patch: Partial<typeof section>) =>
    setSettings((current) => ({ ...current, [active]: { ...current[active], ...patch } }));

  const updateField = (key: string, patch: Record<string, unknown>) =>
    updateSection({ fields: section.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) });

  const moveField = (key: string, dir: -1 | 1) => {
    const sorted = [...section.fields].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((f) => f.key === key);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx], b = sorted[swap];
    const tmp = a.position;
    a.position = b.position; b.position = tmp;
    updateSection({ fields: section.fields.map((f) => sorted.find((s) => s.key === f.key) ?? f) });
  };

  const resetActive = () =>
    setSettings((current) => ({ ...current, [active]: defaultColisPreviewSettings[active] }));
  const resetAll = () => setSettings(defaultColisPreviewSettings);

  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const updatedBy = userData.user?.id ?? null;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      db.from("app_settings").upsert(
        { key: COLIS_PREVIEW_SETTING_KEY, value: settings, updated_by: updatedBy },
        { onConflict: "key" }
      ),
      db.from("app_settings").upsert(
        { key: STATUS_BADGE_OVERRIDES_KEY, value: badgeOverrides, updated_by: updatedBy },
        { onConflict: "key" }
      ),
    ]);
    setSaving(false);
    const error = e1 || e2;
    if (error) toast.error(error.message);
    else {
      try { sessionStorage.removeItem(`app_settings:${COLIS_PREVIEW_SETTING_KEY}`); } catch { /* */ }
      invalidateStatusBadgeOverrides();
      toast.success("Affichage Colis enregistré");
    }
  };

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

  const sliderRow = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v) => onChange(v[0])} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-semibold">Affichage des colis (Classic)</h3>
          <p className="text-sm text-muted-foreground">
            Personnalisez les champs visibles, leur ordre, les couleurs et les tailles pour chaque section.
          </p>
        </div>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline"><RotateCcw className="mr-1 h-4 w-4" /> Reset section</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Réinitialiser cette section ?</AlertDialogTitle>
                <AlertDialogDescription>La section <strong>{section.title}</strong> sera remise à ses valeurs par défaut.</AlertDialogDescription>
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
                <AlertDialogTitle>Réinitialiser TOUTES les sections ?</AlertDialogTitle>
                <AlertDialogDescription>Action irréversible (sauf si vous ne sauvegardez pas).</AlertDialogDescription>
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {locations.map((item) => (
              <Button key={item.key} size="sm" variant={active === item.key ? "default" : "outline"} onClick={() => setActive(item.key)}>
                {item.label}
              </Button>
            ))}
          </div>

          {/* Layout / placement */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {(["layout", "backgroundSource", "icon", "buttonPlacement", "qrPlacement"] as const).map((k) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs capitalize">{k.replace(/([A-Z])/g, " $1")}</Label>
                <Select value={section[k]} onValueChange={(v) => updateSection({ [k]: v } as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {selectOptions[k].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* Colors */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Couleurs</h4>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(["background", "foreground", "accent", "border"] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs capitalize">{key}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="h-9 w-12 p-1 cursor-pointer"
                      value={/^#/.test(section.style[key]) ? section.style[key] : "#ffffff"}
                      onChange={(e) => updateSection({ style: { ...section.style, [key]: e.target.value } })}
                    />
                    <Input
                      className="flex-1 font-mono text-xs"
                      value={section.style[key]}
                      onChange={(e) => updateSection({ style: { ...section.style, [key]: e.target.value } })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sizes */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Tailles & espacement</h4>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sliderRow("Radius (px)", section.style.radius, 0, 24, 1, (v) => updateSection({ style: { ...section.style, radius: v } }))}
              {sliderRow("Padding (px)", section.style.padding, 0, 32, 1, (v) => updateSection({ style: { ...section.style, padding: v } }))}
              {sliderRow("Gap (px)", section.style.gap, 0, 32, 1, (v) => updateSection({ style: { ...section.style, gap: v } }))}
              {sliderRow("Font size (px)", section.style.fontSize ?? 14, 10, 22, 1, (v) => updateSection({ style: { ...section.style, fontSize: v } }))}
              {sliderRow("Line height", Math.round((section.style.lineHeight ?? 1.45) * 100), 100, 220, 5, (v) => updateSection({ style: { ...section.style, lineHeight: v / 100 } }))}
            </div>
          </div>

          {/* Custom HTML toggle */}
          <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
            <span>Utiliser HTML/CSS personnalisé pour cette section</span>
            <Switch checked={section.useCustomHtml} onCheckedChange={(useCustomHtml) => updateSection({ useCustomHtml })} />
          </label>

          {/* Fields list with reorder */}
          <div className="rounded-md border border-border p-3">
            <h4 className="text-sm font-semibold mb-2">Champs & ordre</h4>
            <div className="mb-2 grid grid-cols-[1fr_72px_120px_72px_60px] gap-2 text-xs font-medium text-muted-foreground">
              <span>Champ</span><span>Visible</span><span>Slot</span><span>Pos.</span><span>Order</span>
            </div>
            {[...section.fields].sort((a, b) => a.position - b.position).map((field) => (
              <div key={field.key} className="grid grid-cols-[1fr_72px_120px_72px_60px] items-center gap-2 border-t border-border py-2">
                <span className="text-sm font-medium">{field.label}</span>
                <Switch checked={field.visible} onCheckedChange={(visible) => updateField(field.key, { visible })} />
                <Select value={field.slot} onValueChange={(slot) => updateField(field.key, { slot })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                    <SelectItem value="meta">Meta</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" min={1} className="h-8" value={field.position} onChange={(e) => updateField(field.key, { position: Number(e.target.value) || 1 })} />
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveField(field.key, -1)} aria-label="Up"><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveField(field.key, 1)} aria-label="Down"><ArrowDown className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>

          {section.useCustomHtml && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2"><Label>HTML template</Label><Textarea className="min-h-44 font-mono text-xs" value={section.html} onChange={(e) => updateSection({ html: e.target.value })} /></div>
              <div className="space-y-2"><Label>CSS</Label><Textarea className="min-h-44 font-mono text-xs" value={section.css} onChange={(e) => updateSection({ css: e.target.value })} /></div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Variables: {colisPreviewFieldOptions.map((field) => `{{${field.key}}}`).join(" ")}</p>
        </Card>

        <Card className="sticky top-20 h-fit p-4">
          <h4 className="mb-3 font-semibold">Aperçu live</h4>
          {section.useCustomHtml ? (
            <div className="min-h-72 rounded-md border border-border p-3" style={colisSectionStyle(section, sample)} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <div className="min-h-72 space-y-2 rounded-md border border-border p-3" style={colisSectionStyle(section, sample)}>
              <div className="text-xs font-semibold uppercase opacity-60">layout: {section.layout} · bg: {section.backgroundSource}</div>
              {(["primary", "secondary", "meta"] as const).map((slot) => (
                <div key={slot} className="flex flex-wrap gap-2">
                  {sortedVisibleFields(section, slot).map((field) => (
                    <span key={field.key} className={slot === "primary" ? "font-semibold" : "rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground"}>
                      {renderColisTemplate(`{{${field.key}}}`, sample)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Status badge customizer */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-semibold">Statuts — couleurs des badges</h4>
            <p className="text-xs text-muted-foreground">Surchargez l'apparence des badges par statut. Laissez vide pour garder les valeurs par défaut.</p>
          </div>
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
