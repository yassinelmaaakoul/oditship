import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Receipt, FileText, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import { exportInvoiceCsv, exportInvoicePdf } from "@/lib/invoiceExport";
import { useAuth } from "@/contexts/AuthContext";

const db = supabase as any;

interface Invoice { id: number; period_start: string; period_end: string; net_amount: number; status: string; created_at: string; payment_reference: string | null; payment_proof_url: string | null; }
interface Item { id: number; tracking_number: string | null; product_name: string | null; customer_city: string | null; status_snapshot: string | null; order_value: number; fee_amount: number; }
interface Summary { count: number; cod: number; }

const VendeurFacturation = () => {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<Record<number, Summary>>({});
  const [open, setOpen] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    db.from("invoices").select("*").eq("recipient_type", "vendeur").order("created_at", { ascending: false })
      .then(async ({ data }: any) => {
        const list = (data ?? []) as Invoice[];
        setInvoices(list);
        if (list.length) {
          const { data: its } = await db.from("invoice_items").select("invoice_id, order_value").in("invoice_id", list.map((x) => x.id));
          const map: Record<number, Summary> = {};
          for (const r of (its ?? []) as any[]) {
            const cur = map[r.invoice_id] ?? { count: 0, cod: 0 };
            cur.count += 1;
            cur.cod += Number(r.order_value || 0);
            map[r.invoice_id] = cur;
          }
          setSummary(map);
        }
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    db.from("invoice_items").select("*").eq("invoice_id", open.id).order("id")
      .then(({ data }: any) => setItems((data ?? []) as Item[]));
  }, [open]);

  const exportInvoice = async (inv: Invoice, fmt: "pdf" | "csv") => {
    const { data: its } = await db.from("invoice_items").select("*").eq("invoice_id", inv.id).order("id");
    const data = {
      id: inv.id,
      recipientName: profile?.full_name || profile?.username || "—",
      recipientType: "vendeur" as const,
      period_start: inv.period_start,
      period_end: inv.period_end,
      net_amount: inv.net_amount,
      status: inv.status,
    };
    fmt === "pdf" ? exportInvoicePdf(data, (its ?? []) as any) : exportInvoiceCsv(data, (its ?? []) as any);
  };

  const viewProof = async (path: string) => {
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Facturation</h2>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Commandes / COD</TableHead>
              <TableHead>Reste</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créée</TableHead>
              <TableHead className="text-right">Export</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucune facture</TableCell></TableRow>
            ) : invoices.map((inv) => {
              const s = summary[inv.id];
              return (
              <TableRow key={inv.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setOpen(inv)}>
                <TableCell className="text-sm">
                  <div>{s?.count ?? 0} commande(s)</div>
                  <div className="text-xs text-muted-foreground font-mono">COD : {(s?.cod ?? 0).toFixed(2)}</div>
                </TableCell>
                <TableCell className="font-mono">{Number(inv.net_amount).toFixed(2)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={inv.status === "paid" ? "default" : "secondary"} className="w-fit">
                      {inv.status === "paid" ? "Payée" : "Non payée"}
                    </Badge>
                    {inv.payment_reference && <span className="text-xs text-muted-foreground font-mono">Réf: {inv.payment_reference}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => exportInvoice(inv, "pdf")}><FileText className="h-4 w-4 mr-1" />PDF</Button>
                  <Button size="sm" variant="outline" onClick={() => exportInvoice(inv, "csv")}><FileSpreadsheet className="h-4 w-4 mr-1" />CSV</Button>
                  {inv.payment_proof_url && (
                    <Button size="sm" variant="ghost" onClick={() => viewProof(inv.payment_proof_url!)} title="Voir preuve de paiement"><ImageIcon className="h-4 w-4" /></Button>
                  )}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Facture #{open?.id}</DialogTitle></DialogHeader>
          {open && (
            <div className="text-sm text-muted-foreground mb-2">
              {summary[open.id]?.count ?? items.length} commande(s) · COD : <strong>{(summary[open.id]?.cod ?? 0).toFixed(2)}</strong> · Reste : <strong>{Number(open.net_amount).toFixed(2)}</strong>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tracking</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Prix</TableHead>
                <TableHead>Tarif</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">{it.tracking_number || "—"}</TableCell>
                  <TableCell>{it.product_name || "—"}</TableCell>
                  <TableCell>{it.customer_city || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{it.status_snapshot}</Badge></TableCell>
                  <TableCell className="font-mono">{Number(it.order_value).toFixed(2)}</TableCell>
                  <TableCell className="font-mono">{Number(it.fee_amount).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendeurFacturation;
