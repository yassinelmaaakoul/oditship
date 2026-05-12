import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Receipt, Timer, Plus, Pencil, Trash2, FileText, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { generateInvoices, fetchUnbilledCounts, setInvoicePaid, recomputeInvoiceTotals } from "@/lib/invoiceGenerator";
import { exportInvoiceCsv, exportInvoicePdf } from "@/lib/invoiceExport";

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
  extra_amount: number;
  extra_description: string | null;
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
interface Schedule {
  id: number;
  recipient_type: "vendeur" | "livreur";
  enabled: boolean;
  schedule_mode: "daily" | "weekly";
  days_of_week: number[];
  hour: number;
  minute: number;
  last_run_at: string | null;
  next_run_at: string | null;
}

const DAYS = [
  { v: 1, l: "Lun" }, { v: 2, l: "Mar" }, { v: 3, l: "Mer" },
  { v: 4, l: "Jeu" }, { v: 5, l: "Ven" }, { v: 6, l: "Sam" }, { v: 0, l: "Dim" },
];

interface InvoiceSummary { count: number; cod: number; fees: number; }

const InvoicesTab = ({ type }: { type: "vendeur" | "livreur" }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<Record<number, InvoiceSummary>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [totalUnbilled, setTotalUnbilled] = useState(0);
  const [genOpen, setGenOpen] = useState(false);
  const [genTarget, setGenTarget] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Invoice | null>(null);
  const [payOpen, setPayOpen] = useState<Invoice | null>(null);

  const load = async () => {
    const [inv, p, s, c] = await Promise.all([
      db.from("invoices").select("*").eq("recipient_type", type).order("created_at", { ascending: false }),
      db.from("profiles").select("id, username, full_name").eq("role", type).order("username"),
      db.from("invoice_schedules").select("*").eq("recipient_type", type).maybeSingle(),
      fetchUnbilledCounts(type),
    ]);
    const list = (inv.data ?? []) as Invoice[];
    setInvoices(list);
    setProfiles((p.data ?? []) as Profile[]);
    setSchedule((s.data ?? null) as Schedule | null);
    setCounts(c.counts);
    setTotalUnbilled(c.total);

    if (list.length) {
      const ids = list.map((x) => x.id);
      const { data: its } = await db.from("invoice_items").select("invoice_id, order_value, fee_amount").in("invoice_id", ids);
      const map: Record<number, InvoiceSummary> = {};
      for (const r of (its ?? []) as any[]) {
        const cur = map[r.invoice_id] ?? { count: 0, cod: 0, fees: 0 };
        cur.count += 1;
        cur.cod += Number(r.order_value || 0);
        cur.fees += Number(r.fee_amount || 0);
        map[r.invoice_id] = cur;
      }
      setSummary(map);
    } else setSummary({});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type]);

  const profileName = (id: string | null) => {
    const p = profiles.find((x) => x.id === id);
    return p ? (p.full_name || p.username) : id || "—";
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await generateInvoices({
        recipientType: type,
        targetId: genTarget === "all" ? undefined : genTarget,
      });
      toast.success(`${r.created} facture(s) générée(s)`);
      setGenOpen(false);
      load();
    } catch (e: any) { toast.error(e.message || "Erreur"); }
    finally { setBusy(false); }
  };

  const markUnpaid = async (inv: Invoice) => {
    try {
      await setInvoicePaid(inv.id, false);
      toast.success("Marquée non payée");
      load();
    } catch (e: any) { toast.error(e.message || "Erreur"); }
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
    const { error } = await db.from("invoice_schedules").update({
      enabled: next.enabled,
      schedule_mode: next.schedule_mode,
      days_of_week: next.days_of_week,
      hour: next.hour,
      minute: next.minute,
    }).eq("id", schedule.id);
    if (error) return toast.error(error.message);
    setSchedule(next);
  };

  const exportInvoice = async (inv: Invoice, fmt: "pdf" | "csv") => {
    const { data: its } = await db.from("invoice_items").select("*").eq("invoice_id", inv.id).order("id");
    const exportData = {
      id: inv.id,
      recipientName: profileName(type === "vendeur" ? inv.vendeur_id : inv.livreur_id),
      recipientType: type,
      period_start: inv.period_start,
      period_end: inv.period_end,
      net_amount: inv.net_amount,
      status: inv.status,
    };
    const items = (its ?? []) as Item[];
    fmt === "pdf" ? exportInvoicePdf(exportData, items) : exportInvoiceCsv(exportData, items);
  };

  const targetLabel = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    const name = p ? (p.full_name || p.username) : id;
    return `${name} — ${counts.get(id) ?? 0} commande(s)`;
  };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Commandes en attente de facturation</div>
                <div className="text-2xl font-bold">{totalUnbilled}</div>
              </div>
              <Button onClick={() => setGenOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Générer une facture
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" />
              <span className="font-medium">Génération automatique</span>
              <Switch
                className="ml-auto"
                checked={schedule?.enabled ?? false}
                onCheckedChange={(v) => saveSchedule({ enabled: v })}
              />
            </div>
            {schedule && (
              <>
                <RadioGroup
                  className="flex gap-4"
                  value={schedule.schedule_mode}
                  onValueChange={(v) => saveSchedule({ schedule_mode: v as any })}
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="daily" /> Tous les jours
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="weekly" /> Jours spécifiques
                  </label>
                </RadioGroup>
                {schedule.schedule_mode === "weekly" && (
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((d) => {
                      const checked = schedule.days_of_week.includes(d.v);
                      return (
                        <label key={d.v} className="flex items-center gap-1 text-sm border rounded px-2 py-1 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) => {
                              const next = c
                                ? [...schedule.days_of_week, d.v]
                                : schedule.days_of_week.filter((x) => x !== d.v);
                              saveSchedule({ days_of_week: next });
                            }}
                          />
                          {d.l}
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <span>Heure :</span>
                  <Input type="number" min={0} max={23} className="h-8 w-16" value={schedule.hour}
                    onChange={(e) => saveSchedule({ hour: Math.max(0, Math.min(23, Number(e.target.value))) })} />
                  <span>:</span>
                  <Input type="number" min={0} max={59} className="h-8 w-16" value={schedule.minute}
                    onChange={(e) => saveSchedule({ minute: Math.max(0, Math.min(59, Number(e.target.value))) })} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Facture</TableHead>
              <TableHead>{type === "vendeur" ? "Vendeur" : "Livreur"}</TableHead>
              <TableHead>Commandes / COD</TableHead>
              <TableHead>Tarif</TableHead>
              <TableHead>Autre tarif</TableHead>
              <TableHead>Reste</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créée</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Aucune facture</TableCell></TableRow>
            ) : invoices.map((inv) => {
              const s = summary[inv.id];
              return (
              <TableRow key={inv.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setOpen(inv)}>
                <TableCell className="font-mono font-semibold">#{inv.id}</TableCell>
                <TableCell className="font-medium">{profileName(type === "vendeur" ? inv.vendeur_id : inv.livreur_id)}</TableCell>
                <TableCell className="text-sm">
                  <div>{s?.count ?? 0} commande(s)</div>
                  <div className="text-xs text-muted-foreground font-mono">COD : {(s?.cod ?? 0).toFixed(2)}</div>
                </TableCell>
                <TableCell className="font-mono">{(s?.fees ?? 0).toFixed(2)}</TableCell>
                <TableCell className="font-mono text-xs">
                  <div>{Number(inv.extra_amount || 0).toFixed(2)}</div>
                  {inv.extra_description && <div className="text-muted-foreground truncate max-w-[140px]" title={inv.extra_description}>{inv.extra_description}</div>}
                </TableCell>
                <TableCell className="font-mono font-semibold">{Number(inv.net_amount).toFixed(2)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {inv.status === "paid" ? (
                    <Badge variant="default" className="cursor-pointer" onClick={() => markUnpaid(inv)} title="Marquer comme non payée">Payée</Badge>
                  ) : (
                    <Badge variant="secondary" className="cursor-pointer" onClick={() => setPayOpen(inv)} title="Enregistrer le paiement">Non payée</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" onClick={() => exportInvoice(inv, "pdf")}><FileText className="h-4 w-4 mr-1" />PDF</Button>
                  <Button variant="outline" size="sm" onClick={() => exportInvoice(inv, "csv")}><FileSpreadsheet className="h-4 w-4 mr-1" />CSV</Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteInvoice(inv.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
              );
            })}
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
              <Select value={genTarget} onValueChange={setGenTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous — {totalUnbilled} commande(s)</SelectItem>
                  {profiles
                    .filter((p) => (counts.get(p.id) ?? 0) > 0)
                    .map((p) => <SelectItem key={p.id} value={p.id}>{targetLabel(p.id)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Seules les commandes Livré / Refusé / Annulé non encore facturées sont incluses.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Annuler</Button>
            <Button onClick={generate} disabled={busy || totalUnbilled === 0}>{busy ? "..." : "Générer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog invoice={payOpen} onClose={() => setPayOpen(null)} onSaved={load} />

      <InvoiceDetail invoice={open} onClose={() => { setOpen(null); load(); }} recipientName={open ? profileName(type === "vendeur" ? open.vendeur_id : open.livreur_id) : ""} onExport={exportInvoice} summary={open ? summary[open.id] : undefined} />
    </div>
  );
};

const PaymentDialog = ({ invoice, onClose, onSaved }: { invoice: Invoice | null; onClose: () => void; onSaved: () => void }) => {
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setReference(""); setFile(null); }, [invoice?.id]);

  const submit = async () => {
    if (!invoice) return;
    if (!reference.trim()) { toast.error("Numéro de référence requis"); return; }
    if (!file) { toast.error("Capture d'écran du virement requise"); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `invoice-${invoice.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      await setInvoicePaid(invoice.id, true, { reference: reference.trim(), proofUrl: path });
      toast.success("Paiement enregistré");
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e.message || "Erreur"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enregistrer le paiement — Facture #{invoice?.id}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Numéro de référence du virement bancaire</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="REF-12345..." />
          </div>
          <div>
            <Label>Capture d'écran (preuve du virement)</Label>
            <Input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <p className="text-xs text-muted-foreground mt-1">{file.name}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "..." : "Marquer comme payée"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const InvoiceDetail = ({ invoice, onClose, recipientName, onExport, summary }: { invoice: Invoice | null; onClose: () => void; recipientName: string; onExport: (inv: Invoice, fmt: "pdf" | "csv") => void; summary?: InvoiceSummary }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Item>>({});
  const [extraAmount, setExtraAmount] = useState(0);
  const [extraDesc, setExtraDesc] = useState("");
  const [currentNet, setCurrentNet] = useState(0);

  const reload = () => {
    if (!invoice) return;
    db.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("id").then(({ data }: any) => setItems((data ?? []) as Item[]));
    db.from("invoices").select("net_amount, extra_amount, extra_description").eq("id", invoice.id).single().then(({ data }: any) => {
      if (!data) return;
      setExtraAmount(Number(data.extra_amount || 0));
      setExtraDesc(data.extra_description || "");
      setCurrentNet(Number(data.net_amount || 0));
    });
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [invoice]);

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
    if (invoice) await recomputeInvoiceTotals(invoice.id);
    toast.success("Ligne mise à jour");
    setEditing(null);
    reload();
  };

  const saveExtra = async () => {
    if (!invoice) return;
    const { error } = await db.from("invoices").update({
      extra_amount: Number(extraAmount || 0),
      extra_description: extraDesc || null,
    }).eq("id", invoice.id);
    if (error) return toast.error(error.message);
    await recomputeInvoiceTotals(invoice.id);
    toast.success("Autre tarif enregistré");
    reload();
  };

  const totalFees = items.reduce((a, i) => a + Number(i.fee_amount || 0), 0);
  const totalCod = items.filter((i) => i.fee_type === "livraison").reduce((a, i) => a + Number(i.order_value || 0), 0);


  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Facture #{invoice?.id} — {recipientName}</span>
            {invoice && (
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => onExport(invoice, "pdf")}><FileText className="h-4 w-4 mr-1" />PDF</Button>
                <Button size="sm" variant="outline" onClick={() => onExport(invoice, "csv")}><FileSpreadsheet className="h-4 w-4 mr-1" />CSV</Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-4 gap-2 text-sm mb-3">
          <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Commandes</div><div className="font-semibold">{summary?.count ?? items.length}</div></div>
          <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">COD</div><div className="font-semibold font-mono">{(summary?.cod ?? totalCod).toFixed(2)}</div></div>
          <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Tarif</div><div className="font-semibold font-mono">{totalFees.toFixed(2)}</div></div>
          <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">Reste</div><div className="font-semibold font-mono">{currentNet.toFixed(2)}</div></div>
        </div>
        <div className="rounded-md border p-3 mb-3 space-y-2 bg-muted/30">
          <div className="text-sm font-medium">Autre tarif</div>
          <div className="grid sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Montant</Label>
              <Input type="number" step="0.01" value={extraAmount} onChange={(e) => setExtraAmount(Number(e.target.value))} className="h-8" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Description</Label>
              <Input value={extraDesc} onChange={(e) => setExtraDesc(e.target.value)} placeholder="Ex. emballage spécial, frais de retour…" className="h-8" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveExtra}>Enregistrer</Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tracking</TableHead><TableHead>Produit</TableHead><TableHead>Ville</TableHead>
              <TableHead>Statut</TableHead><TableHead>Prix</TableHead><TableHead>Tarif</TableHead><TableHead></TableHead>
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
