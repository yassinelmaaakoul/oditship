import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const LivreurDocApi = () => {
  const { profile, user } = useAuth();
  const [show, setShow] = useState(false);
  const apiEnabled = profile?.api_enabled;
  const token = profile?.api_token as string | null;
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/livreur-workflow-runner/webhook/${user?.id ?? ""}`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copié`);
  };

  const masked = (t: string | null) => t ? `${t.slice(0, 6)}${"•".repeat(20)}${t.slice(-4)}` : "—";

  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-2xl font-bold">Documentation API</h2>

      {!apiEnabled && (
        <Card className="border-warning bg-warning/5">
          <CardContent className="p-4 flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong>API non activée.</strong> Contactez l'administrateur pour activer l'accès API à votre compte.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Token API</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input readOnly className="font-mono text-xs" value={show ? (token || "—") : masked(token)} />
            <Button variant="ghost" size="icon" onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
            <Button variant="outline" size="sm" onClick={() => token && copy(token, "Token")}><Copy className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Webhook URL</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input readOnly className="font-mono text-xs" value={webhookUrl} />
            <Button variant="outline" size="sm" onClick={() => copy(webhookUrl, "URL")}><Copy className="h-4 w-4" /></Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Authentifiez-vous avec votre Token API en tant que <code>Bearer</code>. Les notifications déclenchent les workflows configurés.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LivreurDocApi;
