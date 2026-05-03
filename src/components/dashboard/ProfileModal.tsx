import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export const ProfileModal = ({ open, onOpenChange }: Props) => {
  const { user, profile, role, refresh } = useAuth();
  const isVendeur = role === "vendeur";
  const [form, setForm] = useState({ username: "", full_name: "", phone: "", city: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        username: profile?.username ?? "",
        full_name: profile?.full_name ?? "",
        phone: profile?.phone ?? "",
        city: profile?.city ?? "",
        email: user?.email ?? "",
        password: "",
      });
    }
  }, [open, profile, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !user) return;
    const newUsername = form.username.trim().toLowerCase();
    if (!newUsername) {
      toast.error("Le nom d'utilisateur est requis");
      return;
    }
    setSubmitting(true);
    try {
      const updates: { full_name: string | null; phone: string | null; username?: string } = {
        full_name: form.full_name || null,
        phone: form.phone || null,
      };
      if (newUsername !== profile?.username) updates.username = newUsername;
      const { error: pErr } = await supabase.from("profiles").update(updates).eq("id", user.id);
      if (pErr) throw pErr;

      const authUpdates: Record<string, string> = {};
      if (form.email && form.email !== user.email) authUpdates.email = form.email;
      if (form.password) authUpdates.password = form.password;
      if (Object.keys(authUpdates).length > 0) {
        const { error: aErr } = await supabase.auth.updateUser(authUpdates);
        if (aErr) throw aErr;
      }
      if (form.password) {
        const { error: ppErr } = await supabase.functions.invoke("upsert-plain-password", {
          body: { userId: user.id, password: form.password },
        });
        if (ppErr) console.error("Failed to sync plain password", ppErr);
      }
      toast.success("Profil mis à jour");
      await refresh();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Mon profil</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Nom d'utilisateur</Label>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoComplete="username"
            />
          </div>
          <div>
            <Label>Nom complet</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Nouveau mot de passe (optionnel)</Label>
            <Input type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Laisser vide pour ne pas changer" />
          </div>

          {isVendeur && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="text-sm font-semibold text-muted-foreground">Informations bancaires (lecture seule)</div>
                <div>
                  <Label>Nom de bank</Label>
                  <Input readOnly value={profile?.bank_account_name || "—"} className="bg-muted" />
                </div>
                <div>
                  <Label>Numéro de compte</Label>
                  <Input readOnly value={profile?.bank_account_number || "—"} className="bg-muted font-mono" />
                </div>
                <p className="text-xs text-muted-foreground">Ces champs sont gérés par l'administrateur.</p>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "..." : "Enregistrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
