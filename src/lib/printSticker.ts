import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";

export interface StickerOrder {
  id: number;
  vendeur_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_city: string;
  product_name: string;
  order_value: number;
  open_package: boolean;
  comment?: string | null;
  tracking_number?: string | null;
  external_tracking_number?: string | null;
  created_at?: string | null;
  seller_username?: string | null;
  seller_full_name?: string | null;
  seller_company_name?: string | null;
  seller_phone?: string | null;
  seller_cin?: string | null;
  seller_affiliation_code?: string | null;
  seller_bank_account_name?: string | null;
  seller_bank_account_number?: string | null;
  seller_city?: string | null;
  hub_id?: number | null;
  hub_name?: string | null;
}

export type StickerElementType = "field" | "text" | "line" | "image" | "emoji" | "qr" | "barcode" | "html";
export type StickerSystemField =
  | "tracking" | "customer_name" | "customer_phone" | "customer_city" | "customer_address"
  | "product_name" | "order_value" | "open_package" | "comment" | "created_at" | "order_id"
  | "hub"
  | "seller_username" | "seller_full_name" | "seller_company_name" | "seller_phone" | "seller_cin"
  | "seller_affiliation_code" | "seller_bank_account_name" | "seller_bank_account_number" | "seller_city";

export interface StickerElement {
  id: string;
  type: StickerElementType;
  label?: string;
  field?: StickerSystemField;
  text?: string;
  html?: string;
  css?: string;
  imageData?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: number;
  align: "left" | "center" | "right";
  border: boolean;
  radius: number;
  rotation: number;
  visible: boolean;
}

export interface StickerTemplate {
  version: 2;
  sizeMm: number;
  marginMm: number;
  showFrame: boolean;
  elements: StickerElement[];
}

export const stickerSystemFields: { value: StickerSystemField; label: string }[] = [
  { value: "tracking", label: "Numéro suivi" },
  { value: "customer_name", label: "Customer name" },
  { value: "customer_phone", label: "Customer phone" },
  { value: "customer_city", label: "Customer city" },
  { value: "customer_address", label: "Customer address" },
  { value: "product_name", label: "Product" },
  { value: "order_value", label: "Price" },
  { value: "open_package", label: "Open package" },
  { value: "comment", label: "Comment" },
  { value: "created_at", label: "Date" },
  { value: "order_id", label: "Order ID" },
  { value: "hub", label: "Hub" },
  { value: "seller_username", label: "Seller username" },
  { value: "seller_full_name", label: "Seller full name" },
  { value: "seller_company_name", label: "Seller company" },
  { value: "seller_phone", label: "Seller phone" },
  { value: "seller_cin", label: "Seller CIN" },
  { value: "seller_affiliation_code", label: "Seller affiliation code" },
  { value: "seller_bank_account_name", label: "Seller bank account name" },
  { value: "seller_bank_account_number", label: "Seller bank account number" },
];

export const defaultStickerTemplate: StickerTemplate = {
  version: 2,
  sizeMm: 100,
  marginMm: 2,
  showFrame: true,
  elements: [],
};

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));
const stripUnsafeHtml = (value: string) => value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const n = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const normalizeStickerTemplate = (raw: unknown): StickerTemplate => {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<StickerTemplate> & Record<string, unknown>;
  if (source.version === 2 && Array.isArray(source.elements)) {
    return {
      version: 2,
      sizeMm: clamp(n(source.sizeMm, 100), 40, 120),
      marginMm: clamp(n(source.marginMm, 2), 0, 10),
      showFrame: source.showFrame !== false,
      elements: source.elements.map((el, index) => normalizeElement(el, index)),
    };
  }
  return defaultStickerTemplate;
};

const normalizeElement = (element: Partial<StickerElement>, index: number): StickerElement => ({
  id: String(element.id || `el-${index}-${Date.now()}`),
  type: ["field", "text", "line", "image", "emoji", "qr", "barcode", "html"].includes(String(element.type)) ? element.type as StickerElementType : "text",
  label: element.label || "",
  field: element.field,
  text: element.text || "",
  html: element.html || "",
  css: element.css || "",
  imageData: element.imageData || "",
  x: clamp(n(element.x, 8), 0, 100),
  y: clamp(n(element.y, 8), 0, 100),
  w: clamp(n(element.w, 30), 1, 100),
  h: clamp(n(element.h, 8), 1, 100),
  fontSize: clamp(n(element.fontSize, 4), 1, 24),
  fontWeight: clamp(n(element.fontWeight, 700), 100, 900),
  align: element.align === "center" || element.align === "right" ? element.align : "left",
  border: Boolean(element.border),
  radius: clamp(n(element.radius, 0), 0, 20),
  rotation: clamp(n(element.rotation, 0), -180, 180),
  visible: element.visible !== false,
});

export const getStickerTemplate = async (): Promise<StickerTemplate> => {
  const { data } = await (supabase as any).from("app_settings").select("value").eq("key", "sticker_template").maybeSingle();
  return normalizeStickerTemplate(data?.value);
};

export const resolveStickerValue = (order: StickerOrder, field?: StickerSystemField) => {
  const tracking = order.external_tracking_number || order.tracking_number || `ODiT-${order.id}`;
  switch (field) {
    case "tracking": return tracking;
    case "customer_name": return order.customer_name;
    case "customer_phone": return order.customer_phone;
    case "customer_city": return order.customer_city;
    case "customer_address": return order.customer_address;
    case "product_name": return order.product_name;
    case "order_value": return `${Number(order.order_value || 0).toFixed(2)} DH`;
    case "open_package": return order.open_package ? "NE PAS OUVRIR" : "AUTORISER D'OUVRIR";
    case "comment": return order.comment || "";
    case "created_at": return new Date(order.created_at || Date.now()).toLocaleString("fr-FR");
    case "order_id": return String(order.id);
    case "hub": return order.hub_name || (order.hub_id ? `Hub #${order.hub_id}` : "");
    case "seller_username": return order.seller_username || "";
    case "seller_full_name": return order.seller_full_name || "";
    case "seller_company_name": return order.seller_company_name || "";
    case "seller_phone": return order.seller_phone || "";
    case "seller_cin": return order.seller_cin || "";
    case "seller_affiliation_code": return order.seller_affiliation_code || "";
    case "seller_bank_account_name": return order.seller_bank_account_name || "";
    case "seller_bank_account_number": return order.seller_bank_account_number || "";
    default: return "";
  }
};

const elementCss = (el: StickerElement) => `left:${el.x}mm;top:${el.y}mm;width:${el.w}mm;height:${el.h}mm;font-size:${el.fontSize}mm;font-weight:${el.fontWeight};text-align:${el.align};border:${el.border ? ".35mm solid #111" : "0"};border-radius:${el.radius}mm;transform:rotate(${el.rotation}deg);`;
const renderCustomHtml = (order: StickerOrder, el: StickerElement) => {
  const vars = stickerSystemFields.reduce<Record<string, string>>((acc, field) => {
    acc[field.value] = esc(resolveStickerValue(order, field.value));
    return acc;
  }, {});
  const replaceVars = (value = "") => value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => vars[key] ?? "");
  return `<style>${stripUnsafeHtml(replaceVars(el.css))}</style>${stripUnsafeHtml(replaceVars(el.html || ""))}`;
};

const withSellerProfile = async (order: StickerOrder): Promise<StickerOrder> => {
  const needsSeller = order.vendeur_id && !order.seller_username && !order.seller_full_name && !order.seller_company_name;
  const needsHub = order.hub_id && !order.hub_name;
  if (!needsSeller && !needsHub) return order;
  const [sellerResult, hubResult] = await Promise.all([
    needsSeller ? (supabase as any).from("profiles").select("username, full_name, company_name, phone, cin, affiliation_code, bank_account_name, bank_account_number").eq("id", order.vendeur_id).maybeSingle() : Promise.resolve({ data: null }),
    needsHub ? (supabase as any).from("hubs").select("name").eq("id", order.hub_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    ...order,
    seller_username: sellerResult.data?.username ?? order.seller_username ?? null,
    seller_full_name: sellerResult.data?.full_name ?? order.seller_full_name ?? null,
    seller_company_name: sellerResult.data?.company_name ?? order.seller_company_name ?? null,
    seller_phone: sellerResult.data?.phone ?? order.seller_phone ?? null,
    seller_cin: sellerResult.data?.cin ?? order.seller_cin ?? null,
    seller_affiliation_code: sellerResult.data?.affiliation_code ?? order.seller_affiliation_code ?? null,
    seller_bank_account_name: sellerResult.data?.bank_account_name ?? order.seller_bank_account_name ?? null,
    seller_bank_account_number: sellerResult.data?.bank_account_number ?? order.seller_bank_account_number ?? null,
    hub_name: hubResult.data?.name ?? order.hub_name ?? null,
  };
};

const stickerStyles = (template: StickerTemplate) => `
@page { size: ${template.sizeMm}mm ${template.sizeMm}mm; margin: ${template.marginMm}mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; margin:0; color:#070707; background:#fff; }
.sticker { position:relative; width:${Math.max(20, template.sizeMm - template.marginMm * 2)}mm; height:${Math.max(20, template.sizeMm - template.marginMm * 2)}mm; page-break-after:always; overflow:hidden; border:${template.showFrame ? ".35mm solid #111" : "0"}; }
.sticker:last-child { page-break-after:auto; }
.el { position:absolute; overflow:hidden; line-height:1.05; word-break:break-word; display:flex; align-items:center; padding:.5mm; transform-origin:center; }
.el.center { justify-content:center; } .el.right { justify-content:flex-end; } .el.left { justify-content:flex-start; }
.el-line { padding:0; border-top:.45mm solid #111 !important; height:0 !important; min-height:0; }
.el-image img, .el-qr img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
.el-barcode { font-family:'Libre Barcode 39', monospace; white-space:nowrap; line-height:.8; }
`;

const renderElement = async (order: StickerOrder, el: StickerElement) => {
  if (!el.visible) return "";
  const tracking = resolveStickerValue(order, "tracking");
  const classes = `el ${el.align} el-${el.type}`;
  if (el.type === "line") return `<div class="${classes} el-line" style="${elementCss(el)}"></div>`;
  if (el.type === "image") return `<div class="${classes}" style="${elementCss(el)}">${el.imageData ? `<img src="${esc(el.imageData)}" alt="logo">` : ""}</div>`;
  if (el.type === "qr") {
    const qr = await QRCode.toDataURL(tracking, { width: 160, margin: 1 });
    return `<div class="${classes}" style="${elementCss(el)}"><img src="${qr}" alt="QR"></div>`;
  }
  if (el.type === "barcode") return `<div class="${classes}" style="${elementCss(el)}">*${esc(tracking)}*</div>`;
  if (el.type === "html") return `<div class="${classes}" style="${elementCss(el)}">${renderCustomHtml(order, el)}</div>`;
  const value = el.type === "field" ? resolveStickerValue(order, el.field) : el.text;
  return `<div class="${classes}" style="${elementCss(el)}">${esc(value)}</div>`;
};

const renderSticker = async (order: StickerOrder, template: StickerTemplate) => {
  const elements = (await Promise.all(template.elements.map((el) => renderElement(order, el)))).join("");
  return `<div class="sticker">${elements}</div>`;
};

const openPrintWindow = (title: string, body: string, template: StickerTemplate) => {
  const win = window.open("", "_blank", "width=620,height=620");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>${stickerStyles(template)}</style><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap"></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  win.document.close();
};

export const printSticker = async (order: StickerOrder) => {
  const template = await getStickerTemplate();
  const enrichedOrder = await withSellerProfile(order);
  openPrintWindow(`Sticker ${enrichedOrder.external_tracking_number || enrichedOrder.tracking_number || enrichedOrder.id}`, await renderSticker(enrichedOrder, template), template);
};

export const printStickers = async (orders: StickerOrder[]) => {
  if (!orders.length) return;
  const template = await getStickerTemplate();
  const enrichedOrders = await Promise.all(orders.map(withSellerProfile));
  const html = (await Promise.all(enrichedOrders.map((order) => renderSticker(order, template)))).join("");
  openPrintWindow(`Stickers (${orders.length})`, html, template);
};
