import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminColisPreviewCanvas from "./AdminColisPreviewCanvas";
import AdminColisPagePreset from "./AdminColisPagePreset";
import { COLIS_PREVIEW_SETTING_KEY, colisPreviewFieldOptions, colisSectionStyle, defaultColisPreviewSettings, normalizeColisPreviewSettings, renderColisTemplate, sanitizeColisHtml, sortedVisibleFields, type ColisPreviewLocation, type ColisPreviewSettings } from "@/lib/colisPreview";
import { Save } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
const locations: ColisPreviewLocation[] = ["main", "details", "timeline", "actions", "invoice", "courier", "support", "qr"];
const sample = { customer_name: "Client Exemple", customer_phone: "0600000000", customer_city: "Casablanca", customer_address: "Rue principale", product_name: "Sample product", order_value: 249, status: "Pickup", tracking: "2G76937042673", external_tracking_number: "2G76937042673", comment: "Fragile", status_note: "Client asked for evening delivery", postponed_date: "2026-04-30T10:00:00Z", scheduled_date: "2026-05-01T11:00:00Z", created_at: new Date().toISOString(), vendeur: "Demo Seller", livreur: "Driver Demo", support: "Support", invoice_label: "Facture client", invoice_status: "Disponible après la fin du trajet", courier_name: "Driver Demo", courier_phone: "0611111111", support_name: "Support ODiT", support_phone: "0522222222", qr_value: "2G76937042673", history_status: "Reporté", history_message: "Status updated from webhook", history_actor: "Driver Demo", history_date: new Date().toISOString() };
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
  const section = settings[active];
  const previewHtml = useMemo(() => sanitizeColisHtml(`<style>${renderColisTemplate(section.css, sample)}</style>${renderColisTemplate(section.html, sample)}`), [section]);

  useEffect(() => {
    db.from("app_settings").select("value").eq("key", COLIS_PREVIEW_SETTING_KEY).maybeSingle()
      .then(({ data }: any) => setSettings(normalizeColisPreviewSettings(data?.value)));
  }, []);

  const updateSection = (patch: Partial<typeof section>) => setSettings((current) => ({ ...current, [active]: { ...current[active], ...patch } }));
  const updateField = (key: string, patch: Record<string, unknown>) => updateSection({ fields: section.fields.map((field) => field.key === key ? { ...field, ...patch } : field) });
  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await db.from("app_settings").upsert({ key: COLIS_PREVIEW_SETTING_KEY, value: settings, updated_by: userData.user?.id ?? null }, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Colis preview saved");
  };

  return <Tabs defaultValue="page" className="space-y-4">
    <TabsList>
      <TabsTrigger value="page">Page template</TabsTrigger>
      <TabsTrigger value="classic">Classic</TabsTrigger>
      <TabsTrigger value="canvas">Canvas (per-element)</TabsTrigger>
    </TabsList>
    <TabsContent value="page"><AdminColisPagePreset /></TabsContent>
    <TabsContent value="canvas"><AdminColisPreviewCanvas /></TabsContent>
    <TabsContent value="classic">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
    <Card className="p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><h3 className="font-semibold">Info Colis</h3><p className="text-sm text-muted-foreground">Live editor for the order information layout shown across colis screens.</p></div>
        <Button onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "Saving..." : "Save"}</Button>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {locations.map((item) => <Button key={item} variant={active === item ? "default" : "outline"} onClick={() => setActive(item)}>{settings[item].title}</Button>)}
      </div>
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1"><Label>Layout</Label><Select value={section.layout} onValueChange={(layout) => updateSection({ layout: layout as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectOptions.layout.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Background captures</Label><Select value={section.backgroundSource} onValueChange={(backgroundSource) => updateSection({ backgroundSource: backgroundSource as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectOptions.backgroundSource.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Icon</Label><Select value={section.icon} onValueChange={(icon) => updateSection({ icon: icon as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectOptions.icon.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Buttons position</Label><Select value={section.buttonPlacement} onValueChange={(buttonPlacement) => updateSection({ buttonPlacement: buttonPlacement as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectOptions.buttonPlacement.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>QR position</Label><Select value={section.qrPlacement} onValueChange={(qrPlacement) => updateSection({ qrPlacement: qrPlacement as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{selectOptions.qrPlacement.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          {(["background", "foreground", "accent", "border"] as const).map((key) => <div key={key} className="space-y-1"><Label>{key}</Label><Input value={section.style[key]} onChange={(e) => updateSection({ style: { ...section.style, [key]: e.target.value } })} /></div>)}
          {(["radius", "padding", "gap"] as const).map((key) => <div key={key} className="space-y-1"><Label>{key}</Label><Input type="number" min={0} value={section.style[key]} onChange={(e) => updateSection({ style: { ...section.style, [key]: Number(e.target.value) || 0 } })} /></div>)}
        </div>
        <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm"><span>Use custom HTML/CSS for this area</span><Switch checked={section.useCustomHtml} onCheckedChange={(useCustomHtml) => updateSection({ useCustomHtml })} /></label>
        <div className="rounded-md border border-border p-3">
          <div className="mb-3 grid grid-cols-[1fr_96px_112px_72px] gap-2 text-xs font-medium text-muted-foreground"><span>Field</span><span>Visible</span><span>Slot</span><span>Order</span></div>
          {section.fields.map((field) => <div key={field.key} className="grid grid-cols-[1fr_96px_112px_72px] items-center gap-2 border-t border-border py-2">
            <span className="text-sm font-medium">{field.label}</span>
            <Switch checked={field.visible} onCheckedChange={(visible) => updateField(field.key, { visible })} />
            <Select value={field.slot} onValueChange={(slot) => updateField(field.key, { slot })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="primary">Primary</SelectItem><SelectItem value="secondary">Secondary</SelectItem><SelectItem value="meta">Meta</SelectItem></SelectContent></Select>
            <Input type="number" min={1} value={field.position} onChange={(e) => updateField(field.key, { position: Number(e.target.value) || 1 })} />
          </div>)}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2"><Label>HTML template</Label><Textarea className="min-h-44 font-mono text-xs" value={section.html} onChange={(e) => updateSection({ html: e.target.value })} /></div>
          <div className="space-y-2"><Label>CSS</Label><Textarea className="min-h-44 font-mono text-xs" value={section.css} onChange={(e) => updateSection({ css: e.target.value })} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Available variables: {colisPreviewFieldOptions.map((field) => `{{${field.key}}}`).join(" ")}</p>
      </div>
    </Card>
    <Card className="sticky top-20 h-fit p-4">
      <h4 className="mb-3 font-semibold">Live canvas</h4>
      {section.useCustomHtml ? <div className="min-h-72 rounded-md border border-border p-3" style={colisSectionStyle(section, sample)} dangerouslySetInnerHTML={{ __html: previewHtml }} /> : <div className="min-h-72 space-y-2 rounded-md border border-border p-3" style={colisSectionStyle(section, sample)}>
        <div className="text-xs font-semibold uppercase text-muted-foreground">Icon: {section.icon} · layout: {section.layout} · background: {section.backgroundSource}</div>
        {(["primary", "secondary", "meta"] as const).map((slot) => <div key={slot} className="flex flex-wrap gap-2">
          {sortedVisibleFields(section, slot).map((field) => <span key={field.key} className={slot === "primary" ? "font-semibold" : "rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground"}>{renderColisTemplate(`{{${field.key}}}`, sample)}</span>)}
        </div>)}
      </div>}
    </Card>
    </div>
    </TabsContent>
  </Tabs>;
};

export default AdminColisPreview;