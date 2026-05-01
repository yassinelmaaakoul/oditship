import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlignCenter, AlignLeft, AlignRight, Copy, Eye, Minus, MousePointerClick, QrCode,
  RotateCcw, Save, Smile, Sparkles, Trash2, Type,
} from "lucide-react";
import { toast } from "sonner";
import {
  COLIS_PREVIEW_CANVAS_KEY,
  colisCanvasActions,
  colisCanvasIconNames,
  colisPreviewFieldOptions,
  defaultColisCanvasTemplate,
  getColisPreviewValue,
  newColisCanvasElement,
  normalizeColisCanvasTemplate,
  renderColisTemplate,
  sanitizeColisHtml,
  type ColisCanvasActionKind,
  type ColisCanvasElement,
  type ColisCanvasElementType,
  type ColisCanvasTemplate,
} from "@/lib/colisPreview";

const SAMPLE = {
  customer_name: "Client Exemple",
  customer_phone: "0600000000",
  customer_city: "Casablanca",
  customer_address: "Rue principale, Casablanca",
  product_name: "Sample product",
  order_value: 249,
  status: "Pickup",
  tracking: "B9267AB4F42643",
  external_tracking_number: "B9267AB4F42643",
  comment: "Fragile",
  status_note: "Demande livraison soir",
  postponed_date: "2026-05-02T10:00:00Z",
  scheduled_date: "2026-05-03T11:00:00Z",
  created_at: new Date().toISOString(),
  vendeur: "Demo Seller",
  livreur: "Driver Demo",
  support: "Support ODiT",
  invoice_label: "Facture client",
  invoice_status: "Disponible",
  courier_name: "Driver Demo",
  courier_phone: "0611111111",
  support_name: "Support ODiT",
  support_phone: "0522222222",
  qr_value: "B9267AB4F42643",
  history_status: "Reporté",
  history_message: "Status updated from webhook",
  history_actor: "Driver Demo",
  history_date: new Date().toISOString(),
};

const renderElementValue = (el: ColisCanvasElement, data: Record<string, unknown>) => {
  if (el.type === "field" && el.field) return getColisPreviewValue(data, el.field) || `{{${el.field}}}`;
  if (el.type === "text" || el.type === "emoji") return el.text || "";
  if (el.type === "icon") return el.text || "★";
  if (el.type === "qr") return "QR";
  if (el.type === "barcode") return `*${getColisPreviewValue(data, "tracking")}*`;
  if (el.type === "action") return el.actionLabel || "Action";
  return "";
};

const renderHtml = (el: ColisCanvasElement, data: Record<string, unknown>) => {
  const html = renderColisTemplate(el.html || "", data);
  const css = renderColisTemplate(el.css || "", data);
  return { __html: sanitizeColisHtml(`<style>${css}</style>${html}`) };
};

const AdminColisPreviewCanvas = () => {
  const [template, setTemplate] = useState<ColisCanvasTemplate>(defaultColisCanvasTemplate);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<
    | { id: string; mode: "move" | "resize"; startX: number; startY: number; x: number; y: number; w: number; h: number }
    | null
  >(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (supabase as any)
      .from("app_settings").select("value").eq("key", COLIS_PREVIEW_CANVAS_KEY).maybeSingle()
      .then(({ data }: any) => setTemplate(normalizeColisCanvasTemplate(data?.value)));
  }, []);

  const selected = useMemo(
    () => template.elements.find((el) => el.id === selectedId) || null,
    [template.elements, selectedId],
  );

  const updateTemplate = (patch: Partial<ColisCanvasTemplate>) =>
    setTemplate((current) => ({ ...current, ...patch }));

  const updateElement = (id: string, patch: Partial<ColisCanvasElement>) =>
    setTemplate((current) => ({
      ...current,
      elements: current.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    }));

  const addElement = (type: ColisCanvasElementType, field?: string) => {
    const element = newColisCanvasElement(type, field);
    setTemplate((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(element.id);
  };

  const duplicate = () => selected && setTemplate((current) => {
    const copy = { ...selected, id: crypto.randomUUID(), x: selected.x + 16, y: selected.y + 16 };
    setSelectedId(copy.id);
    return { ...current, elements: [...current.elements, copy] };
  });

  const remove = () => selected && setTemplate((current) => ({
    ...current,
    elements: current.elements.filter((el) => el.id !== selected.id),
  }));

  const reset = () => { setTemplate({ ...defaultColisCanvasTemplate, enabled: template.enabled }); setSelectedId(null); };

  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("app_settings").upsert(
      { key: COLIS_PREVIEW_CANVAS_KEY, value: template, updated_by: userData.user?.id ?? null },
      { onConflict: "key" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Canvas saved");
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = rect.width / template.width;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (drag.mode === "move") {
      updateElement(drag.id, {
        x: Math.max(0, Math.min(template.width - 8, drag.x + dx)),
        y: Math.max(0, Math.min(template.height - 8, drag.y + dy)),
      });
    } else {
      updateElement(drag.id, {
        w: Math.max(20, drag.w + dx),
        h: Math.max(12, drag.h + dy),
      });
    }
  };

  const autoSeed = () => {
    const seed: ColisCanvasElement[] = [
      { ...newColisCanvasElement("field", "customer_name"), x: 24, y: 24, w: 360, h: 36, fontSize: 22, fontWeight: 700 },
      { ...newColisCanvasElement("field", "tracking"), x: 24, y: 70, w: 360, h: 24, fontSize: 14, color: "hsl(var(--muted-foreground))" },
      { ...newColisCanvasElement("field", "customer_phone"), x: 24, y: 110, w: 200, h: 24 },
      { ...newColisCanvasElement("field", "customer_city"), x: 230, y: 110, w: 154, h: 24 },
      { ...newColisCanvasElement("field", "status"), x: 24, y: 150, w: 160, h: 32, fontWeight: 700, background: "hsl(var(--primary-soft))", radius: 6, align: "center", padding: 6 },
      { ...newColisCanvasElement("field", "order_value"), x: 200, y: 150, w: 184, h: 32, fontWeight: 700, align: "right" },
      { ...newColisCanvasElement("qr"), x: template.width - 160, y: 24, w: 130, h: 130 },
      { ...newColisCanvasElement("action", undefined), action: "print_sticker", actionLabel: "Print sticker", x: template.width - 160, y: 170, w: 130, h: 36 },
    ];
    setTemplate((current) => ({ ...current, elements: [...current.elements, ...seed] }));
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="font-semibold">Live canvas editor</h3>
              <p className="text-sm text-muted-foreground">
                Free-form layout for the Info Colis area. Drag, resize and style any element.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select onValueChange={(value) => addElement("field", value)}>
                <SelectTrigger className="w-44"><SelectValue placeholder="+ System field" /></SelectTrigger>
                <SelectContent>
                  {colisPreviewFieldOptions.map((field) => (
                    <SelectItem key={field.key} value={field.key}>{field.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => addElement("text")}><Type className="mr-1 h-4 w-4" />Text</Button>
              <Button variant="outline" onClick={() => addElement("emoji")}><Smile className="mr-1 h-4 w-4" />Emoji</Button>
              <Button variant="outline" onClick={() => addElement("icon")}><Sparkles className="mr-1 h-4 w-4" />Icon</Button>
              <Button variant="outline" onClick={() => addElement("line")}><Minus className="mr-1 h-4 w-4" />Line</Button>
              <Button variant="outline" onClick={() => addElement("qr")}><QrCode className="mr-1 h-4 w-4" />QR</Button>
              <Button variant="outline" onClick={() => addElement("barcode")}>Barcode</Button>
              <Button variant="outline" onClick={() => addElement("html")}>HTML/CSS</Button>
              <Button variant="outline" onClick={() => addElement("action")}><MousePointerClick className="mr-1 h-4 w-4" />Action</Button>
              <Button variant="outline" onClick={autoSeed}>Auto info</Button>
              <Button onClick={() => setPreviewOpen(true)}><Eye className="mr-1 h-4 w-4" />Preview</Button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="space-y-2"><Label>Width (px)</Label>
              <Input type="number" min={400} value={template.width} onChange={(e) => updateTemplate({ width: Number(e.target.value) || 400 })} /></div>
            <div className="space-y-2"><Label>Height (px)</Label>
              <Input type="number" min={200} value={template.height} onChange={(e) => updateTemplate({ height: Number(e.target.value) || 200 })} /></div>
            <div className="space-y-2"><Label>Background</Label>
              <Input value={template.background} onChange={(e) => updateTemplate({ background: e.target.value })} /></div>
            <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
              <span>Outer frame</span>
              <Switch checked={template.border} onCheckedChange={(border) => updateTemplate({ border })} />
            </label>
          </div>

          <label className="mb-3 flex items-center justify-between rounded-md border border-border p-3 text-sm">
            <div>
              <div className="font-medium">Use canvas in order details</div>
              <div className="text-xs text-muted-foreground">When ON, the order detail panel renders this canvas instead of the classic layout.</div>
            </div>
            <Switch checked={template.enabled} onCheckedChange={(enabled) => updateTemplate({ enabled })} />
          </label>

          <div className="overflow-auto rounded-md border border-border bg-muted/40 p-4">
            <div
              ref={canvasRef}
              className="relative mx-auto"
              style={{
                width: "100%",
                maxWidth: template.width,
                aspectRatio: `${template.width} / ${template.height}`,
                background: template.background,
                border: template.border ? "2px solid hsl(var(--foreground))" : "1px dashed hsl(var(--border))",
              }}
              onPointerMove={onPointerMove}
              onPointerUp={() => setDrag(null)}
              onPointerLeave={() => setDrag(null)}
            >
              {template.elements.map((el) => el.visible && (
                <div
                  key={el.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedId(el.id);
                    setDrag({ id: el.id, mode: "move", startX: event.clientX, startY: event.clientY, x: el.x, y: el.y, w: el.w, h: el.h });
                  }}
                  className={`absolute overflow-hidden ${selectedId === el.id ? "outline outline-2 outline-primary" : "outline outline-1 outline-dashed outline-muted-foreground/30"}`}
                  style={{
                    left: `${(el.x / template.width) * 100}%`,
                    top: `${(el.y / template.height) * 100}%`,
                    width: `${(el.w / template.width) * 100}%`,
                    height: `${(el.h / template.height) * 100}%`,
                    fontSize: el.fontSize,
                    fontWeight: el.fontWeight,
                    color: el.color,
                    background: el.background,
                    textAlign: el.align,
                    borderRadius: el.radius,
                    padding: el.padding,
                    transform: `rotate(${el.rotation}deg)`,
                    border: el.border ? `1px solid ${el.borderColor}` : "none",
                    cursor: "move",
                    zIndex: el.zIndex,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
                    lineHeight: 1.2,
                  }}
                >
                  {el.type === "html" ? (
                    <div className="h-full w-full" dangerouslySetInnerHTML={renderHtml(el, SAMPLE)} />
                  ) : el.type === "line" ? (
                    <div className="h-px w-full" style={{ background: el.color, height: el.h }} />
                  ) : (
                    <span className="truncate">{renderElementValue(el, SAMPLE)}</span>
                  )}
                  {selectedId === el.id && (
                    <span
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setDrag({ id: el.id, mode: "resize", startX: event.clientX, startY: event.clientY, x: el.x, y: el.y, w: el.w, h: el.h });
                      }}
                      className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-primary"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-semibold">Element settings</h4>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={duplicate} disabled={!selected}><Copy className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={remove} disabled={!selected}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>

          {!selected ? (
            <p className="text-sm text-muted-foreground">Select an element on the canvas, or add a new element from the toolbar.</p>
          ) : (
            <div className="space-y-3">
              {(selected.type === "text" || selected.type === "emoji") && (
                <div className="space-y-1"><Label>Text / Emoji</Label>
                  <Textarea value={selected.text || ""} onChange={(e) => updateElement(selected.id, { text: e.target.value })} /></div>
              )}
              {selected.type === "icon" && (
                <div className="space-y-1"><Label>Icon</Label>
                  <Select value={selected.text || "package"} onValueChange={(text) => updateElement(selected.id, { text })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{colisCanvasIconNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
                  </Select></div>
              )}
              {selected.type === "field" && (
                <div className="space-y-1"><Label>System field</Label>
                  <Select value={selected.field} onValueChange={(field) => updateElement(selected.id, { field })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{colisPreviewFieldOptions.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
                  </Select></div>
              )}
              {selected.type === "action" && (
                <>
                  <div className="space-y-1"><Label>Action</Label>
                    <Select value={selected.action} onValueChange={(action) => updateElement(selected.id, { action: action as ColisCanvasActionKind })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{colisCanvasActions.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                    </Select></div>
                  <div className="space-y-1"><Label>Button label</Label>
                    <Input value={selected.actionLabel || ""} onChange={(e) => updateElement(selected.id, { actionLabel: e.target.value })} /></div>
                </>
              )}
              {selected.type === "html" && (
                <div className="space-y-2 rounded-md border border-border p-2">
                  <p className="text-xs text-muted-foreground">Variables: {colisPreviewFieldOptions.slice(0, 6).map((f) => `{{${f.key}}}`).join(" ")}…</p>
                  <Label>HTML</Label>
                  <Textarea className="min-h-24 font-mono text-xs" value={selected.html || ""} onChange={(e) => updateElement(selected.id, { html: e.target.value })} />
                  <Label>CSS</Label>
                  <Textarea className="min-h-24 font-mono text-xs" value={selected.css || ""} onChange={(e) => updateElement(selected.id, { css: e.target.value })} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "w", "h"] as const).map((key) => (
                  <div key={key} className="space-y-1"><Label>{key.toUpperCase()}</Label>
                    <Input type="number" value={selected[key]} onChange={(e) => updateElement(selected.id, { [key]: Number(e.target.value) || 0 })} /></div>
                ))}
              </div>

              <div className="space-y-1"><Label>Font size</Label>
                <Input type="number" min={6} value={selected.fontSize} onChange={(e) => updateElement(selected.id, { fontSize: Number(e.target.value) || 12 })} /></div>
              <div className="space-y-1"><Label>Font weight</Label>
                <Slider min={100} max={900} step={100} value={[selected.fontWeight]} onValueChange={([fontWeight]) => updateElement(selected.id, { fontWeight })} /></div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Color</Label>
                  <Input value={selected.color} onChange={(e) => updateElement(selected.id, { color: e.target.value })} /></div>
                <div className="space-y-1"><Label>Background</Label>
                  <Input value={selected.background} onChange={(e) => updateElement(selected.id, { background: e.target.value })} /></div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button variant={selected.align === "left" ? "default" : "outline"} onClick={() => updateElement(selected.id, { align: "left" })}><AlignLeft className="h-4 w-4" /></Button>
                <Button variant={selected.align === "center" ? "default" : "outline"} onClick={() => updateElement(selected.id, { align: "center" })}><AlignCenter className="h-4 w-4" /></Button>
                <Button variant={selected.align === "right" ? "default" : "outline"} onClick={() => updateElement(selected.id, { align: "right" })}><AlignRight className="h-4 w-4" /></Button>
              </div>

              <label className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                <span>Border</span>
                <Switch checked={selected.border} onCheckedChange={(border) => updateElement(selected.id, { border })} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Border color</Label>
                  <Input value={selected.borderColor} onChange={(e) => updateElement(selected.id, { borderColor: e.target.value })} /></div>
                <div className="space-y-1"><Label>Radius</Label>
                  <Input type="number" value={selected.radius} onChange={(e) => updateElement(selected.id, { radius: Number(e.target.value) || 0 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Padding</Label>
                  <Input type="number" value={selected.padding} onChange={(e) => updateElement(selected.id, { padding: Number(e.target.value) || 0 })} /></div>
                <div className="space-y-1"><Label>Rotation</Label>
                  <Input type="number" value={selected.rotation} onChange={(e) => updateElement(selected.id, { rotation: Number(e.target.value) || 0 })} /></div>
              </div>
              <div className="space-y-1"><Label>Z-index</Label>
                <Input type="number" value={selected.zIndex} onChange={(e) => updateElement(selected.id, { zIndex: Number(e.target.value) || 1 })} /></div>
              <label className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                <span>Visible</span>
                <Switch checked={selected.visible} onCheckedChange={(visible) => updateElement(selected.id, { visible })} />
              </label>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <Button variant="outline" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" />Reset</Button>
            <Button onClick={save} disabled={saving} className="flex-1"><Save className="mr-1 h-4 w-4" />{saving ? "..." : "Save"}</Button>
          </div>
        </Card>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Canvas preview</DialogTitle></DialogHeader>
          <div className="overflow-auto rounded-md border border-border bg-muted/40 p-4">
            <div
              className="relative mx-auto"
              style={{
                width: "100%",
                maxWidth: template.width,
                aspectRatio: `${template.width} / ${template.height}`,
                background: template.background,
                border: template.border ? "2px solid hsl(var(--foreground))" : "none",
              }}
            >
              {template.elements.map((el) => el.visible && (
                <div
                  key={el.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: `${(el.x / template.width) * 100}%`,
                    top: `${(el.y / template.height) * 100}%`,
                    width: `${(el.w / template.width) * 100}%`,
                    height: `${(el.h / template.height) * 100}%`,
                    fontSize: el.fontSize,
                    fontWeight: el.fontWeight,
                    color: el.color,
                    background: el.background,
                    textAlign: el.align,
                    borderRadius: el.radius,
                    padding: el.padding,
                    transform: `rotate(${el.rotation}deg)`,
                    border: el.border ? `1px solid ${el.borderColor}` : "none",
                    zIndex: el.zIndex,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: el.align === "center" ? "center" : el.align === "right" ? "flex-end" : "flex-start",
                    lineHeight: 1.2,
                  }}
                >
                  {el.type === "html" ? (
                    <div className="h-full w-full" dangerouslySetInnerHTML={renderHtml(el, SAMPLE)} />
                  ) : el.type === "line" ? (
                    <div className="w-full" style={{ background: el.color, height: el.h }} />
                  ) : (
                    <span className="truncate">{renderElementValue(el, SAMPLE)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminColisPreviewCanvas;
