import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  defaultStickerTemplate,
  normalizeStickerTemplate,
  resolveStickerValue,
  stickerSystemFields,
  type StickerElement,
  type StickerElementType,
  type StickerSystemField,
  type StickerTemplate,
} from "@/lib/printSticker";
import { AlignCenter, AlignLeft, AlignRight, Copy, Eye, Image, Minus, QrCode, RotateCcw, Save, Smile, Trash2, Type } from "lucide-react";
import { toast } from "sonner";

const STICKER_SELECTED_KEY = "odit-sticker-editor-selected";
const STICKER_PREVIEW_OPEN_KEY = "odit-sticker-editor-preview-open";

const sampleOrder = {
  id: 1842,
  customer_name: "Client Exemple",
  customer_phone: "0600000000",
  customer_address: "Rue principale, immeuble 12, appartement 4",
  customer_city: "Casablanca",
  product_name: "Sample product",
  order_value: 249,
  open_package: false,
  comment: "Fragile",
  tracking_number: "ODIT123456",
  external_tracking_number: "AI744EA4742637",
  created_at: new Date().toISOString(),
  hub_id: 1,
  hub_name: "Casablanca Hub",
  seller_username: "seller.demo",
  seller_full_name: "Demo Seller",
  seller_company_name: "Demo Store SARL",
  seller_phone: "0611111111",
  seller_cin: "AB123456",
  seller_affiliation_code: "VD-2048",
  seller_bank_account_name: "Demo Seller",
  seller_bank_account_number: "007780000000000000000000",
};

const newElement = (type: StickerElementType, field?: StickerSystemField): StickerElement => ({
  id: crypto.randomUUID(),
  type,
  field,
  text: type === "emoji" ? "⭐" : type === "text" ? "Text" : "",
  html: type === "html" ? `<div class="custom-box">{{tracking}}</div>` : "",
  css: type === "html" ? `.custom-box {\n  width: 100%;\n  height: 100%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  border: 1px solid #111;\n  font-weight: 800;\n}` : "",
  label: type === "field" ? stickerSystemFields.find((item) => item.value === field)?.label : type,
  imageData: "",
  x: 8,
  y: 8,
  w: type === "line" ? 55 : type === "qr" || type === "image" ? 22 : type === "html" ? 42 : 34,
  h: type === "line" ? 1 : type === "qr" || type === "image" ? 22 : type === "html" ? 16 : 8,
  fontSize: type === "barcode" ? 14 : type === "emoji" ? 10 : 4,
  fontWeight: 700,
  align: "left",
  border: false,
  radius: 0,
  rotation: 0,
  visible: true,
});

const AdminSticker = () => {
  const [template, setTemplate] = useState<StickerTemplate>(defaultStickerTemplate);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(STICKER_SELECTED_KEY));
  const [previewOpen, setPreviewOpen] = useState(() => localStorage.getItem(STICKER_PREVIEW_OPEN_KEY) === "true");
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (supabase as any).from("app_settings").select("value").eq("key", "sticker_template").maybeSingle()
      .then(({ data }: any) => setTemplate(normalizeStickerTemplate(data?.value)));
  }, []);

  useEffect(() => {
    if (selectedId) localStorage.setItem(STICKER_SELECTED_KEY, selectedId);
    else localStorage.removeItem(STICKER_SELECTED_KEY);
  }, [selectedId]);

  useEffect(() => {
    localStorage.setItem(STICKER_PREVIEW_OPEN_KEY, String(previewOpen));
  }, [previewOpen]);

  const selected = useMemo(() => template.elements.find((el) => el.id === selectedId) || null, [template.elements, selectedId]);
  const previewElements = useMemo(() => {
    if (template.elements.length) return template.elements;
    return [
      { ...newElement("field", "tracking"), id: "preview-tracking", x: 8, y: 8, w: 52, h: 9, fontSize: 4.6 },
      { ...newElement("field", "customer_name"), id: "preview-client", x: 8, y: 20, w: 50, h: 8, fontSize: 3.8 },
      { ...newElement("field", "customer_phone"), id: "preview-phone", x: 8, y: 30, w: 42, h: 8, fontSize: 3.6 },
      { ...newElement("field", "customer_city"), id: "preview-city", x: 8, y: 40, w: 38, h: 8, fontSize: 4 },
      { ...newElement("qr"), id: "preview-qr", x: 68, y: 8, w: 24, h: 24 },
    ];
  }, [template.elements]);
  const updateTemplate = (patch: Partial<StickerTemplate>) => setTemplate((current) => ({ ...current, ...patch }));
  const updateElement = (id: string, patch: Partial<StickerElement>) => setTemplate((current) => ({ ...current, elements: current.elements.map((el) => el.id === id ? { ...el, ...patch } : el) }));
  const addElement = (type: StickerElementType, field?: StickerSystemField) => {
    const element = newElement(type, field);
    setTemplate((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(element.id);
  };
  const duplicate = () => selected && setTemplate((current) => {
    const copy = { ...selected, id: crypto.randomUUID(), x: selected.x + 3, y: selected.y + 3 };
    setSelectedId(copy.id);
    return { ...current, elements: [...current.elements, copy] };
  });
  const remove = () => selected && setTemplate((current) => ({ ...current, elements: current.elements.filter((el) => el.id !== selected.id) }));
  const reset = () => { setTemplate(defaultStickerTemplate); setSelectedId(null); };
  const save = async () => {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("app_settings").upsert({ key: "sticker_template", value: template, updated_by: userData.user?.id ?? null }, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Sticker saved");
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mmPerPx = template.sizeMm / rect.width;
    updateElement(drag.id, { x: Math.max(0, drag.x + (event.clientX - drag.startX) * mmPerPx), y: Math.max(0, drag.y + (event.clientY - drag.startY) * mmPerPx) });
  };

  const imageUpload = (file?: File) => {
    if (!file || !selected) return;
    const reader = new FileReader();
    reader.onload = () => updateElement(selected.id, { imageData: String(reader.result), type: "image" });
    reader.readAsDataURL(file);
  };

  const autoInsertPreviewInfo = () => {
    const elements = previewElements.map((el) => ({ ...el, id: crypto.randomUUID() }));
    setTemplate((current) => ({ ...current, elements: [...current.elements, ...elements] }));
    setSelectedId(elements[0]?.id ?? null);
  };

  const renderCustomPreview = (el: StickerElement) => {
    const vars = stickerSystemFields.reduce<Record<string, string>>((acc, field) => {
      acc[field.value] = String(resolveStickerValue(sampleOrder, field.value));
      return acc;
    }, {});
    const tracking = String(resolveStickerValue(sampleOrder, "tracking"));
    const qrPlaceholder = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:1px solid #111;font-size:9px;font-weight:700;background:repeating-linear-gradient(45deg,#000 0 2px,#fff 2px 4px);color:#fff;text-shadow:0 0 2px #000;">QR</div>`;
    const barcodeText = `*${tracking}*`;
    const replaceTriple = (value = "") => value
      .replace(/{{{\s*qr\s*}}}/g, qrPlaceholder)
      .replace(/{{{\s*barcode\s*}}}/g, barcodeText);
    const replaceVars = (value = "") => replaceTriple(value).replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
      if (key === "qr_dataurl") return "";
      if (key === "barcode_text") return barcodeText;
      return vars[key] ?? "";
    });
    const stripUnsafe = (value: string) => value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
    return { __html: `<style>${stripUnsafe(replaceVars(el.css || ""))}</style>${stripUnsafe(replaceVars(el.html || ""))}` };
  };

  const renderPreviewValue = (el: StickerElement) => {
    if (el.type === "field") return resolveStickerValue(sampleOrder, el.field);
    if (el.type === "qr") return "QR";
    if (el.type === "barcode") return `*${resolveStickerValue(sampleOrder, "tracking")}*`;
    return el.text || "";
  };

  return (
    <>
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h3 className="font-semibold">Live sticker editor</h3><p className="text-sm text-muted-foreground">Start from an empty square canvas, add any system field, text, logo, emoji, line, QR, barcode, or custom HTML/CSS block, then drag and style it freely.</p></div>
          <div className="flex flex-wrap gap-2">
            <Select onValueChange={(value) => addElement("field", value as StickerSystemField)}><SelectTrigger className="w-44"><SelectValue placeholder="+ System field" /></SelectTrigger><SelectContent>{stickerSystemFields.map((field) => <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>)}</SelectContent></Select>
            <Button variant="outline" onClick={() => addElement("text")}><Type className="mr-1 h-4 w-4" />Text</Button>
            <Button variant="outline" onClick={() => addElement("emoji")}><Smile className="mr-1 h-4 w-4" />Emoji</Button>
            <Button variant="outline" onClick={() => addElement("line")}><Minus className="mr-1 h-4 w-4" />Line</Button>
            <Button variant="outline" onClick={() => addElement("qr")}><QrCode className="mr-1 h-4 w-4" />QR</Button>
            <Button variant="outline" onClick={() => addElement("barcode")}>Barcode</Button>
            <Button variant="outline" onClick={() => addElement("html")}>HTML/CSS</Button>
            <Button variant="outline" onClick={autoInsertPreviewInfo}>Auto info</Button>
            <Button onClick={() => setPreviewOpen(true)}><Eye className="mr-1 h-4 w-4" />Preview</Button>
          </div>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="space-y-2"><Label>Square size (mm)</Label><Input type="number" min={40} max={120} step="0.1" value={template.sizeMm} onChange={(e) => updateTemplate({ sizeMm: Number(e.target.value) })} /></div>
          <div className="space-y-2"><Label>Printer margin (mm)</Label><Input type="number" min={0} max={10} step="0.1" value={template.marginMm} onChange={(e) => updateTemplate({ marginMm: Number(e.target.value) })} /></div>
          <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm"><span>Outer frame</span><Switch checked={template.showFrame} onCheckedChange={(showFrame) => updateTemplate({ showFrame })} /></label>
        </div>
        <div className="overflow-auto rounded-md border border-border bg-muted/40 p-4">
          <div
            ref={canvasRef}
            className="relative mx-auto bg-background shadow-sm"
            style={{ width: "min(72vw, 560px)", aspectRatio: "1 / 1", border: template.showFrame ? "2px solid hsl(var(--foreground))" : "1px dashed hsl(var(--border))" }}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => setDrag(null)}
          >
            {template.elements.map((el) => el.visible && (
              <div
                key={el.id}
                role="button"
                tabIndex={0}
                onPointerDown={(event) => { setSelectedId(el.id); setDrag({ id: el.id, startX: event.clientX, startY: event.clientY, x: el.x, y: el.y }); }}
                className={`absolute overflow-hidden border border-dashed p-1 leading-none ${selectedId === el.id ? "border-primary bg-primary/10" : "border-muted-foreground/40"}`}
                style={{ left: `${(el.x / template.sizeMm) * 100}%`, top: `${(el.y / template.sizeMm) * 100}%`, width: `${(el.w / template.sizeMm) * 100}%`, height: `${(el.h / template.sizeMm) * 100}%`, fontSize: `${el.fontSize * 3}px`, fontWeight: el.fontWeight, textAlign: el.align, borderRadius: `${el.radius}px`, transform: `rotate(${el.rotation}deg)`, cursor: "move" }}
              >
                {el.type === "image" && el.imageData ? <img src={el.imageData} alt="logo" className="h-full w-full object-contain" /> : el.type === "html" ? <div className="h-full w-full" dangerouslySetInnerHTML={renderCustomPreview(el)} /> : renderPreviewValue(el)}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold">Element settings</h4><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={duplicate} disabled={!selected}><Copy className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={remove} disabled={!selected}><Trash2 className="h-4 w-4" /></Button></div></div>
        {!selected ? <p className="text-sm text-muted-foreground">Select an element on the sticker or add a new element.</p> : (
          <div className="space-y-4">
            {(selected.type === "text" || selected.type === "emoji") && <div className="space-y-2"><Label>Text / Emoji</Label><Textarea value={selected.text || ""} onChange={(e) => updateElement(selected.id, { text: e.target.value })} /></div>}
            {selected.type === "field" && <div className="space-y-2"><Label>System field</Label><Select value={selected.field} onValueChange={(field) => updateElement(selected.id, { field: field as StickerSystemField })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{stickerSystemFields.map((field) => <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>)}</SelectContent></Select></div>}
            {selected.type === "html" && <div className="space-y-3 rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Use variables like {"{{tracking}}"}, {"{{customer_name}}"}, or {"{{seller_company_name}}"}. CSS applies only inside this block.</p><div className="space-y-2"><Label>HTML</Label><Textarea className="min-h-28 font-mono text-xs" value={selected.html || ""} onChange={(e) => updateElement(selected.id, { html: e.target.value })} /></div><div className="space-y-2"><Label>CSS</Label><Textarea className="min-h-32 font-mono text-xs" value={selected.css || ""} onChange={(e) => updateElement(selected.id, { css: e.target.value })} /></div></div>}
            <Button variant="outline" className="w-full" onClick={() => addElement("image")}><Image className="mr-1 h-4 w-4" />Add logo / image</Button>
            {selected.type === "image" && <Input type="file" accept="image/*" onChange={(e) => imageUpload(e.target.files?.[0])} />}
            <div className="grid grid-cols-2 gap-3">{(["x", "y", "w", "h"] as const).map((key) => <div key={key} className="space-y-2"><Label>{key.toUpperCase()} (mm)</Label><Input type="number" step="0.1" value={selected[key]} onChange={(e) => updateElement(selected.id, { [key]: Number(e.target.value) })} /></div>)}</div>
            <div className="space-y-2"><Label>Text size (mm)</Label><Input type="number" min={1} max={24} step="0.1" value={selected.fontSize} onChange={(e) => updateElement(selected.id, { fontSize: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label>Font weight</Label><Slider min={100} max={900} step={100} value={[selected.fontWeight]} onValueChange={([fontWeight]) => updateElement(selected.id, { fontWeight })} /></div>
            <div className="grid grid-cols-3 gap-2"><Button variant={selected.align === "left" ? "default" : "outline"} onClick={() => updateElement(selected.id, { align: "left" })}><AlignLeft className="h-4 w-4" /></Button><Button variant={selected.align === "center" ? "default" : "outline"} onClick={() => updateElement(selected.id, { align: "center" })}><AlignCenter className="h-4 w-4" /></Button><Button variant={selected.align === "right" ? "default" : "outline"} onClick={() => updateElement(selected.id, { align: "right" })}><AlignRight className="h-4 w-4" /></Button></div>
            <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm"><span>Element border</span><Switch checked={selected.border} onCheckedChange={(border) => updateElement(selected.id, { border })} /></label>
            <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Radius</Label><Input type="number" step="0.1" value={selected.radius} onChange={(e) => updateElement(selected.id, { radius: Number(e.target.value) })} /></div><div className="space-y-2"><Label>Rotation</Label><Input type="number" step="0.1" value={selected.rotation} onChange={(e) => updateElement(selected.id, { rotation: Number(e.target.value) })} /></div></div>
            <label className="flex items-center justify-between rounded-md border border-border p-3 text-sm"><span>Visible</span><Switch checked={selected.visible} onCheckedChange={(visible) => updateElement(selected.id, { visible })} /></label>
          </div>
        )}
        <div className="mt-5 flex gap-2"><Button variant="outline" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" />Reset</Button><Button onClick={save} disabled={saving} className="flex-1"><Save className="mr-1 h-4 w-4" />{saving ? "..." : "Save"}</Button></div>
      </Card>
    </div>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Sticker preview</DialogTitle></DialogHeader>
        <div className="rounded-md border border-border bg-muted/40 p-4">
          <div className="relative mx-auto bg-background shadow-sm" style={{ width: "min(78vw, 520px)", aspectRatio: "1 / 1", border: template.showFrame ? "2px solid hsl(var(--foreground))" : "1px dashed hsl(var(--border))" }}>
            {previewElements.map((el) => el.visible && (
              <div key={el.id} className={`absolute overflow-hidden p-1 leading-none ${el.border ? "border border-foreground" : ""}`} style={{ left: `${(el.x / template.sizeMm) * 100}%`, top: `${(el.y / template.sizeMm) * 100}%`, width: `${(el.w / template.sizeMm) * 100}%`, height: `${(el.h / template.sizeMm) * 100}%`, fontSize: `${el.fontSize * 3}px`, fontWeight: el.fontWeight, textAlign: el.align, borderRadius: `${el.radius}px`, transform: `rotate(${el.rotation}deg)` }}>
                {el.type === "image" && el.imageData ? <img src={el.imageData} alt="logo" className="h-full w-full object-contain" /> : el.type === "html" ? <div className="h-full w-full" dangerouslySetInnerHTML={renderCustomPreview(el)} /> : renderPreviewValue(el)}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default AdminSticker;
