import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const uname = username.trim().toLowerCase();

      const isEmail = uname.includes("@");
      let emailRow: string | null = isEmail ? uname : null;
      let eErr: unknown = null;

      if (!isEmail) {
        const result = await (supabase.rpc as any)("get_user_email_by_username", { _username: uname });
        emailRow = result.data;
        eErr = result.error;
      }

      if (eErr) {
        console.error("[Login] RPC error:", eErr);
        toast.error("Erreur", { description: "Impossible de récupérer l'email associé." });
        setLoading(false);
        return;
      }
      if (!emailRow) {
        toast.error("Identifiants invalides", { description: "Nom d'utilisateur introuvable." });
        setLoading(false);
        return;
      }

      const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({
        email: String(emailRow),
        password,
      });
      if (signErr) {
        console.error("[Login] signIn error:", signErr);
        toast.error("Identifiants invalides", { description: signErr.message });
        setLoading(false);
        return;
      }

      // Check if account is active
      if (signData.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("is_active")
          .eq("id", signData.user.id)
          .maybeSingle();
        if (prof && prof.is_active === false) {
          await supabase.auth.signOut();
          toast.error("Compte désactivé", {
            description: "Votre compte a été désactivé. Veuillez contacter le support.",
          });
          setLoading(false);
          return;
        }
      }

      const from = (location.state as any)?.from?.pathname || "/dashboard";
      toast.success("Connexion réussie");
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error("[Login] unexpected:", err);
      toast.error("Erreur", { description: err?.message ?? "Une erreur est survenue." });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotSubmitting) return;
    setForgotSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) toast.error(error.message);
      else {
        toast.success("Email envoyé", { description: "Vérifiez votre boîte de réception." });
        setForgotOpen(false);
      }
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-mesh p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex justify-center mb-8">
          <Logo showTagline />
        </Link>
        <Card className="shadow-elegant border-border/60">
          <CardContent className="p-8">
            <h1 className="text-2xl font-extrabold mb-1">Connexion</h1>
            <p className="text-sm text-muted-foreground mb-6">Accédez à votre espace ODiT.</p>

            {!forgotOpen ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="username">Nom d'utilisateur</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" className="mt-1.5" />
                </div>
                <div>
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="mt-1.5" />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button type="button" onClick={() => setForgotOpen(true)} className="text-primary hover:underline">
                    Mot de passe oublié ?
                  </button>
                  <Link to="/signup" className="text-muted-foreground hover:text-foreground">
                    Créer un compte
                  </Link>
                </div>
              </form>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <Label htmlFor="femail">Votre email</Label>
                  <Input id="femail" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required className="mt-1.5" />
                </div>
                <Button type="submit" disabled={forgotSubmitting} className="w-full">
                  {forgotSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer le lien"}
                </Button>
                <button type="button" onClick={() => setForgotOpen(false)} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
                  Retour à la connexion
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
