import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  COLIS_PAGE_PRESET_KEY, colisPageActions, colisPagePageVars, colisPageVariables,
  defaultColisPagePreset, normalizeColisPagePreset, type ColisPagePreset,
} from "@/lib/colisPagePreset";
import { ColisCanvasPage, type ColisPageOrder } from "@/components/dashboard/ColisCanvasPage";
import { invalidateAppSetting } from "@/lib/appSettingsCache";

const SAMPLE_ORDERS: ColisPageOrder[] = [
  { id: 1, customer_name: "Mme ABOUTIKA", customer_phone: "0612345678", customer_city: "Casablanca", customer_address: "Rue principale", product_name: "Chemise oversize", order_value: 245, status: "Retourné", tracking_number: "ODiT-1042", external_tracking_number: null, created_at: new Date(Date.now() - 5*60*1000).toISOString() },
  { id: 2, customer_name: "Boutahar Ahlam", customer_phone: "0699887766", customer_city: "Oujda", customer_address: "Av. Hassan II", product_name: "Sneakers low", order_value: 245, status: "Transit", tracking_number: "ODiT-1043", external_tracking_number: null, created_at: new Date(Date.now() - 11*60*1000).toISOString() },
  { id: 3, customer_name: "Jamai Jamila", customer_phone: "0611223344", customer_city: "Fès", customer_address: "Bd Mohammed V", product_name: "Sac à main", order_value: 245, status: "Livré", tracking_number: "ODiT-1044", external_tracking_number: null, created_at: new Date(Date.now() - 34*60*1000).toISOString() },
  { id: 4, customer_name: "Ahmed Boujida", customer_phone: "0633221100", customer_city: "Berkane", customer_address: "Hay Salam", product_name: "T-shirt premium", order_value: 245, status: "Pickup", tracking_number: "ODiT-1045", external_tracking_number: null, created_at: new Date(Date.now() - 20*3600*1000).toISOString() },
];

const AdminColisPagePreset = () => {
  const [preset, setPreset] = useState<ColisPagePreset>(defaultColisPagePreset);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from("app_settings").select("value").eq("key", COLIS_PAGE_PRESET_KEY).maybeSingle()
      .then(({ data }: any) => setPreset(normalizeColisPagePreset(data?.value)));
  }, []);

  const update = (patch: Partial<ColisPagePreset>) => setPreset((c) => ({ ...c, ...patch }));
  const updateAppliesTo = (patch: Partial<ColisPagePreset["appliesTo"]>) =>
    setPreset((c) => ({ ...c, appliesTo: { ...c.appliesTo, ...patch } }));

  const reset = () => setPreset({ ...defaultColisPagePreset, enabled: preset.enabled, appliesTo: preset.appliesTo });

  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("app_settings").upsert(
      { key: COLIS_PAGE_PRESET_KEY, value: preset, updated_by: userData.user?.id ?? null },
      { onConflict: "key" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else { invalidateAppSetting(COLIS_PAGE_PRESET_KEY); toast.success("Page template saved"); }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Page template (HTML/CSS)</h3>
            <p className="text-sm text-muted-foreground">Édite le rendu complet des pages Colis (header, lignes, actions).</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" />Reset</Button>
            <Button onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "..." : "Save"}</Button>
          </div>
        </div>

        <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
          <div>
            <div className="font-medium">Activer ce template</div>
            <div className="text-xs text-muted-foreground">Quand activé, les pages Colis utilisent ce template au lieu du tableau classique.</div>
          </div>
          <Switch checked={preset.enabled} onCheckedChange={(enabled) => update({ enabled })} />
        </label>

        <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
          {(["admin", "vendeur", "livreur"] as const).map((k) => (
            <label key={k} className="flex items-center justify-between rounded-md border border-border p-2">
              <span className="capitalize">{k}</span>
              <Switch checked={preset.appliesTo[k]} onCheckedChange={(v) => updateAppliesTo({ [k]: v } as any)} />
            </label>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Page wrapper HTML</Label>
          <p className="text-[11px] text-muted-foreground">Slots: {colisPagePageVars.map((v) => v.token).join(" ")}</p>
          <Textarea className="min-h-44 font-mono text-xs" value={preset.pageHeaderHtml} onChange={(e) => update({ pageHeaderHtml: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label>Row HTML (par commande)</Label>
          <p className="text-[11px] text-muted-foreground">Variables: {colisPageVariables.map((v) => v.token).join(" ")}</p>
          <p className="text-[11px] text-muted-foreground">Actions: {colisPageActions.map((a) => a.token).join(" ")}</p>
          <Textarea className="min-h-44 font-mono text-xs" value={preset.rowHtml} onChange={(e) => update({ rowHtml: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label>Empty state HTML</Label>
          <Textarea className="min-h-16 font-mono text-xs" value={preset.emptyHtml} onChange={(e) => update({ emptyHtml: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label>CSS</Label>
          <Textarea className="min-h-72 font-mono text-xs" value={preset.css} onChange={(e) => update({ css: e.target.value })} />
        </div>
      </Card>

      <Card className="sticky top-20 h-fit overflow-hidden p-0">
        <div className="border-b border-border bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Live preview</div>
        <div className="max-h-[80vh] overflow-auto bg-background">
          <ColisCanvasPage
            preset={preset}
            title="Colis"
            orders={SAMPLE_ORDERS}
            actions={{
              selectable: true,
              isSelected: () => false,
              onToggleSelect: () => undefined,
              onToggleDetails: () => undefined,
              isDetailsOpen: () => false,
              onPrintSticker: () => toast.info("Print sticker (preview)"),
              onEdit: () => toast.info("Edit (preview)"),
              onDelete: () => toast.info("Delete (preview)"),
              onConfirm: () => toast.info("Confirm (preview)"),
              onPickup: () => toast.info("Pickup (preview)"),
            }}
          />
        </div>
      </Card>
    </div>
  );
};

export default AdminColisPagePreset;
