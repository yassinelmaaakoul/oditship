import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Timer, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { generateInvoices } from "@/lib/invoiceGenerator";

const db = supabase as any;

interface Invoice {
  id: number;
  recipient_type: "vendeur" | "livreur";
  vendeur_id: string | null;
  livreur_id: string | null;
  period_start: string;
  period_end: string;
  net_amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

interface Item {
  id: number;
  invoice_id: number;
  order_id: number | null;
  tracking_number: string | null;
  product_name: string | null;
  customer_city: string | null;
  status_snapshot: string | null;
  order_value: number;
  fee_amount: number;
  fee_type: string | null;
}

interface Profile { id: string; username: string; full_name: string | null; }
interface Schedule { id: number; recipient_type: "vendeur" | "livreur"; enabled: boolean; frequency_days: number; last_run_at: string | null; next_run_at: string | null; }

const todayStr = (d = new Date()) => d.toISOString().slice(0, 10);
const daysAgoStr = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return todayStr(d); };

const InvoicesTab = ({ type }: { type: "vendeur" | "livreur" }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ targetId: "all", periodStart: daysAgoStr(30), periodEnd: todayStr() });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Invoice | null>(null);

  const load = async () => {
    const [inv, p, s] = await Promise.all([
      db.from("invoices").select("*").eq("recipient_type", type).order("created_at", { ascending: false }),
      db.from("profiles").select("id, username, full_name").eq("role", type).order("username"),
      db.from("invoice_schedules").select("*").eq("recipient_type", type).maybeSingle(),
    ]);
    setInvoices((inv.data ?? []) as Invoice[]);
    setProfiles((p.data ?? []) as Profile[]);
    setSchedule((s.data ?? null) as Schedule | null);
  };
  useEffect(() => { load(); }, [type]);

  const profileName = (id: string | null) => {
    const p = profiles.find((x) => x.id === id);
    return p ? (p.full_name || p.username) : id || "—";
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await generateInvoices({
        recipientType: type,
        targetId: gen.targetId === "all" ? undefined : gen.targetId,
        periodStart: gen.periodStart,
        periodEnd: gen.periodEnd,
      });
      toast.success(`${r.created} facture(s) générée(s)`);
      setGenOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally { setBusy(false); }
  };

  const togglePaid = async (inv: Invoice) => {
    const newStatus = inv.status === "paid" ? "draft" : "paid";
    const { error } = await db.from("invoices").update({ status: newStatus, paid_at: newStatus === "paid" ? new Date().toISOString() : null }).eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success(newStatus === "paid" ? "Marquée payée" : "Marquée non payée");
    load();
  };

  const deleteInvoice = async (id: number) => {
    if (!confirm("Supprimer cette facture ?")) return;
    await db.from("invoice_items").delete().eq("invoice_id", id);
    const { error } = await db.from("invoices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Supprimée");
    load();
  };

  const saveSchedule = async (patch: Partial<Schedule>) => {
    if (!schedule) return;
    const next = { ...schedule, ...patch };
    if (patch.enabled === true && !next.next_run_at) {
      const d = new Date(); d.setDate(d.getDate() + next.frequency_days);
      next.next_run_at = d.toISOString();
    }
    const { error } = await db.from("invoice_schedules").update({
      enabled: next.enabled,
      frequency_days: next.frequency_days,
      next_run_at: next.next_run_at,
    }).eq("id", schedule.id);
    if (error) return toast.error(error.message);
    setSchedule(next);
    toast.success("Planification mise à jour");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setGenOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Générer une facture
        </Button>

        <Card className="flex-1 min-w-[280px]">
          <CardContent className="p-3 flex flex-wrap items-center gap-3 text-sm">
            <Timer className="h-4 w-4 text-primary" />
            <span className="font-medium">Génération automatique</span>
            <Switch
              checked={schedule?.enabled ?? false}
              onCheckedChange={(v) => saveSchedule({ enabled: v })}
            />
            <span className="text-muted-foreground">tous les</span>
            <Input
              type="number"
              min={1}
              className="h-8 w-20"
              value={schedule?.frequency_days ?? 30}
              onChange={(e) => saveSchedule({ frequency_days: Number(e.target.value) })}
            />
            <span className="text-muted-foreground">jours</span>
            {schedule?.next_run_at && schedule.enabled && (
              <Badge variant="secondary" className="ml-auto">
                Prochain run : {new Date(schedule.next_run_at).toLocaleString()}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{type === "vendeur" ? "Vendeur" : "Livreur"}</TableHead>
              <TableHead>Période</TableHead>
              <TableHead>Montant net</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créée</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucune facture</TableCell></TableRow>
            ) : invoices.map((inv) => (
              <TableRow key={inv.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setOpen(inv)}>
                <TableCell className="font-medium">{profileName(type === "vendeur" ? inv.vendeur_id : inv.livreur_id)}</TableCell>
                <TableCell className="text-sm">{inv.period_start} → {inv.period_end}</TableCell>
                <TableCell className="font-mono">{Number(inv.net_amount).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                    {inv.status === "paid" ? "Payée" : "Non payée"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => togglePaid(inv)}>
                    {inv.status === "paid" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteInvoice(inv.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Generate dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Générer une facture {type}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{type === "vendeur" ? "Vendeur" : "Livreur"}</Label>
              <Select value={gen.targetId} onValueChange={(v) => setGen({ ...gen, targetId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Période — début</Label><Input type="date" value={gen.periodStart} onChange={(e) => setGen({ ...gen, periodStart: e.target.value })} /></div>
              <div><Label>Période — fin</Label><Input type="date" value={gen.periodEnd} onChange={(e) => setGen({ ...gen, periodEnd: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Annuler</Button>
            <Button onClick={generate} disabled={busy}>{busy ? "..." : "Générer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <InvoiceDetail invoice={open} onClose={() => { setOpen(null); load(); }} recipientName={open ? profileName(type === "vendeur" ? open.vendeur_id : open.livreur_id) : ""} />
    </div>
  );
};

const InvoiceDetail = ({ invoice, onClose, recipientName }: { invoice: Invoice | null; onClose: () => void; recipientName: string }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Item>>({});

  useEffect(() => {
    if (!invoice) return;
    db.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("id").then(({ data }: any) => setItems((data ?? []) as Item[]));
  }, [invoice]);

  const startEdit = (it: Item) => { setEditing(it.id); setDraft({ ...it }); };
  const saveEdit = async () => {
    const { error } = await db.from("invoice_items").update({
      product_name: draft.product_name,
      tracking_number: draft.tracking_number,
      customer_city: draft.customer_city,
      status_snapshot: draft.status_snapshot,
      order_value: Number(draft.order_value || 0),
      fee_amount: Number(draft.fee_amount || 0),
    }).eq("id", editing);
    if (error) return toast.error(error.message);
    toast.success("Ligne mise à jour");
    setEditing(null);
    if (invoice) db.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("id").then(({ data }: any) => setItems((data ?? []) as Item[]));
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Facture #{invoice?.id} — {recipientName}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-2">
          {invoice?.period_start} → {invoice?.period_end} · Net : <strong>{Number(invoice?.net_amount || 0).toFixed(2)}</strong>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tracking</TableHead>
              <TableHead>Produit</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Tarif</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                {editing === it.id ? (
                  <>
                    <TableCell><Input className="h-8" value={draft.tracking_number || ""} onChange={(e) => setDraft({ ...draft, tracking_number: e.target.value })} /></TableCell>
                    <TableCell><Input className="h-8" value={draft.product_name || ""} onChange={(e) => setDraft({ ...draft, product_name: e.target.value })} /></TableCell>
                    <TableCell><Input className="h-8" value={draft.customer_city || ""} onChange={(e) => setDraft({ ...draft, customer_city: e.target.value })} /></TableCell>
                    <TableCell><Input className="h-8" value={draft.status_snapshot || ""} onChange={(e) => setDraft({ ...draft, status_snapshot: e.target.value })} /></TableCell>
                    <TableCell><Input className="h-8 w-24" type="number" step="0.01" value={draft.order_value ?? 0} onChange={(e) => setDraft({ ...draft, order_value: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input className="h-8 w-24" type="number" step="0.01" value={draft.fee_amount ?? 0} onChange={(e) => setDraft({ ...draft, fee_amount: Number(e.target.value) })} /></TableCell>
                    <TableCell>
                      <Button size="sm" onClick={saveEdit}>OK</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>X</Button>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="font-mono text-xs">{it.tracking_number || "—"}</TableCell>
                    <TableCell>{it.product_name || "—"}</TableCell>
                    <TableCell>{it.customer_city || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{it.status_snapshot}</Badge></TableCell>
                    <TableCell className="font-mono">{Number(it.order_value).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">{Number(it.fee_amount).toFixed(2)}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => startEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Aucune ligne</TableCell></TableRow>}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
};

const AdminFacturation = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-2">
      <Receipt className="h-6 w-6 text-primary" />
      <h2 className="text-2xl font-bold">Facturation</h2>
    </div>
    <Tabs defaultValue="livreur">
      <TabsList>
        <TabsTrigger value="livreur">Facturation Livreurs</TabsTrigger>
        <TabsTrigger value="vendeur">Facturation Vendeurs</TabsTrigger>
      </TabsList>
      <TabsContent value="livreur" className="mt-4"><InvoicesTab type="livreur" /></TabsContent>
      <TabsContent value="vendeur" className="mt-4"><InvoicesTab type="vendeur" /></TabsContent>
    </Tabs>
  </div>
);

export default AdminFacturation;
