import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, ChevronDown, Clipboard, Copy, Download, GitBranch, GripVertical, Globe, Layers, Play, Plus, RefreshCw, Save, Settings as SettingsIcon, TestTube, Trash2, Upload, Webhook, Zap } from "lucide-react";
import { toast } from "sonner";

type Json = Record<string, any>;

const db = supabase as any;
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livreur-workflow-runner`;

interface Workflow {
  id: string;
  livreur_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  is_default: boolean;
  triggers: Json[];
  steps: Json[];
  variables: Json;
  settings: Json;
  updated_at: string;
}

const TRIGGER_TYPES = [
  { value: "manual", label: "Manuel", icon: "👆", desc: "Déclenché à la demande" },
  { value: "order_created", label: "Commande créée", icon: "🆕", desc: "Quand une commande est créée" },
  { value: "order_status_changed", label: "Changement de statut", icon: "🔄", desc: "Quand un statut change (ex: → Confirmé)" },
  { value: "order_updated", label: "Commande modifiée", icon: "✏️", desc: "Quand n'importe quel champ change" },
  { value: "schedule", label: "Programmé (date fixe)", icon: "📅", desc: "À une date précise, une seule fois" },
  { value: "recurring", label: "Récurrent (interval)", icon: "♻️", desc: "Toutes les X minutes/heures/jours" },
  { value: "webhook", label: "Webhook entrant", icon: "🪝", desc: "URL appelée par le livreur" },
  { value: "on_pickup_request", label: "Demande de Pickup", icon: "📦", desc: "Quand le vendeur clique 'Envoyer au livreur' (Confirmé → Pickup)" },
];

const STEP_TYPES = [
  { value: "http", label: "HTTP Request", icon: Globe, desc: "Appeler un endpoint REST/JSON" },
  { value: "filter", label: "Filter / IF", icon: GitBranch, desc: "Condition: continuer ou arrêter selon des règles" },
  { value: "extract", label: "Extract fields", icon: Layers, desc: "Extraire des valeurs de la réponse" },
  { value: "set_variable", label: "Set variables", icon: SettingsIcon, desc: "Définir des variables intermédiaires" },
  { value: "validate", label: "Validate", icon: GitBranch, desc: "Valider les données avant de continuer" },
  { value: "update_order", label: "Update order", icon: RefreshCw, desc: "Modifier la commande dans la DB" },
  { value: "log_status", label: "Log status history", icon: Clipboard, desc: "Ajouter une ligne dans l'historique" },
  { value: "delay", label: "Delay (wait)", icon: Zap, desc: "Pause entre 2 étapes" },
];

const STATUSES = ["Crée", "Confirmé", "Pickup", "En transit", "Livré", "Refusé", "Annulé", "Retourné", "Programmé", "Reporté"];

function newId() { return Math.random().toString(36).slice(2, 10); }

function defaultStep(type: string): Json {
  const base: Json = { id: newId(), name: STEP_TYPES.find((t) => t.value === type)?.label || type, type, enabled: true, on_error: "stop", retry: { max_attempts: 1, backoff_ms: 1000 } };
  if (type === "http") base.config = { url: "", method: "POST", headers: {}, body: {}, body_type: "json" };
  if (type === "delay") base.config = { ms: 1000 };
  if (type === "set_variable") base.config = { values: {} };
  if (type === "extract") base.config = { fields: { tracking: "steps.<step_id>.trackingID" } };
  if (type === "validate") base.config = { rules: {} };
  if (type === "update_order") base.config = { updates: {} };
  if (type === "log_status") base.config = { new_status: "Pickup", note: "" };
  if (type === "filter") base.config = { mode: "all", conditions: [{ left: "{{order.status}}", operator: "eq", right: "Confirmé" }], on_false: "stop" };
  return base;
}

function defaultTrigger(type: string): Json {
  const base: Json = { id: newId(), type, enabled: true, name: TRIGGER_TYPES.find((t) => t.value === type)?.label || type };
  if (type === "order_status_changed") { base.from_status = "Confirmé"; base.to_status = "Pickup"; }
  if (type === "schedule") base.scheduled_at = new Date(Date.now() + 3600000).toISOString();
  if (type === "recurring") { base.interval_value = 30; base.interval_unit = "minutes"; }
  return base;
}

const AdminLivreurWorkflows = () => {
  const { livreurId } = useParams<{ livreurId: string }>();
  const navigate = useNavigate();
  const [livreurName, setLivreurName] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testOrderId, setTestOrderId] = useState("");
  const [testResult, setTestResult] = useState<Json | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [curlOpen, setCurlOpen] = useState(false);
  const [curlText, setCurlText] = useState("");
  const [curlTargetStepId, setCurlTargetStepId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<Json[]>([]);
  const [runFilter, setRunFilter] = useState("all");
  const [runSearch, setRunSearch] = useState("");
  const [retention, setRetention] = useState({ enabled: false, hours: 72 });
  const [selectedRun, setSelectedRun] = useState<Json | null>(null);

  const filteredRuns = useMemo(() => recentRuns.filter((r) => {
    if (runFilter === "workflow" && r._legacy) return false;
    if (runFilter === "legacy" && !r._legacy) return false;
    if (runFilter !== "all" && runFilter !== "workflow" && runFilter !== "legacy" && r.trigger_type !== runFilter) return false;
    const n = runSearch.trim().toLowerCase();
    if (!n) return true;
    return [r.order_id, r.trigger_type, r.status, r.error_message, JSON.stringify(r.step_results || {})].some((v) => String(v ?? "").toLowerCase().includes(n));
  }), [recentRuns, runFilter, runSearch]);

  const saveRetention = async () => {
    const hours = Math.max(Number(retention.hours) || 72, 1);
    const { error } = await db.from("app_settings").upsert({ key: "api_logs_retention", value: { enabled: retention.enabled, hours } }, { onConflict: "key" });
    if (error) toast.error(error.message);
    else { toast.success("Cleanup enregistré"); setRetention({ enabled: retention.enabled, hours }); }
  };

  const deleteRun = async (run: Json) => {
    if (!confirm("Supprimer cette exécution ?")) return;
    const table = run._legacy ? "livreur_api_logs" : "livreur_workflow_runs";
    const id = run._legacy ? Number(String(run.id).replace("legacy-", "")) : run.id;
    const { error } = await db.from(table).delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Supprimé"); setSelectedRun(null); loadRuns(); }
  };

  const active = workflows.find((w) => w.id === activeId) || null;

  const load = useCallback(async () => {
    if (!livreurId) return;
    setLoading(true);
    const [{ data: lv }, { data: wfs }] = await Promise.all([
      db.from("profiles").select("full_name, username").eq("id", livreurId).single(),
      db.from("livreur_workflows").select("*").eq("livreur_id", livreurId).order("created_at", { ascending: true }),
    ]);
    setLivreurName(lv?.full_name || lv?.username || livreurId);
    setWorkflows(wfs || []);
    if (!activeId && wfs?.length) setActiveId(wfs[0].id);
    setLoading(false);
  }, [livreurId]);

  const loadRuns = useCallback(async () => {
    if (!activeId || !livreurId) return;
    const [{ data: runs }, { data: logs }] = await Promise.all([
      db.from("livreur_workflow_runs").select("*").eq("workflow_id", activeId).order("started_at", { ascending: false }).limit(20),
      db.from("livreur_api_logs").select("*").eq("livreur_id", livreurId).order("created_at", { ascending: false }).limit(20),
    ]);
    const legacyAsRuns = (logs || []).map((l: any) => ({
      id: `legacy-${l.id}`,
      workflow_id: activeId,
      livreur_id: livreurId,
      order_id: l.order_id,
      trigger_type: l.event_type || "legacy",
      status: l.status === "success" || l.status === "ok" ? "success" : "failed",
      started_at: l.created_at,
      duration_ms: 0,
      step_results: [{ name: l.message || l.event_type, status: l.status, details: l.details }],
      error_message: l.status !== "success" && l.status !== "ok" ? (l.message || null) : null,
      _legacy: true,
    }));
    const merged = [...(runs || []), ...legacyAsRuns]
      .sort((a: any, b: any) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, 40);
    setRecentRuns(merged);
  }, [activeId, livreurId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRuns(); }, [loadRuns]);
  useEffect(() => {
    db.from("app_settings").select("value").eq("key", "api_logs_retention").maybeSingle().then(({ data }: any) => {
      const v = (data?.value ?? {}) as Record<string, unknown>;
      setRetention({ enabled: Boolean(v.enabled), hours: Number(v.hours ?? 72) || 72 });
    });
  }, []);

  const updateActive = (patch: Partial<Workflow>) => {
    if (!active) return;
    setWorkflows((prev) => prev.map((w) => (w.id === active.id ? { ...w, ...patch } : w)));
  };

  const updateStep = (stepId: string, patch: Json) => {
    if (!active) return;
    updateActive({ steps: active.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) });
  };

  const updateTrigger = (tid: string, patch: Json) => {
    if (!active) return;
    updateActive({ triggers: active.triggers.map((t) => (t.id === tid ? { ...t, ...patch } : t)) });
  };

  const createWorkflow = async () => {
    if (!livreurId) return;
    const { data, error } = await db.from("livreur_workflows").insert({
      livreur_id: livreurId,
      name: `Workflow ${workflows.length + 1}`,
      enabled: true,
      triggers: [defaultTrigger("order_status_changed")],
      steps: [],
      variables: {},
    }).select().single();
    if (error) return toast.error(error.message);
    setWorkflows((p) => [...p, data]);
    setActiveId(data.id);
    toast.success("Workflow créé");
  };

  const deleteWorkflow = async (id: string) => {
    if (!confirm("Supprimer ce workflow ?")) return;
    const { error } = await db.from("livreur_workflows").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setWorkflows((p) => p.filter((w) => w.id !== id));
    if (activeId === id) setActiveId(workflows[0]?.id || null);
    toast.success("Supprimé");
  };

  const save = async () => {
    if (!active) return;
    setSaving(true);
    const { error } = await db.from("livreur_workflows").update({
      name: active.name,
      description: active.description,
      enabled: active.enabled,
      is_default: active.is_default,
      triggers: active.triggers,
      steps: active.steps,
      variables: active.variables,
      settings: active.settings,
    }).eq("id", active.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Workflow enregistré");
  };

  const importCurl = async () => {
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ action: "import_curl", curl: curlText }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Parse failed");
      const config = data.config;
      if (curlTargetStepId) {
        updateStep(curlTargetStepId, { config: { url: config.url, method: config.method, headers: config.headers, body: config.body, body_type: config.body_type || "json" } });
      } else if (active) {
        const step = defaultStep("http");
        step.name = `${config.method} ${(config.url || "").slice(0, 30)}`;
        step.config = { url: config.url, method: config.method, headers: config.headers, body: config.body, body_type: config.body_type || "json" };
        updateActive({ steps: [...active.steps, step] });
      }
      setCurlOpen(false);
      setCurlText("");
      setCurlTargetStepId(null);
      toast.success("cURL importé");
    } catch (e: any) { toast.error(e.message); }
  };

  const testWorkflow = async () => {
    if (!active) return;
    setTestRunning(true);
    setTestResult(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "test_workflow", workflow: active, order_id: testOrderId ? Number(testOrderId) : undefined }),
      });
      const data = await res.json();
      setTestResult(data);
      loadRuns();
    } catch (e: any) { toast.error(e.message); } finally { setTestRunning(false); }
  };

  const exportWorkflow = () => {
    if (!active) return;
    const payload = {
      _type: "livreur_workflow",
      _version: 1,
      exported_at: new Date().toISOString(),
      workflow: {
        name: active.name,
        description: active.description,
        enabled: active.enabled,
        is_default: active.is_default,
        triggers: active.triggers,
        steps: active.steps,
        variables: active.variables,
        settings: active.settings,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${active.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Workflow exporté");
  };

  const importWorkflow = async (file: File) => {
    if (!livreurId) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const wf = parsed.workflow || parsed;
      const { data, error } = await db.from("livreur_workflows").insert({
        livreur_id: livreurId,
        name: `${wf.name || "Import"} (copie)`,
        description: wf.description ?? null,
        enabled: wf.enabled ?? true,
        is_default: false,
        triggers: (wf.triggers || []).map((t: Json) => ({ ...t, id: newId() })),
        steps: (wf.steps || []).map((s: Json) => ({ ...s, id: newId() })),
        variables: wf.variables || {},
        settings: wf.settings || {},
      }).select().single();
      if (error) throw error;
      setWorkflows((p) => [...p, data]);
      setActiveId(data.id);
      toast.success("Workflow importé");
    } catch (e: any) { toast.error("Import échoué: " + e.message); }
  };

  if (loading) return <div className="p-8">Chargement...</div>;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {/* Sidebar */}
      <aside className="w-72 border-r bg-card flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/dashboard/administrateur/parametres"); }}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">Workflows de</div>
            <div className="font-semibold truncate">{livreurName}</div>
          </div>
        </div>
        <div className="p-3">
          <Button onClick={createWorkflow} size="sm" className="w-full"><Plus className="h-4 w-4 mr-1" /> Nouveau workflow</Button>
        </div>
        <div className="flex-1 overflow-auto px-2 space-y-1">
          {workflows.map((w) => (
            <button key={w.id} onClick={() => setActiveId(w.id)}
              className={`w-full text-left p-3 rounded-md border ${activeId === w.id ? "bg-accent border-primary" : "hover:bg-muted/50 border-transparent"}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${w.enabled ? "bg-green-500" : "bg-muted-foreground"}`} />
                <span className="font-medium text-sm truncate flex-1">{w.name}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{w.triggers?.length || 0} trigger(s) · {w.steps?.length || 0} étape(s)</div>
            </button>
          ))}
          {!workflows.length && <div className="text-sm text-muted-foreground p-4 text-center">Aucun workflow. Créez-en un.</div>}
        </div>
      </aside>

      {/* Main */}
      {!active ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">Sélectionnez ou créez un workflow</div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b p-4 flex items-center gap-3 bg-card">
            <Input value={active.name} onChange={(e) => updateActive({ name: e.target.value })} className="text-lg font-semibold max-w-md" />
            <div className="flex items-center gap-2">
              <Switch checked={active.enabled} onCheckedChange={(v) => updateActive({ enabled: v })} />
              <span className="text-sm">{active.enabled ? "Activé" : "Désactivé"}</span>
            </div>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => { setCurlTargetStepId(null); setCurlOpen(true); }}><Copy className="h-4 w-4 mr-1" /> Import cURL</Button>
            <Button variant="outline" size="sm" onClick={exportWorkflow}><Download className="h-4 w-4 mr-1" /> Export</Button>
            <label className="inline-flex">
              <Button variant="outline" size="sm" asChild><span className="cursor-pointer"><Upload className="h-4 w-4 mr-1" /> Import</span></Button>
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importWorkflow(f); e.currentTarget.value = ""; }} />
            </label>
            <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}><TestTube className="h-4 w-4 mr-1" /> Tester</Button>
            <Button variant="destructive" size="sm" onClick={() => deleteWorkflow(active.id)}><Trash2 className="h-4 w-4" /></Button>
            <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" /> {saving ? "..." : "Enregistrer"}</Button>
          </div>

          <Tabs defaultValue="builder" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-3 self-start">
              <TabsTrigger value="builder">Builder</TabsTrigger>
              <TabsTrigger value="triggers">Triggers</TabsTrigger>
              <TabsTrigger value="variables">Variables</TabsTrigger>
              <TabsTrigger value="runs">Exécutions ({recentRuns.length})</TabsTrigger>
              <TabsTrigger value="settings">Paramètres</TabsTrigger>
            </TabsList>

            <TabsContent value="builder" className="flex-1 overflow-auto p-4 space-y-3">
              <Textarea value={active.description || ""} onChange={(e) => updateActive({ description: e.target.value })} placeholder="Description du workflow..." className="min-h-16" />
              <OutputDestinationPanel steps={active.steps} />
              <div className="space-y-2">
                {active.steps.map((step, idx) => (
                  <div
                    key={step.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", step.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromId = e.dataTransfer.getData("text/plain");
                      if (!fromId || fromId === step.id) return;
                      const arr = [...active.steps];
                      const fromIdx = arr.findIndex((s) => s.id === fromId);
                      const toIdx = arr.findIndex((s) => s.id === step.id);
                      if (fromIdx < 0 || toIdx < 0) return;
                      const [moved] = arr.splice(fromIdx, 1);
                      arr.splice(toIdx, 0, moved);
                      updateActive({ steps: arr });
                    }}
                  >
                    <StepCard
                      step={step}
                      index={idx}
                      total={active.steps.length}
                      onChange={(p) => updateStep(step.id, p)}
                      onRemove={() => updateActive({ steps: active.steps.filter((s) => s.id !== step.id) })}
                      onMove={(dir) => {
                        const i = active.steps.findIndex((s) => s.id === step.id);
                        const j = i + dir;
                        if (j < 0 || j >= active.steps.length) return;
                        const arr = [...active.steps];
                        [arr[i], arr[j]] = [arr[j], arr[i]];
                        updateActive({ steps: arr });
                      }}
                      onImportCurl={() => { setCurlTargetStepId(step.id); setCurlOpen(true); }}
                    />
                  </div>
                ))}
              </div>
              <AddStepMenu onAdd={(type) => updateActive({ steps: [...active.steps, defaultStep(type)] })} />
            </TabsContent>

            <TabsContent value="triggers" className="flex-1 overflow-auto p-4 space-y-3">
              {(active.triggers || []).map((trg, i) => (
                <TriggerCard key={trg?.id || `trg-${i}`} trigger={trg || {}}
                  onChange={(p) => updateTrigger(trg.id, p)}
                  onRemove={() => updateActive({ triggers: (active.triggers || []).filter((t) => t.id !== trg.id) })}
                />
              ))}
              <AddTriggerMenu onAdd={(type) => updateActive({ triggers: [...(active.triggers || []), defaultTrigger(type)] })} />
            </TabsContent>

            <TabsContent value="variables" className="flex-1 overflow-auto p-4">
              <p className="text-sm text-muted-foreground mb-3">Variables disponibles dans tout le workflow via <code className="bg-muted px-1 rounded">{`{{vars.NAME}}`}</code></p>
              <KeyValueEditor value={active.variables} onChange={(v) => updateActive({ variables: v })} />
              <Card className="p-4 mt-4 text-sm space-y-1">
                <div className="font-semibold mb-2">Variables système accessibles</div>
                <div><code>{`{{order.id}}`}</code> · <code>{`{{order.customer_name}}`}</code> · <code>{`{{order.customer_phone}}`}</code> · <code>{`{{order.order_value}}`}</code> · <code>{`{{order.status}}`}</code></div>
                <div><code>{`{{steps.<step_id>.field}}`}</code> — sortie d'une étape précédente</div>
                <div><code>{`{{vars.NAME}}`}</code> — vos variables</div>
                <div><code>{`{{$now}}`}</code> · <code>{`{{$timestamp}}`}</code> · <code>{`{{$uuid}}`}</code></div>
                <div><code>{`{{$secret.NAME}}`}</code> — secret depuis le coffre</div>
              </Card>
            </TabsContent>

            <TabsContent value="runs" className="flex-1 overflow-auto p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Dernières exécutions ({filteredRuns.length})</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="h-9 w-56" placeholder="Recherche order, status..." value={runSearch} onChange={(e) => setRunSearch(e.target.value)} />
                  <Select value={runFilter} onValueChange={setRunFilter}>
                    <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes</SelectItem>
                      <SelectItem value="workflow">Workflow uniquement</SelectItem>
                      <SelectItem value="legacy">Legacy uniquement</SelectItem>
                      <SelectItem value="create_package">create_package</SelectItem>
                      <SelectItem value="webhook_status">webhook_status</SelectItem>
                      <SelectItem value="polling_status">polling_status</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={loadRuns}><RefreshCw className="h-4 w-4 mr-1" /> Rafraîchir</Button>
                </div>
              </div>
              <Card className="p-3 flex flex-wrap items-center gap-3 bg-muted/30">
                <div className="text-sm font-medium">Nettoyage automatique des logs</div>
                <label className="flex items-center gap-2 text-sm"><Switch checked={retention.enabled} onCheckedChange={(enabled) => setRetention({ ...retention, enabled })} /> Activer</label>
                <div className="flex items-center gap-2"><Input type="number" min={1} className="h-9 w-24" value={retention.hours} onChange={(e) => setRetention({ ...retention, hours: Number(e.target.value) })} /><span className="text-sm text-muted-foreground">heures</span></div>
                <Button variant="outline" size="sm" onClick={saveRetention}>Enregistrer</Button>
              </Card>
              {filteredRuns.map((r) => (
                <div key={r.id} className="relative group">
                  <RunCard run={r} />
                  <Button variant="ghost" size="icon" className="absolute top-2 right-10 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteRun(r); }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {!filteredRuns.length && <div className="text-sm text-muted-foreground text-center p-8">Aucune exécution</div>}
            </TabsContent>


            <TabsContent value="settings" className="flex-1 overflow-auto p-4 space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={active.is_default} onCheckedChange={(v) => updateActive({ is_default: v })} />
                <Label>Workflow par défaut</Label>
              </div>
              <div>
                <Label>Rate limit (requêtes/seconde)</Label>
                <Input type="number" min={0.1} step={0.1} value={(active.settings as any)?.rate_limit_per_second ?? 5}
                  onChange={(e) => updateActive({ settings: { ...active.settings, rate_limit_per_second: Number(e.target.value) } })} />
              </div>
              <div>
                <Label>Timeout par étape (ms)</Label>
                <Input type="number" min={1000} value={(active.settings as any)?.step_timeout_ms ?? 30000}
                  onChange={(e) => updateActive({ settings: { ...active.settings, step_timeout_ms: Number(e.target.value) } })} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Test dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Tester le workflow</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ID de commande (optionnel)</Label>
              <Input value={testOrderId} onChange={(e) => setTestOrderId(e.target.value)} placeholder="Ex: 123 — utilise une vraie commande" />
            </div>
            <Button onClick={testWorkflow} disabled={testRunning}><Play className="h-4 w-4 mr-1" /> {testRunning ? "Exécution..." : "Lancer le test"}</Button>
            {testResult && (
              <div className="space-y-2">
                <div className={`p-3 rounded ${testResult.run?.status === "success" ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
                  {testResult.run?.status === "success" ? "✓ Succès" : `✗ Échec: ${testResult.run?.error_message || testResult.error}`}
                  <span className="ml-2 text-xs opacity-70">{testResult.run?.duration_ms}ms</span>
                </div>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">{JSON.stringify(testResult.run?.step_results || testResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* cURL import */}
      <Dialog open={curlOpen} onOpenChange={setCurlOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Importer une commande cURL</DialogTitle></DialogHeader>
          <Textarea value={curlText} onChange={(e) => setCurlText(e.target.value)} placeholder={`curl -X POST 'https://api.example.com/packages' \\\n  -H 'Authorization: Bearer xxx' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"test"}'`} className="min-h-48 font-mono text-xs" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCurlOpen(false)}>Annuler</Button>
            <Button onClick={importCurl}>Importer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ====== Subcomponents ======

const AddStepMenu = ({ onAdd }: { onAdd: (t: string) => void }) => (
  <div className="border-2 border-dashed rounded-lg p-3">
    <div className="text-xs text-muted-foreground mb-2 text-center">Ajouter une étape</div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {STEP_TYPES.map((s) => {
        const Icon = s.icon;
        return (
          <button key={s.value} onClick={() => onAdd(s.value)} className="flex items-center gap-2 p-2 rounded border hover:bg-accent text-sm">
            <Icon className="h-4 w-4" /> {s.label}
          </button>
        );
      })}
    </div>
  </div>
);

const AddTriggerMenu = ({ onAdd }: { onAdd: (t: string) => void }) => (
  <div className="border-2 border-dashed rounded-lg p-3">
    <div className="text-xs text-muted-foreground mb-2 text-center">Ajouter un trigger</div>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {TRIGGER_TYPES.map((t) => (
        <button key={t.value} onClick={() => onAdd(t.value)} className="flex items-start gap-2 p-3 rounded border hover:bg-accent text-left">
          <span className="text-xl">{t.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{t.label}</div>
            <div className="text-xs text-muted-foreground">{t.desc}</div>
          </div>
        </button>
      ))}
    </div>
  </div>
);

const TriggerCard = ({ trigger, onChange, onRemove }: { trigger: Json; onChange: (p: Json) => void; onRemove: () => void }) => {
  const meta = TRIGGER_TYPES.find((t) => t.value === trigger.type);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">{meta?.icon}</span>
        <Input value={trigger.name || ""} onChange={(e) => onChange({ name: e.target.value })} className="font-semibold flex-1 max-w-sm" />
        <Switch checked={trigger.enabled !== false} onCheckedChange={(v) => onChange({ enabled: v })} />
        <Button variant="ghost" size="icon" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {trigger.type === "order_status_changed" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>De (statut)</Label>
            <Select value={trigger.from_status || "__any__"} onValueChange={(v) => onChange({ from_status: v === "__any__" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__any__">N'importe lequel</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vers (statut)</Label>
            <Select value={trigger.to_status || "__any__"} onValueChange={(v) => onChange({ to_status: v === "__any__" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__any__">N'importe lequel</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}
      {trigger.type === "schedule" && (
        <div>
          <Label>Date d'exécution</Label>
          <Input type="datetime-local" value={trigger.scheduled_at ? new Date(trigger.scheduled_at).toISOString().slice(0, 16) : ""}
            onChange={(e) => onChange({ scheduled_at: new Date(e.target.value).toISOString() })} />
        </div>
      )}
      {trigger.type === "recurring" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Toutes les</Label>
            <Input type="number" min={1} value={trigger.interval_value || 1} onChange={(e) => onChange({ interval_value: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Unité</Label>
            <Select value={trigger.interval_unit || "minutes"} onValueChange={(v) => onChange({ interval_unit: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seconds">Secondes</SelectItem>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Heures</SelectItem>
                <SelectItem value="days">Jours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      {trigger.type === "webhook" && (
        <WebhookTriggerInfo />
      )}
    </Card>
  );
};

const StepCard = ({ step, index, total, onChange, onRemove, onMove, onImportCurl }: { step: Json; index: number; total: number; onChange: (p: Json) => void; onRemove: () => void; onMove: (dir: number) => void; onImportCurl: () => void }) => {
  const [open, setOpen] = useState(true);
  const meta = STEP_TYPES.find((s) => s.value === step.type);
  const Icon = meta?.icon || Globe;
  return (
    <Card className={`overflow-hidden ${step.enabled === false ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 p-3 bg-muted/30 border-b">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
        <Badge variant="outline">{index + 1}</Badge>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <Input value={step.name || ""} onChange={(e) => onChange({ name: e.target.value })} className="font-medium flex-1 max-w-sm h-8" />
        <Badge>{meta?.label}</Badge>
        <Switch checked={step.enabled !== false} onCheckedChange={(v) => onChange({ enabled: v })} />
        <Button variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={index === 0}>↑</Button>
        <Button variant="ghost" size="icon" onClick={() => onMove(1)} disabled={index === total - 1}>↓</Button>
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}><ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} /></Button>
        <Button variant="ghost" size="icon" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {open && (
        <div className="p-4 space-y-3">
          {step.type === "http" && <HttpStepEditor step={step} onChange={onChange} onImportCurl={onImportCurl} />}
          {step.type === "delay" && (
            <div><Label>Durée (ms)</Label><Input type="number" value={step.config?.ms || 1000} onChange={(e) => onChange({ config: { ...step.config, ms: Number(e.target.value) } })} /></div>
          )}
          {step.type === "set_variable" && <KeyValueEditor value={step.config?.values || {}} onChange={(v) => onChange({ config: { ...step.config, values: v } })} />}
          {step.type === "extract" && (
            <div>
              <Label>Champs à extraire (clé → chemin dans contexte)</Label>
              <KeyValueEditor value={step.config?.fields || {}} onChange={(v) => onChange({ config: { ...step.config, fields: v } })} />
            </div>
          )}
          {step.type === "update_order" && (
            <div>
              <Label>Champs à mettre à jour</Label>
              <KeyValueEditor value={step.config?.updates || {}} onChange={(v) => onChange({ config: { ...step.config, updates: v } })} />
            </div>
          )}
          {step.type === "log_status" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nouveau statut</Label>
                <Select value={step.config?.new_status || "Pickup"} onValueChange={(v) => onChange({ config: { ...step.config, new_status: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Note</Label><Input value={step.config?.note || ""} onChange={(e) => onChange({ config: { ...step.config, note: e.target.value } })} /></div>
            </div>
          )}
          {step.type === "validate" && (
            <ValidateRulesEditor step={step} onChange={onChange} />
          )}
          {step.type === "filter" && (
            <FilterStepEditor step={step} onChange={onChange} />
          )}
          {/* Advanced */}
          <details className="border-t pt-3">
            <summary className="text-sm cursor-pointer text-muted-foreground">Avancé (retry, erreurs, condition)</summary>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div><Label>Retry max</Label><Input type="number" min={1} value={step.retry?.max_attempts || 1} onChange={(e) => onChange({ retry: { ...step.retry, max_attempts: Number(e.target.value) } })} /></div>
              <div><Label>Backoff (ms)</Label><Input type="number" min={0} value={step.retry?.backoff_ms || 1000} onChange={(e) => onChange({ retry: { ...step.retry, backoff_ms: Number(e.target.value) } })} /></div>
              <div><Label>En cas d'erreur</Label>
                <Select value={step.on_error || "stop"} onValueChange={(v) => onChange({ on_error: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stop">Arrêter le workflow</SelectItem>
                    <SelectItem value="continue">Continuer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
};

const ValidateRulesEditor = ({ step, onChange }: { step: Json; onChange: (p: Json) => void }) => {
  const rules: Json = step.config?.rules || {};
  const entries = Object.entries(rules);
  const [mode, setMode] = useState<"fields" | "json">("fields");
  const [jsonText, setJsonText] = useState(() => JSON.stringify(rules, null, 2));

  const updateRule = (field: string, patch: Json) => {
    const next = { ...rules, [field]: { ...(rules[field] || {}), ...patch } };
    onChange({ config: { ...step.config, rules: next } });
  };
  const renameField = (oldName: string, newName: string) => {
    if (!newName || newName === oldName) return;
    const next: Json = {};
    for (const [k, v] of Object.entries(rules)) next[k === oldName ? newName : k] = v;
    onChange({ config: { ...step.config, rules: next } });
  };
  const removeField = (field: string) => {
    const next = { ...rules };
    delete next[field];
    onChange({ config: { ...step.config, rules: next } });
  };
  const addField = () => {
    let name = "champ";
    let i = 1;
    while (rules[name]) name = `champ_${++i}`;
    onChange({ config: { ...step.config, rules: { ...rules, [name]: { required: true } } } });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Règles de validation</Label>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant={mode === "fields" ? "default" : "outline"} onClick={() => setMode("fields")}>Champs</Button>
          <Button type="button" size="sm" variant={mode === "json" ? "default" : "outline"} onClick={() => { setJsonText(JSON.stringify(rules, null, 2)); setMode("json"); }}>JSON</Button>
        </div>
      </div>
      {mode === "fields" ? (
        <div className="space-y-2">
          {entries.length === 0 && <div className="text-xs text-muted-foreground">Aucune règle. Ajoutez un champ ci-dessous.</div>}
          {entries.map(([field, rule]: [string, any]) => (
            <div key={field} className="border rounded-md p-2 space-y-2 bg-muted/30">
              <div className="flex items-center gap-2">
                <Input className="flex-1 font-mono text-xs" defaultValue={field} onBlur={(e) => renameField(field, e.target.value.trim())} placeholder="customer_phone" />
                <Button type="button" size="sm" variant="ghost" onClick={() => removeField(field)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={!!rule?.required} onCheckedChange={(v) => updateRule(field, { required: v })} />
                  Obligatoire
                </label>
                <Input type="number" placeholder="min_length" value={rule?.min_length ?? ""} onChange={(e) => updateRule(field, { min_length: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </div>
              <Input className="font-mono text-xs" placeholder="Regex (ex: ^[0-9]{10}$)" value={rule?.regex ?? ""} onChange={(e) => updateRule(field, { regex: e.target.value || undefined })} />
              <Input className="text-xs" placeholder="Message d'erreur (optionnel)" value={rule?.message ?? ""} onChange={(e) => updateRule(field, { message: e.target.value || undefined })} />
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={addField}><Plus className="h-4 w-4 mr-1" /> Ajouter un champ</Button>
        </div>
      ) : (
        <Textarea
          className="font-mono text-xs"
          rows={8}
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            try { onChange({ config: { ...step.config, rules: JSON.parse(e.target.value) } }); } catch {}
          }}
        />
      )}
      <div className="text-xs text-muted-foreground">Champ = chemin (ex: <code>customer_phone</code> ou <code>order.customer_phone</code>).</div>
    </div>
  );
};

const OPERATORS = [
  { value: "eq", label: "= égal" },
  { value: "neq", label: "≠ différent" },
  { value: "gt", label: "> supérieur" },
  { value: "gte", label: "≥ supérieur ou égal" },
  { value: "lt", label: "< inférieur" },
  { value: "lte", label: "≤ inférieur ou égal" },
  { value: "contains", label: "contient" },
  { value: "starts_with", label: "commence par" },
  { value: "exists", label: "existe (non vide)" },
  { value: "is_empty", label: "est vide" },
  { value: "regex", label: "regex" },
];

const FilterStepEditor = ({ step, onChange }: { step: Json; onChange: (p: Json) => void }) => {
  const config = step.config || {};
  const conditions: Json[] = config.conditions || [];
  const updateCond = (i: number, patch: Json) => {
    const next = conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    onChange({ config: { ...config, conditions: next } });
  };
  const removeCond = (i: number) => onChange({ config: { ...config, conditions: conditions.filter((_, idx) => idx !== i) } });
  const addCond = () => onChange({ config: { ...config, conditions: [...conditions, { left: "", operator: "eq", right: "" }] } });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Label>Combinaison</Label>
        <Select value={config.mode || "all"} onValueChange={(v) => onChange({ config: { ...config, mode: v } })}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ET (toutes vraies)</SelectItem>
            <SelectItem value="any">OU (au moins une)</SelectItem>
          </SelectContent>
        </Select>
        <Label>Si faux</Label>
        <Select value={config.on_false || "stop"} onValueChange={(v) => onChange({ config: { ...config, on_false: v } })}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="stop">Arrêter le workflow (succès)</SelectItem>
            <SelectItem value="skip_rest">Sauter les étapes suivantes</SelectItem>
            <SelectItem value="fail">Échouer le workflow</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        {conditions.map((c, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center border rounded p-2 bg-muted/30">
            <Input className="col-span-4 font-mono text-xs" placeholder="{{order.status}}" value={c.left ?? ""} onChange={(e) => updateCond(i, { left: e.target.value })} />
            <Select value={c.operator || "eq"} onValueChange={(v) => updateCond(i, { operator: v })}>
              <SelectTrigger className="col-span-3 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="col-span-4 font-mono text-xs" placeholder="Confirmé" value={c.right ?? ""} onChange={(e) => updateCond(i, { right: e.target.value })} disabled={c.operator === "exists" || c.operator === "is_empty"} />
            <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeCond(i)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addCond}><Plus className="h-3 w-3 mr-1" /> Ajouter condition</Button>
      </div>
      <div className="text-xs text-muted-foreground">Astuce: utilisez <code>{`{{order.field}}`}</code>, <code>{`{{steps.<id>.x}}`}</code>, <code>{`{{vars.x}}`}</code>.</div>
    </div>
  );
};


  const config = step.config || {};
  const [bodyText, setBodyText] = useState(() => typeof config.body === "string" ? config.body : JSON.stringify(config.body || {}, null, 2));
  const [bodyMode, setBodyMode] = useState<"fields" | "json">(() => (config.body && typeof config.body === "object" && !Array.isArray(config.body)) ? "fields" : "json");

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Select value={config.method || "POST"} onValueChange={(v) => onChange({ config: { ...config, method: v } })}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Input className="flex-1 font-mono text-sm" value={config.url || ""} onChange={(e) => onChange({ config: { ...config, url: e.target.value } })} placeholder="https://api.example.com/endpoint" />
        <Button variant="outline" size="sm" onClick={onImportCurl}><Copy className="h-4 w-4 mr-1" /> cURL</Button>
      </div>
      <div>
        <Label>Headers</Label>
        <KeyValueEditor value={config.headers || {}} onChange={(v) => onChange({ config: { ...config, headers: v } })} placeholderK="Authorization" placeholderV="Bearer {{vars.token}}" />
      </div>
      {config.method !== "GET" && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>Body (supports {`{{order.field}}`})</Label>
            <div className="flex gap-1">
              <Button type="button" variant={bodyMode === "fields" ? "default" : "outline"} size="sm" onClick={() => {
                if (typeof config.body === "string") {
                  try { const p = JSON.parse(config.body); onChange({ config: { ...config, body: p, body_type: "json" } }); } catch {}
                }
                setBodyMode("fields");
              }}>Champs</Button>
              <Button type="button" variant={bodyMode === "json" ? "default" : "outline"} size="sm" onClick={() => {
                setBodyText(typeof config.body === "string" ? config.body : JSON.stringify(config.body || {}, null, 2));
                setBodyMode("json");
              }}>JSON</Button>
            </div>
          </div>
          {bodyMode === "fields" && config.body && typeof config.body === "object" && !Array.isArray(config.body) ? (
            <KeyValueEditor
              value={config.body as Json}
              onChange={(v) => onChange({ config: { ...config, body: v, body_type: "json" } })}
              placeholderK="champ"
              placeholderV="valeur ou {{order.customer_name}}"
            />
          ) : (
            <Textarea className="font-mono text-xs min-h-32" value={bodyText} onChange={(e) => {
              setBodyText(e.target.value);
              try { onChange({ config: { ...config, body: JSON.parse(e.target.value), body_type: "json" } }); }
              catch { onChange({ config: { ...config, body: e.target.value, body_type: "raw" } }); }
            }} />
          )}
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <Switch checked={!!config.continue_on_error} onCheckedChange={(v) => onChange({ config: { ...config, continue_on_error: v } })} />
        <span>Continuer même si HTTP non-2xx</span>
      </div>
    </div>
  );
};

const KeyValueEditor = ({ value, onChange, placeholderK, placeholderV }: { value: Json; onChange: (v: Json) => void; placeholderK?: string; placeholderV?: string }) => {
  const entries = Object.entries(value || {});
  return (
    <div className="space-y-2">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <Input className="flex-1 font-mono text-xs" defaultValue={k} placeholder={placeholderK || "clé"}
            onBlur={(e) => {
              const nk = e.target.value;
              const next: Json = {};
              entries.forEach(([key, val], idx) => { next[idx === i ? nk : key] = val; });
              onChange(next);
            }} />
          <Input className="flex-1 font-mono text-xs" value={typeof v === "string" ? v : JSON.stringify(v)} placeholder={placeholderV || "valeur ou {{var}}"}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
          <Button variant="ghost" size="icon" onClick={() => { const n = { ...value }; delete n[k]; onChange(n); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange({ ...value, [`key_${entries.length + 1}`]: "" })}><Plus className="h-3 w-3 mr-1" /> Ajouter</Button>
    </div>
  );
};

const RunCard = ({ run }: { run: Json }) => {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button className="w-full flex items-center gap-3 p-3 text-left" onClick={() => setOpen(!open)}>
        <span className={`h-2 w-2 rounded-full ${run.status === "success" ? "bg-green-500" : "bg-destructive"}`} />
        <span className="font-medium text-sm">{run.trigger_type}</span>
        {run.order_id && <Badge variant="outline">#{run.order_id}</Badge>}
        {run._legacy && <Badge variant="secondary" className="text-[10px]">legacy</Badge>}
        <span className="text-xs text-muted-foreground flex-1">{new Date(run.started_at).toLocaleString()}</span>
        <span className="text-xs text-muted-foreground">{run.duration_ms}ms</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-3 border-t bg-muted/30">
          {run.error_message && <div className="text-destructive text-sm mb-2">{run.error_message}</div>}
          <pre className="text-xs overflow-auto max-h-64">{JSON.stringify(run.step_results, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
};

const WebhookTriggerInfo = () => {
  const { livreurId } = useParams<{ livreurId: string }>();
  const [token, setToken] = useState<string>("");
  useEffect(() => {
    if (!livreurId) return;
    db.from("profiles").select("api_token").eq("id", livreurId).maybeSingle().then(({ data }: any) => setToken(data?.api_token || ""));
  }, [livreurId]);
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livreur-workflow-runner/webhook/${livreurId}`;
  const curl = `curl -X POST '${url}' \\\n  -H 'Authorization: Bearer ${token || "<API_TOKEN>"}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"trackingID":"...","status":"DELIVERED"}'`;
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Le livreur appelle cette URL pour déclencher le workflow. Le payload reçu est disponible via <code className="bg-muted px-1 rounded">{`{{webhook.field}}`}</code>.</div>
      <div className="text-sm bg-muted p-2 rounded font-mono break-all flex items-start gap-2">
        <span className="flex-1">{url}</span>
        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copié"); }}><Copy className="h-3 w-3" /></Button>
      </div>
      <div>
        <Label className="text-xs">Token Bearer requis</Label>
        <div className="text-sm bg-muted p-2 rounded font-mono break-all flex items-center gap-2">
          <span className="flex-1">{token || "(api_token vide — configurez-le dans le profil livreur)"}</span>
          {token && <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(token); toast.success("Copié"); }}><Copy className="h-3 w-3" /></Button>}
        </div>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Exemple cURL</summary>
        <pre className="bg-muted p-2 rounded mt-1 overflow-auto text-xs">{curl}</pre>
      </details>
    </div>
  );
};

const OutputDestinationPanel = ({ steps }: { steps: Json[] }) => {
  const destinations: { label: string; detail: string; tone: string }[] = [];
  for (const s of steps || []) {
    if (s.enabled === false) continue;
    if (s.type === "update_order") {
      const fields = Object.keys(s.config?.updates || {}).join(", ") || "(aucun champ)";
      destinations.push({ label: "Ligne principale (table orders)", detail: `Étape « ${s.name} » → met à jour : ${fields}`, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" });
      if (s.config?.updates?.status) {
        destinations.push({ label: "Statut courant + badge", detail: `Nouveau statut : ${s.config.updates.status}`, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" });
      }
    }
    if (s.type === "log_status") {
      destinations.push({ label: "Chronologie d'activité (order_status_history)", detail: `Nouvelle ligne : ${s.config?.new_status || "?"} — ${s.config?.note || "(sans note)"}`, tone: "bg-purple-500/10 text-purple-700 dark:text-purple-300" });
    }
    if (s.type === "http") {
      destinations.push({ label: "Logs d'exécution (onglet Exécutions)", detail: `${s.config?.method || "POST"} ${s.config?.url || ""} — réponse visible dans l'historique`, tone: "bg-muted text-foreground" });
    }
    if (s.type === "set_variable" || s.type === "extract") {
      destinations.push({ label: "Variables internes (mémoire workflow)", detail: `Étape « ${s.name} » — réutilisable via {{steps.${s.id}.x}} dans les étapes suivantes`, tone: "bg-muted text-muted-foreground" });
    }
    if (s.type === "validate" || s.type === "delay") {
      destinations.push({ label: "Aucune sortie persistée", detail: `Étape « ${s.name} » — uniquement contrôle de flux`, tone: "bg-muted text-muted-foreground" });
    }
  }
  if (!destinations.length) {
    return (
      <Card className="p-3 text-sm text-muted-foreground">
        Aucun effet de bord. Ajoutez une étape <strong>Update order</strong>, <strong>Log status</strong> ou <strong>HTTP</strong> pour produire un résultat visible.
      </Card>
    );
  }
  return (
    <Card className="p-3 space-y-2">
      <div className="text-sm font-semibold flex items-center gap-2">📍 Où apparaîtra le résultat</div>
      <div className="space-y-1">
        {destinations.map((d, i) => (
          <div key={i} className={`text-xs p-2 rounded ${d.tone}`}>
            <div className="font-medium">{d.label}</div>
            <div className="opacity-80">{d.detail}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default AdminLivreurWorkflows;
