import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportInvoice {
  id: number;
  recipientName: string;
  recipientType: "vendeur" | "livreur";
  period_start: string;
  period_end: string;
  net_amount: number;
  status: string;
}
export interface ExportItem {
  tracking_number: string | null;
  product_name: string | null;
  customer_city: string | null;
  status_snapshot: string | null;
  order_value: number;
  fee_amount: number;
  fee_type: string | null;
}

const downloadBlob = (content: BlobPart, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const csvEscape = (v: any) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportInvoiceCsv = (inv: ExportInvoice, items: ExportItem[]) => {
  const headers = ["Tracking", "Produit", "Ville", "Statut", "Type tarif", "Prix", "Tarif"];
  const rows = items.map((i) => [
    i.tracking_number, i.product_name, i.customer_city, i.status_snapshot,
    i.fee_type, Number(i.order_value).toFixed(2), Number(i.fee_amount).toFixed(2),
  ]);
  const meta = [
    [`Facture #${inv.id}`],
    [`${inv.recipientType === "vendeur" ? "Vendeur" : "Livreur"}`, inv.recipientName],
    ["Période", `${inv.period_start} → ${inv.period_end}`],
    ["Statut", inv.status],
    ["Net", Number(inv.net_amount).toFixed(2)],
    [],
  ];
  const all = [...meta, headers, ...rows];
  const csv = "\uFEFF" + all.map((r) => r.map(csvEscape).join(",")).join("\n");
  downloadBlob(csv, `facture-${inv.id}.csv`, "text/csv;charset=utf-8");
};

export const exportInvoicePdf = (inv: ExportInvoice, items: ExportItem[]) => {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Facture #${inv.id}`, 14, 18);
  doc.setFontSize(11);
  doc.text(`${inv.recipientType === "vendeur" ? "Vendeur" : "Livreur"} : ${inv.recipientName}`, 14, 28);
  doc.text(`Période : ${inv.period_start} → ${inv.period_end}`, 14, 35);
  doc.text(`Statut : ${inv.status}`, 14, 42);
  doc.text(`Net : ${Number(inv.net_amount).toFixed(2)}`, 14, 49);

  autoTable(doc, {
    startY: 56,
    head: [["Tracking", "Produit", "Ville", "Statut", "Type", "Prix", "Tarif"]],
    body: items.map((i) => [
      i.tracking_number ?? "—",
      i.product_name ?? "—",
      i.customer_city ?? "—",
      i.status_snapshot ?? "—",
      i.fee_type ?? "—",
      Number(i.order_value).toFixed(2),
      Number(i.fee_amount).toFixed(2),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40] },
  });

  doc.save(`facture-${inv.id}.pdf`);
};
