import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/Logo";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const Signup = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [form, setForm] = useState({
    username: "", email: "", password: "",
    full_name: "", phone: "", cin: "", city: "", affiliation_code: "",
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      toast.error("Vous devez accepter les conditions générales.");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setLoading(true);
    try {
      // Pre-check username availability
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", form.username.trim().toLowerCase())
        .maybeSingle();
      if (existing) {
        toast.error("Ce nom d'utilisateur est déjà pris.");
        setLoading(false);
        return;
      }

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            username: form.username.trim().toLowerCase(),
            full_name: form.full_name,
            phone: form.phone,
            cin: form.cin,
            city: form.city,
            affiliation_code: form.affiliation_code || null,
            role: "vendeur",
          },
        },
      });

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      // Sync plain password (only works if a session was created by signUp)
      const newUserId = signUpData.user?.id;
      if (newUserId && signUpData.session) {
        const { error: ppErr } = await supabase.functions.invoke("upsert-plain-password", {
          body: { userId: newUserId, password: form.password },
        });
        if (ppErr) console.error("Failed to store plain password", ppErr);
      }

      toast.success("Compte créé !", { description: "Vous pouvez maintenant vous connecter." });
      // Sign out any auto-session and redirect to login (per spec)
      await supabase.auth.signOut();
      navigate("/login");
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur d'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-mesh p-4 py-10">
      <div className="w-full max-w-lg">
        <Link to="/" className="flex justify-center mb-8">
          <Logo showTagline />
        </Link>
        <Card className="shadow-elegant border-border/60">
          <CardContent className="p-8">
            <h1 className="text-2xl font-extrabold mb-1">Créer un compte vendeur</h1>
            <p className="text-sm text-muted-foreground mb-6">Inscription gratuite. Activation immédiate.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="username">Nom d'utilisateur *</Label>
                  <Input id="username" value={form.username} onChange={(e) => update("username", e.target.value)} required className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label htmlFor="password">Mot de passe *</Label>
                <Input id="password" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={6} className="mt-1.5" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name">Nom complet *</Label>
                  <Input id="full_name" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} required className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="phone">Téléphone *</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} required className="mt-1.5" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cin">CIN *</Label>
                  <Input id="cin" value={form.cin} onChange={(e) => update("cin", e.target.value)} required className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="aff">Code d'affiliation</Label>
                  <Input id="aff" value={form.affiliation_code} onChange={(e) => update("affiliation_code", e.target.value)} className="mt-1.5" />
                </div>
              </div>
              <div className="flex items-start gap-2 pt-2">
                <Checkbox id="terms" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
                <Label htmlFor="terms" className="text-sm font-normal leading-snug">
                  J'accepte les <Link to="/terms" className="text-primary underline">conditions générales</Link> de ODiT.
                </Label>
              </div>

              <Button type="submit" disabled={loading} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer mon compte"}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Déjà un compte ? <Link to="/login" className="text-primary hover:underline">Se connecter</Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
