import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, UserX, UserCheck, LogIn, Search, Trash2, Wallet } from "lucide-react";
import PackManager from "@/components/dashboard/PackManager";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const ROLES = [
  "superviseur","administrateur","vendeur","agent","ramassoire","magasinier",
  "support","suivi","comptable","livreur","commercial","gestion_retour",
];

interface ProfileRow {
  id: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  cin: string | null;
  city: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  bank_account_name: string | null;
  bank_account_number: string | null;
}

const emptyForm = {
  username: "", email: "", password: "",
  full_name: "", phone: "", cin: "", city: "",
  role: "vendeur", is_active: true,
  bank_account_name: "", bank_account_number: "",
  current_password: "",
};

const AdminUtilisateurs = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<"all" | "vendeur">("all");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [emailLoading, setEmailLoading] = useState(false);

  const load = () => {
    setLoading(true);
    supabase.from("profiles").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { setRows((data ?? []) as ProfileRow[]); setLoading(false); });
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tab === "vendeur" && r.role !== "vendeur") return false;
      // "Utilisateurs" tab excludes vendeurs (and agents which belong to vendeurs)
      if (tab === "all" && (r.role === "vendeur" || r.role === "agent" || r.role === "livreur")) return false;
      if (tab === "all" && roleFilter !== "all" && r.role !== roleFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!r.username.toLowerCase().includes(q) &&
            !(r.full_name || "").toLowerCase().includes(q) &&
            !(r.phone || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, tab, roleFilter, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, role: tab === "vendeur" ? "vendeur" : "vendeur" });
    setOpen(true);
  };
  const openEdit = async (r: ProfileRow) => {
    setEditing(r);
    setEmailLoading(true);
    setForm({
      ...emptyForm,
      username: r.username,
      full_name: r.full_name ?? "",
      phone: r.phone ?? "",
      cin: r.cin ?? "",
      city: r.city ?? "",
      role: r.role,
      is_active: r.is_active,
      bank_account_name: r.bank_account_name ?? "",
      bank_account_number: r.bank_account_number ?? "",
    });
    setOpen(true);
    // Fetch the stored plain password (admin-only)
    const [{ data: pw }, { data: emailData, error: emailErr }] = await Promise.all([
      supabase.from("plain_passwords").select("password").eq("user_id", r.id).maybeSingle(),
      supabase.functions.invoke("admin-update-user", { body: { user_id: r.id, get_email: true } }),
    ]);
    if (emailErr || (emailData as any)?.error) toast.error((emailData as any)?.error || emailErr?.message || "Email introuvable");
    setForm((f) => ({ ...f, current_password: (pw as any)?.password ?? "", email: (emailData as any)?.email ?? "" }));
    setEmailLoading(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = {
          user_id: editing.id,
          username: form.username.toLowerCase().trim(),
          full_name: form.full_name || null,
          phone: form.phone || null,
          cin: form.cin || null,
          city: form.city || null,
          role: form.role,
          is_active: form.is_active,
        };
        if (form.password) payload.password = form.password;
        if (form.email) payload.email = form.email;
        if (form.role === "vendeur") {
          payload.bank_account_name = form.bank_account_name || null;
          payload.bank_account_number = form.bank_account_number || null;
        }
        const { data, error } = await supabase.functions.invoke("admin-update-user", { body: payload });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success("Utilisateur mis à jour");
      } else {
        const { data, error } = await supabase.functions.invoke("admin-create-user", {
          body: {
            email: form.email, password: form.password, username: form.username.toLowerCase().trim(),
            full_name: form.full_name, phone: form.phone, cin: form.cin, city: form.city,
            role: form.role, is_active: form.is_active,
            bank_account_name: form.role === "vendeur" ? form.bank_account_name : null,
            bank_account_number: form.role === "vendeur" ? form.bank_account_number : null,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success("Utilisateur créé");
      }
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (r: ProfileRow) => {
    if (r.id === user?.id) return toast.error("Vous ne pouvez pas désactiver votre propre compte");
    const { error } = await supabase.from("profiles").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success(r.is_active ? "Désactivé" : "Activé"); load(); }
  };

  const loginAs = async (r: ProfileRow) => {
    if (r.id === user?.id) return toast.error("Vous êtes déjà connecté avec ce compte");
    try {
      const { data, error } = await supabase.functions.invoke("get-impersonation-token", {
        body: { targetUserId: r.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const access_token = (data as any)?.access_token;
      const refresh_token = (data as any)?.refresh_token;
      if (!access_token || !refresh_token) throw new Error("Jeton de session introuvable");
      const url = `/impersonate?access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}`;
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        toast.error("Veuillez autoriser les popups pour ce site");
      } else {
        toast.success(`Connexion en tant que ${r.username} dans un nouvel onglet`);
        // Reload the admin tab shortly after to reset any UI side-effects
        // triggered by storage events from the impersonated tab. The admin
        // session in localStorage is unaffected, so the reload restores the
        // correct admin URL and sidebar.
        setTimeout(() => {
          window.location.reload();
        }, 600);
      }
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<ProfileRow | null>(null);
  const [tarifsTarget, setTarifsTarget] = useState<ProfileRow | null>(null);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { targetUserId: deleteTarget.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Utilisateur ${deleteTarget.username} supprimé`);
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la suppression");
    }
  };

  const isVendeurForm = form.role === "vendeur";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-2xl font-bold">Access</h2>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Créer</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">Utilisateurs</TabsTrigger>
          <TabsTrigger value="vendeur">Vendeurs</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher username, nom, téléphone" className="pl-8 w-72" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {tab === "all" && (
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Rôle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              {ROLES.filter((r) => r !== "vendeur" && r !== "agent" && r !== "livreur").map((r) => (
                <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Nom complet</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Rôle</TableHead>
              {tab === "vendeur" && <TableHead>Compte bancaire</TableHead>}
              <TableHead>Statut</TableHead>
              <TableHead>Créé le</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={tab === "vendeur" ? 8 : 7} className="text-center py-8 text-muted-foreground">Chargement...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={tab === "vendeur" ? 8 : 7} className="text-center py-8 text-muted-foreground">Aucun utilisateur</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.username}</TableCell>
                <TableCell>{r.full_name || "—"}</TableCell>
                <TableCell>{r.phone || "—"}</TableCell>
                <TableCell><span className="capitalize">{r.role}</span></TableCell>
                {tab === "vendeur" && (
                  <TableCell className="text-sm">
                    {r.bank_account_name ? (
                      <div>
                        <div>{r.bank_account_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.bank_account_number || "—"}</div>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                )}
                <TableCell>
                  <span className={r.is_active ? "text-success" : "text-muted-foreground"}>
                    {r.is_active ? "Actif" : "Inactif"}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)} title="Modifier"><Pencil className="h-4 w-4" /></Button>
                  {r.role === "vendeur" && (
                    <Button variant="ghost" size="icon" onClick={() => setTarifsTarget(r)} title="Tarif personnalisé">
                      <Wallet className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => loginAs(r)} disabled={r.id === user?.id} title="Se connecter en tant que">
                    <LogIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleActive(r)} disabled={r.id === user?.id} title={r.is_active ? "Désactiver" : "Activer"}>
                    {r.is_active ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-success" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)} disabled={r.id === user?.id} title="Supprimer">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Username *</Label>
                <Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
              <div>
                <Label>Email {!editing && "*"}</Label>
                <Input required={!editing} disabled={emailLoading} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={emailLoading ? "Chargement..." : ""} />
              </div>
            </div>
            {editing && (
              <div>
                <Label>Mot de passe actuel</Label>
                <Input
                  type="text"
                  readOnly
                  value={form.current_password || "Non défini"}
                  className="font-mono bg-muted/50"
                />
              </div>
            )}
            <div>
              <Label>{editing ? "Nouveau mot de passe" : "Mot de passe *"}</Label>
              <Input
                required={!editing}
                type="password"
                minLength={editing ? undefined : 6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? "Laisser vide pour ne pas changer" : ""}
              />
            </div>
            <div><Label>Nom complet</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>CIN</Label><Input value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value })} /></div>
            </div>
            <div><Label>Ville de Ramassage</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div>
              <Label>Rôle *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isVendeurForm && (
              <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                <div className="text-sm font-medium">Coordonnées bancaires</div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label>Nom de bank</Label>
                    <Input value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Numéro / RIB</Label>
                    <Input className="font-mono" value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch id="is_active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="is_active">Actif</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "..." : editing ? "Enregistrer" : "Créer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'utilisateur <strong>{deleteTarget?.username}</strong> et toutes ses données associées seront supprimés définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!tarifsTarget} onOpenChange={(o) => !o && setTarifsTarget(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tarif personnalisé — {tarifsTarget?.full_name || tarifsTarget?.username}</DialogTitle>
          </DialogHeader>
          {tarifsTarget && (
            <PackManager
              scope="vendeur"
              ownerId={tarifsTarget.id}
              showPickupDimension={false}
              hideDelay
              title="Packs personnalisés du vendeur"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUtilisateurs;
