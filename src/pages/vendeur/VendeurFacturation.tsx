import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Receipt } from "lucide-react";

const db = supabase as any;

interface Invoice { id: number; period_start: string; period_end: string; net_amount: number; status: string; created_at: string; }
interface Item { id: number; tracking_number: string | null; product_name: string | null; customer_city: string | null; status_snapshot: string | null; order_value: number; fee_amount: number; }

const VendeurFacturation = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [open, setOpen] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    db.from("invoices").select("*").eq("recipient_type", "vendeur").order("created_at", { ascending: false })
      .then(({ data }: any) => setInvoices((data ?? []) as Invoice[]));
  }, []);

  useEffect(() => {
    if (!open) return;
    db.from("invoice_items").select("*").eq("invoice_id", open.id).order("id")
      .then(({ data }: any) => setItems((data ?? []) as Item[]));
  }, [open]);

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
              <TableHead>Période</TableHead>
              <TableHead>Montant net</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créée</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Aucune facture</TableCell></TableRow>
            ) : invoices.map((inv) => (
              <TableRow key={inv.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setOpen(inv)}>
                <TableCell>{inv.period_start} → {inv.period_end}</TableCell>
                <TableCell className="font-mono">{Number(inv.net_amount).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                    {inv.status === "paid" ? "Payée" : "Non payée"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Facture #{open?.id}</DialogTitle></DialogHeader>
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
