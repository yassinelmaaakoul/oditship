import { ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Clock, Eye, EyeOff, HelpCircle, PackageCheck, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";

interface Livreur { id: string; username: string; full_name: string | null; api_enabled: boolean; api_token: string | null; authentication_config?: Record<string, unknown> | null; create_package_config?: Record<string, unknown> | null; }
interface Hub { id: number; name: string; }
interface HubLivreur { hub_id: number; livreur_id: string; }
interface LivreurApiSettings {
  livreur_id: string;
  create_package_url: string | null;
  create_package_method: string;
  create_package_headers: Record<string, string>;
  create_package_mapping: Record<string, string>;
  auth_config: Record<string, unknown>;
  api_operations: Array<Record<string, unknown>>;
  validation_rules: Record<string, unknown>;
  status_mapping: Record<string, string>;
  polling_status_mapping: Record<string, string>;
  webhook_updates_current_status: boolean;
  webhook_enabled: boolean;
  webhook_status_field: string;
  webhook_tracking_field: string;
  webhook_driver_name_field: string;
  webhook_driver_phone_field: string;
  webhook_note_field: string;
  webhook_reported_date_field: string;
  webhook_scheduled_date_field: string;
  webhook_extra_fields_mapping: Record<string, string>;
  polling_enabled: boolean;
  polling_interval_minutes: number;
  polling_status_url: string | null;
  polling_status_method: string;
  polling_status_headers: Record<string, string>;
  polling_status_payload_mapping: Record<string, string>;
  polling_tracking_field: string;
  polling_status_field: string;
  polling_message_field: string;
  polling_reported_date_field: string;
  polling_scheduled_date_field: string;
  rate_limit_per_second: number;
  is_active: boolean;
}

const db = supabase as any;
const functionsBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const defaultSettings = (livreurId: string): LivreurApiSettings => ({
  livreur_id: livreurId,
  create_package_url: "",
  create_package_method: "POST",
  create_package_headers: {},
  create_package_mapping: {
    price: "order_value",
    description: "product_name",
    name: "product_name",
    comment: "comment",
    orderId: "id",
    partnerTrackingID: "partner_tracking_id",
    "destination.name": "customer_name",
    "destination.phone": "customer_phone",
    "destination.city": "customer_city",
    "destination.streetAddress": "customer_address",
  },
  auth_config: {
    type: "none",
    url: "",
    method: "POST",
    headers: {},
    payload_mapping: {},
    response_token_path: "token",
    token_header: "Authorization",
    token_prefix: "Bearer ",
    expires_in_path: "expiresIn",
  },
  api_operations: [],
  validation_rules: {
    product_name: { min_alnum: 3 },
    customer_name: { min_length: 2 },
    customer_address: { min_length: 2 },
    customer_phone: { digits: 10 },
    order_value: { min: 1 },
  },
  status_mapping: {
    DELIVERED: "Livré",
    CANCELED: "Annulé",
    REFUSED: "Refusé",
    RETURNED: "Retourné",
    IN_TRANSIT: "En transit",
    PICKUP: "Pickup",
    CONFIRMED: "Confirmé",
  },
  polling_status_mapping: {
    delivered: "Livré",
    canceled: "Annulé",
    deleted: "Annulé",
    refused: "Refusé",
    returned: "Retourné",
    transit: "Transit",
    reported: "Reporté",
    scheduled: "Programmé",
  },
  webhook_updates_current_status: true,
  webhook_enabled: false,
  webhook_status_field: "status",
  webhook_tracking_field: "trackingID",
  webhook_driver_name_field: "transport.currentDriverName",
  webhook_driver_phone_field: "transport.currentDriverPhone",
  webhook_note_field: "note",
  webhook_reported_date_field: "reportedDate",
  webhook_scheduled_date_field: "scheduledDate",
  webhook_extra_fields_mapping: {},
  polling_enabled: false,
  polling_interval_minutes: 15,
  polling_status_url: "",
  polling_status_method: "GET",
  polling_status_headers: {},
  polling_status_payload_mapping: {},
  polling_tracking_field: "trackingID",
  polling_status_field: "status",
  polling_message_field: "message",
  polling_reported_date_field: "reportedDate",
  polling_scheduled_date_field: "scheduledDate",
  rate_limit_per_second: 5,
  is_active: true,
});

const generateToken = () => {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const formatJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const toPrimitive = (value: string) => {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
};

const safeRecord = (value: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, typeof item === "object" && item !== null ? JSON.stringify(item) : String(item ?? "")]));
  } catch {
    return {};
  }
};

const safeObject = (value: string): Record<string, any> => {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
};

const safeArray = (value: string): Array<Record<string, any>> => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch {
    return [];
  }
};

const parseJson = (label: string, value: string) => {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label}: invalid JSON`);
  }
};
const parseJsonArray = (label: string, value: string) => {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label}: invalid JSON array`);
  }
};

const maskSensitiveValue = (key: string, value: unknown) => {
  const name = key.toLowerCase();
  if (name.includes("authorization") || name.includes("token") || name.includes("secret") || name.includes("key")) {
    const text = String(value ?? "");
    return text ? `${text.slice(0, 8)}••••${text.slice(-4)}` : "••••";
  }
  return value;
};

const maskSensitiveHeaders = (headers: Record<string, unknown> = {}) =>
  Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, maskSensitiveValue(key, value)]));

const FieldHelp = ({ children }: { children: string }) => (
  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
);

const SectionHeader = ({ icon: Icon, title, description, children }: { icon: typeof PackageCheck; title: string; description: string; children?: ReactNode }) => (
  <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h3 className="font-semibold leading-none">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
    {children}
  </div>
);

const KeyValueEditor = ({ label, help, value, onChange, keyPlaceholder = "Key", valuePlaceholder = "Value", primitiveValues = false }: { label: string; help: string; value: string; onChange: (value: string) => void; keyPlaceholder?: string; valuePlaceholder?: string; primitiveValues?: boolean }) => {
  const [pairs, setPairs] = useState<Array<[string, string]>>(() => Object.entries(safeRecord(value)));
  useEffect(() => { setPairs(Object.entries(safeRecord(value))); }, [value]);
  const emit = (nextPairs: Array<[string, string]>) => onChange(JSON.stringify(Object.fromEntries(nextPairs.filter(([key]) => key.trim()).map(([key, item]) => [key.trim(), primitiveValues ? toPrimitive(item) : item])), null, 2));
  const updatePairs = (nextPairs: Array<[string, string]>) => { setPairs(nextPairs); emit(nextPairs); };

  return (
    <div className="space-y-2">
      <div>
        <Label>{label}</Label>
        <FieldHelp>{help}</FieldHelp>
      </div>
      <div className="space-y-2">
        {(pairs.length ? pairs : [["", ""]]).map(([key, item], index) => (
          <div key={`${key}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px]">
            <Input value={key} placeholder={keyPlaceholder} onChange={(e) => updatePairs((pairs.length ? pairs : [["", ""] as [string, string]]).map((pair, i): [string, string] => i === index ? [e.target.value, pair[1]] : pair))} />
            <Input value={item} placeholder={valuePlaceholder} onChange={(e) => updatePairs((pairs.length ? pairs : [["", ""] as [string, string]]).map((pair, i): [string, string] => i === index ? [pair[0], e.target.value] : pair))} />
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => updatePairs(pairs.filter((_, i) => i !== index))} disabled={!pairs.length}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => updatePairs([...pairs, ["", ""]])}>
        <Plus className="mr-1 h-4 w-4" /> Add row
      </Button>
    </div>
  );
};

// All known order/system fields available for mapping.
const SYSTEM_ORDER_FIELDS: string[] = [
  "id", "tracking_number", "external_tracking_number", "partner_tracking_id", "barcode",
  "customer_name", "customer_phone", "customer_address", "customer_city",
  "product_name", "order_value", "comment", "open_package",
  "status", "status_note", "return_note",
  "scheduled_date", "postponed_date", "delivered_at",
  "vendeur_id", "agent_id", "assigned_livreur_id", "hub_id",
  "qr_code", "created_at", "updated_at",
];

// Recursively collect all paths from a JSON object (dot.notation).
const collectPaths = (obj: any, prefix = "", out: Set<string> = new Set(), depth = 0): Set<string> => {
  if (depth > 6 || obj === null || obj === undefined) return out;
  if (typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out.add(prefix);
    return out;
  }
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.add(next);
      collectPaths(value, next, out, depth + 1);
    } else {
      out.add(next);
    }
  }
  return out;
};

// Smart mapping editor: dropdowns for both columns + free-text fallback.
const SmartMappingEditor = ({
  label, help, value, onChange,
  keyOptions, valueOptions,
  keyPlaceholder = "Provider field", valuePlaceholder = "Order field",
}: {
  label: string; help: string; value: string; onChange: (value: string) => void;
  keyOptions: string[]; valueOptions: string[];
  keyPlaceholder?: string; valuePlaceholder?: string;
}) => {
  const [pairs, setPairs] = useState<Array<[string, string]>>(() => Object.entries(safeRecord(value)));
  const [keyModes, setKeyModes] = useState<Record<number, "select" | "custom">>({});
  const [valueModes, setValueModes] = useState<Record<number, "select" | "custom">>({});

  useEffect(() => { setPairs(Object.entries(safeRecord(value))); }, [value]);

  const emit = (nextPairs: Array<[string, string]>) =>
    onChange(JSON.stringify(
      Object.fromEntries(nextPairs.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v])),
      null, 2,
    ));
  const updatePairs = (nextPairs: Array<[string, string]>) => { setPairs(nextPairs); emit(nextPairs); };

  const renderField = (
    val: string, opts: string[], mode: "select" | "custom" | undefined,
    setMode: (m: "select" | "custom") => void, onValChange: (v: string) => void,
    placeholder: string,
  ) => {
    const effectiveMode = mode ?? (val && !opts.includes(val) ? "custom" : "select");
    if (effectiveMode === "custom") {
      return (
        <div className="flex gap-1">
          <Input value={val} placeholder={placeholder} onChange={(e) => onValChange(e.target.value)} />
          <Button type="button" variant="ghost" size="sm" className="px-2" title="Use list" onClick={() => setMode("select")}>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      );
    }
    return (
      <Select value={opts.includes(val) ? val : ""} onValueChange={(v) => { if (v === "__custom__") setMode("custom"); else onValChange(v); }}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent className="max-h-72">
          {opts.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No suggestions yet</div>}
          {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          <SelectItem value="__custom__">✎ Custom value...</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const rows = pairs.length ? pairs : [["", ""] as [string, string]];

  return (
    <div className="space-y-2">
      <div>
        <Label>{label}</Label>
        <FieldHelp>{help}</FieldHelp>
      </div>
      <div className="space-y-2">
        {rows.map(([key, item], index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px]">
            {renderField(
              key, keyOptions, keyModes[index],
              (m) => setKeyModes({ ...keyModes, [index]: m }),
              (v) => updatePairs(rows.map((pair, i): [string, string] => i === index ? [v, pair[1]] : pair)),
              keyPlaceholder,
            )}
            {renderField(
              item, valueOptions, valueModes[index],
              (m) => setValueModes({ ...valueModes, [index]: m }),
              (v) => updatePairs(rows.map((pair, i): [string, string] => i === index ? [pair[0], v] : pair)),
              valuePlaceholder,
            )}
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => updatePairs(pairs.filter((_, i) => i !== index))} disabled={!pairs.length}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => updatePairs([...pairs, ["", ""]])}>
        <Plus className="mr-1 h-4 w-4" /> Add row
      </Button>
    </div>
  );
};

const AuthConfigEditor = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const auth = safeObject(value);
  const update = (patch: Record<string, unknown>) => onChange(JSON.stringify({ ...auth, ...patch }, null, 2));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Auth type</Label><Input value={String(auth.type ?? "none")} onChange={(e) => update({ type: e.target.value })} placeholder="none or token" /><FieldHelp>Use none if the provider does not require authentication.</FieldHelp></div>
        <div><Label>Method</Label><Input value={String(auth.method ?? "POST")} onChange={(e) => update({ method: e.target.value })} placeholder="POST" /><FieldHelp>HTTP method used for the authentication request.</FieldHelp></div>
      </div>
      <div><Label>Auth URL</Label><Input value={String(auth.url ?? "")} onChange={(e) => update({ url: e.target.value })} placeholder="https://..." /><FieldHelp>Login or token endpoint from the provider.</FieldHelp></div>
      <KeyValueEditor label="Auth headers" help="Headers sent only with the authentication request." value={formatJson(auth.headers ?? {})} onChange={(headers) => update({ headers: safeRecord(headers) })} keyPlaceholder="Header" valuePlaceholder="Value" />
      <KeyValueEditor label="Auth payload mapping" help="Left side is the provider auth field. Right side can be an order field or secret:SECRET_NAME." value={formatJson(auth.payload_mapping ?? {})} onChange={(payload_mapping) => update({ payload_mapping: safeRecord(payload_mapping) })} keyPlaceholder="Provider field" valuePlaceholder="Value or secret" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Token response path</Label><Input value={String(auth.response_token_path ?? "token")} onChange={(e) => update({ response_token_path: e.target.value })} /><FieldHelp>Where the token is found in the auth response.</FieldHelp></div>
        <div><Label>Token header</Label><Input value={String(auth.token_header ?? "Authorization")} onChange={(e) => update({ token_header: e.target.value })} /><FieldHelp>Header used later for protected requests.</FieldHelp></div>
        <div><Label>Token prefix</Label><Input value={String(auth.token_prefix ?? "Bearer ")} onChange={(e) => update({ token_prefix: e.target.value })} /><FieldHelp>Common value is Bearer with a trailing space.</FieldHelp></div>
        <div><Label>Expires in path</Label><Input value={String(auth.expires_in_path ?? "expiresIn")} onChange={(e) => update({ expires_in_path: e.target.value })} /><FieldHelp>Optional response field for token lifetime.</FieldHelp></div>
      </div>
    </div>
  );
};

const ApiOperationsEditor = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const operations = safeArray(value);
  const updateOperation = (index: number, patch: Record<string, unknown>) => onChange(JSON.stringify(operations.map((operation, i) => i === index ? { ...operation, ...patch } : operation), null, 2));
  const removeOperation = (index: number) => onChange(JSON.stringify(operations.filter((_, i) => i !== index), null, 2));
  const addOperation = () => onChange(JSON.stringify([...operations, { name: "", url: "", method: "POST", headers: {}, payload_mapping: {} }], null, 2));

  return (
    <div className="space-y-3">
      <div><Label>Extra API operations</Label><FieldHelp>Optional requests executed in order when a provider needs more than one API call.</FieldHelp></div>
      {operations.map((operation, index) => (
        <div key={index} className="space-y-3 rounded-md border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px_40px]">
            <Input value={String(operation.url ?? "")} onChange={(e) => updateOperation(index, { url: e.target.value })} placeholder="Operation URL" />
            <Input value={String(operation.method ?? "POST")} onChange={(e) => updateOperation(index, { method: e.target.value })} placeholder="Method" />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeOperation(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <Input value={String(operation.name ?? "")} onChange={(e) => updateOperation(index, { name: e.target.value })} placeholder="Operation name" />
          <KeyValueEditor label="Operation headers" help="Headers for this operation only." value={formatJson(operation.headers ?? {})} onChange={(headers) => updateOperation(index, { headers: safeRecord(headers) })} />
          <KeyValueEditor label="Operation payload mapping" help="Provider fields and the values sent for this operation." value={formatJson(operation.payload_mapping ?? {})} onChange={(payload_mapping) => updateOperation(index, { payload_mapping: safeRecord(payload_mapping) })} keyPlaceholder="Provider field" valuePlaceholder="Order field or value" />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addOperation}><Plus className="mr-1 h-4 w-4" /> Add operation</Button>
    </div>
  );
};

const AdminLivreurs = () => {
  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubLivreurs, setHubLivreurs] = useState<HubLivreur[]>([]);
  const [settings, setSettings] = useState<Record<string, LivreurApiSettings>>({});
  const [show, setShow] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Livreur | null>(null);
  const [apiLogs, setApiLogs] = useState<Array<{ id: number; order_id: number | null; livreur_id: string | null; event_type: string; status: string; message: string | null; details: Record<string, unknown>; created_at: string }>>([]);
  const [selectedLog, setSelectedLog] = useState<typeof apiLogs[number] | null>(null);
  const [logFilter, setLogFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [retention, setRetention] = useState({ enabled: false, hours: 72 });
  const filteredLogs = useMemo(() => apiLogs.filter((log) => {
    if (logFilter !== "all" && (logFilter === "webhook" ? log.event_type !== "webhook_status" : log.event_type === "webhook_status")) return false;
    const needle = logSearch.trim().toLowerCase();
    if (!needle) return true;
    return [log.order_id, log.livreur_id, log.event_type, log.status, log.message, JSON.stringify(log.details ?? {})].some((value) => String(value ?? "").toLowerCase().includes(needle));
  }), [apiLogs, logFilter, logSearch]);
  const activeSettings = useMemo(() => {
    if (!editing) return null;
    const current = settings[editing.id] ?? defaultSettings(editing.id);
    return {
      ...current,
      auth_config: editing.authentication_config ?? current.auth_config,
      create_package_mapping: (editing.create_package_config as any)?.payload_mapping ?? current.create_package_mapping,
      create_package_headers: (editing.create_package_config as any)?.headers ?? current.create_package_headers,
      create_package_url: (editing.create_package_config as any)?.url ?? current.create_package_url,
      create_package_method: (editing.create_package_config as any)?.method ?? current.create_package_method,
      response_tracking_path: (editing.create_package_config as any)?.response_tracking_path ?? "trackingID",
      api_operations: (editing.create_package_config as any)?.operations ?? current.api_operations,
    };
  }, [editing, settings]);

  // Detected provider-side field paths from recent logs of the editing livreur,
  // split by source so the UI can suggest the right keys for webhook vs polling.
  const detectedProviderFields = useMemo(() => {
    const webhookSet = new Set<string>();
    const pollingSet = new Set<string>();
    const createPackageSet = new Set<string>();
    if (!editing) return { webhook: [], polling: [], createPackage: [] };
    for (const log of apiLogs) {
      if (log.livreur_id !== editing.id) continue;
      const details = (log.details ?? {}) as any;
      const receptionPayload = details?.reception?.payload ?? details?.reception?.body ?? null;
      const sendingResponse = details?.sending?.response_body ?? details?.sending?.body ?? null;
      if (log.event_type === "webhook_status" && receptionPayload) {
        collectPaths(receptionPayload, "", webhookSet);
      } else if (log.event_type === "polling_status") {
        if (receptionPayload) collectPaths(receptionPayload, "", pollingSet);
        if (sendingResponse) collectPaths(sendingResponse, "", pollingSet);
      } else {
        if (sendingResponse) collectPaths(sendingResponse, "", createPackageSet);
        if (receptionPayload) collectPaths(receptionPayload, "", createPackageSet);
      }
    }
    const sortAlpha = (a: string, b: string) => a.localeCompare(b);
    return {
      webhook: Array.from(webhookSet).sort(sortAlpha),
      polling: Array.from(pollingSet).sort(sortAlpha),
      createPackage: Array.from(createPackageSet).sort(sortAlpha),
    };
  }, [editing, apiLogs]);

  const [settingsForm, setSettingsForm] = useState({
    create_package_url: "",
    create_package_method: "POST",
    create_package_headers: "{}",
    create_package_mapping: "{}",
    response_tracking_path: "trackingID",
    auth_config: "{}",
    api_operations: "[]",
    validation_rules: "{}",
    status_mapping: "{}",
    polling_status_mapping: "{}",
    webhook_updates_current_status: true,
    webhook_enabled: false,
    webhook_status_field: "status",
    webhook_tracking_field: "trackingID",
    webhook_driver_name_field: "transport.currentDriverName",
    webhook_driver_phone_field: "transport.currentDriverPhone",
    webhook_note_field: "note",
    webhook_reported_date_field: "reportedDate",
    webhook_scheduled_date_field: "scheduledDate",
    webhook_extra_fields_mapping: "{}",
    polling_enabled: false,
    polling_interval_minutes: 15,
    polling_status_url: "",
    polling_status_method: "GET",
    polling_status_headers: "{}",
    polling_status_payload_mapping: "{}",
    polling_tracking_field: "trackingID",
    polling_status_field: "status",
    polling_message_field: "message",
    polling_reported_date_field: "reportedDate",
    polling_scheduled_date_field: "scheduledDate",
    rate_limit_per_second: 5,
    is_active: true,
  });

  const load = async () => {
    const [p, h, hl, s, logs, retentionSetting] = await Promise.all([
      db.from("profiles").select("id, username, full_name, api_enabled, api_token, authentication_config, create_package_config").eq("role", "livreur").order("username"),
      supabase.from("hubs").select("id, name").order("name"),
      supabase.from("hub_livreur").select("hub_id, livreur_id"),
      db.from("livreur_api_settings").select("*"),
      db.from("livreur_api_logs").select("id, order_id, livreur_id, event_type, status, message, details, created_at").order("created_at", { ascending: false }).limit(5000),
      db.from("app_settings").select("value").eq("key", "api_logs_retention").maybeSingle(),
    ]);
    setLivreurs((p.data ?? []) as Livreur[]);
    setHubs((h.data ?? []) as Hub[]);
    setHubLivreurs((hl.data ?? []) as HubLivreur[]);
    const byLivreur: Record<string, LivreurApiSettings> = {};
    (s.data ?? []).forEach((row: LivreurApiSettings) => { byLivreur[row.livreur_id] = row; });
    setSettings(byLivreur);
    setApiLogs(logs.data ?? []);
    const retentionValue = (retentionSetting.data?.value ?? {}) as Record<string, unknown>;
    setRetention({ enabled: Boolean(retentionValue.enabled), hours: Number(retentionValue.hours ?? (Number(retentionValue.days) || 3) * 24) || 72 });
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!activeSettings) return;
    setSettingsForm({
      create_package_url: activeSettings.create_package_url ?? "",
      create_package_method: activeSettings.create_package_method || "POST",
      create_package_headers: formatJson(activeSettings.create_package_headers),
      create_package_mapping: formatJson(activeSettings.create_package_mapping),
      response_tracking_path: (activeSettings as any).response_tracking_path || "trackingID",
      auth_config: formatJson(activeSettings.auth_config),
      api_operations: JSON.stringify(activeSettings.api_operations ?? [], null, 2),
      validation_rules: formatJson(activeSettings.validation_rules),
      status_mapping: formatJson(activeSettings.status_mapping),
      polling_status_mapping: formatJson(activeSettings.polling_status_mapping ?? {}),
      webhook_updates_current_status: activeSettings.webhook_updates_current_status,
      webhook_enabled: (activeSettings as any).webhook_enabled ?? false,
      webhook_status_field: activeSettings.webhook_status_field || "status",
      webhook_tracking_field: activeSettings.webhook_tracking_field || "trackingID",
      webhook_driver_name_field: activeSettings.webhook_driver_name_field || "transport.currentDriverName",
      webhook_driver_phone_field: activeSettings.webhook_driver_phone_field || "transport.currentDriverPhone",
      webhook_note_field: activeSettings.webhook_note_field || "note",
      webhook_reported_date_field: activeSettings.webhook_reported_date_field || "reportedDate",
      webhook_scheduled_date_field: activeSettings.webhook_scheduled_date_field || "scheduledDate",
      webhook_extra_fields_mapping: formatJson(activeSettings.webhook_extra_fields_mapping),
      polling_enabled: activeSettings.polling_enabled ?? false,
      polling_interval_minutes: activeSettings.polling_interval_minutes ?? 15,
      polling_status_url: activeSettings.polling_status_url ?? "",
      polling_status_method: activeSettings.polling_status_method || "GET",
      polling_status_headers: formatJson(activeSettings.polling_status_headers),
      polling_status_payload_mapping: formatJson(activeSettings.polling_status_payload_mapping),
      polling_tracking_field: activeSettings.polling_tracking_field || "trackingID",
      polling_status_field: activeSettings.polling_status_field || "status",
      polling_message_field: activeSettings.polling_message_field || "message",
      polling_reported_date_field: activeSettings.polling_reported_date_field || "reportedDate",
      polling_scheduled_date_field: activeSettings.polling_scheduled_date_field || "scheduledDate",
      rate_limit_per_second: activeSettings.rate_limit_per_second ?? 5,
      is_active: activeSettings.is_active,
    });
  }, [activeSettings]);

  const hubsOf = (livreurId: string) => hubLivreurs.filter((x) => x.livreur_id === livreurId).map((x) => x.hub_id);
  const hubAssignedTo = (hubId: number) => hubLivreurs.find((x) => x.hub_id === hubId)?.livreur_id;

  const toggleHubForLivreur = async (livreurId: string, hubId: number, currentlyAssigned: boolean) => {
    setSavingId(livreurId);
    try {
      if (currentlyAssigned) {
        const { error } = await supabase.from("hub_livreur").delete().eq("livreur_id", livreurId).eq("hub_id", hubId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hub_livreur").insert({ livreur_id: livreurId, hub_id: hubId });
        if (error) throw error;
      }
      await load();
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setSavingId(null);
    }
  };

  const toggleApi = async (l: Livreur, v: boolean) => {
    const { error } = await supabase.from("profiles").update({ api_enabled: v }).eq("id", l.id);
    if (error) toast.error(error.message);
    else { toast.info(v ? "API enabled: confirmed orders will be sent to the driver's provider to create external tracking." : "API disabled: the app will generate internal tracking numbers instead of creating packages through the provider."); load(); }
  };

  const toggleWebhook = async (l: Livreur, v: boolean) => {
    const current = settings[l.id] ?? defaultSettings(l.id);
    const { error } = await db.from("livreur_api_settings").upsert({ ...current, livreur_id: l.id, webhook_enabled: v }, { onConflict: "livreur_id" });
    if (error) toast.error(error.message);
    else { toast.info(v ? "Webhook enabled: incoming provider notifications will be accepted, logged, and used according to this driver's API/polling setup." : "Webhook disabled: incoming provider notifications will be logged as ignored and will not update orders."); load(); }
  };

  const regenToken = async (l: Livreur) => {
    const t = generateToken();
    const { error } = await supabase.from("profiles").update({ api_token: t }).eq("id", l.id);
    if (error) toast.error(error.message);
    else { toast.success("Token regenerated"); load(); }
  };

  const saveSettings = async () => {
    if (!editing) return;
    setSavingId(editing.id);
    try {
      const payload = {
        livreur_id: editing.id,
        create_package_url: settingsForm.create_package_url.trim() || null,
        create_package_method: settingsForm.create_package_method.trim().toUpperCase() || "POST",
        create_package_headers: parseJson("Headers", settingsForm.create_package_headers),
        create_package_mapping: parseJson("Mapping create package", settingsForm.create_package_mapping),
        auth_config: parseJson("Authentication", settingsForm.auth_config),
        api_operations: parseJsonArray("Payloads API", settingsForm.api_operations),
        validation_rules: parseJson("Validation", settingsForm.validation_rules),
        status_mapping: parseJson("Mapping status (webhook)", settingsForm.status_mapping),
        polling_status_mapping: parseJson("Mapping status (polling)", settingsForm.polling_status_mapping),
        webhook_updates_current_status: settingsForm.webhook_updates_current_status,
        webhook_enabled: settingsForm.webhook_enabled,
        webhook_status_field: settingsForm.webhook_status_field.trim() || "status",
        webhook_tracking_field: settingsForm.webhook_tracking_field.trim() || "trackingID",
        webhook_driver_name_field: settingsForm.webhook_driver_name_field.trim() || "transport.currentDriverName",
        webhook_driver_phone_field: settingsForm.webhook_driver_phone_field.trim() || "transport.currentDriverPhone",
        webhook_note_field: settingsForm.webhook_note_field.trim() || "note",
        webhook_reported_date_field: settingsForm.webhook_reported_date_field.trim() || "reportedDate",
        webhook_scheduled_date_field: settingsForm.webhook_scheduled_date_field.trim() || "scheduledDate",
        webhook_extra_fields_mapping: parseJson("Webhook extra fields", settingsForm.webhook_extra_fields_mapping),
        polling_enabled: settingsForm.polling_enabled,
        polling_interval_minutes: Number(settingsForm.polling_interval_minutes) || 15,
        polling_status_url: settingsForm.polling_status_url.trim() || null,
        polling_status_method: settingsForm.polling_status_method.trim().toUpperCase() || "GET",
        polling_status_headers: parseJson("Polling headers", settingsForm.polling_status_headers),
        polling_status_payload_mapping: parseJson("Polling payload", settingsForm.polling_status_payload_mapping),
        polling_tracking_field: settingsForm.polling_tracking_field.trim() || "trackingID",
        polling_status_field: settingsForm.polling_status_field.trim() || "status",
        polling_message_field: settingsForm.polling_message_field.trim() || "message",
        polling_reported_date_field: settingsForm.polling_reported_date_field.trim() || "reportedDate",
        polling_scheduled_date_field: settingsForm.polling_scheduled_date_field.trim() || "scheduledDate",
        rate_limit_per_second: Number((settingsForm as any).rate_limit_per_second) || 5,
        is_active: settingsForm.is_active,
      };
      const authConfig = parseJson("Authentication", settingsForm.auth_config);
      const createPackageConfig = {
        url: settingsForm.create_package_url.trim() || null,
        method: settingsForm.create_package_method.trim().toUpperCase() || "POST",
        headers: parseJson("Headers", settingsForm.create_package_headers),
        payload_mapping: parseJson("Mapping create package", settingsForm.create_package_mapping),
        response_tracking_path: settingsForm.response_tracking_path.trim() || "trackingID",
        operations: parseJsonArray("Payloads API", settingsForm.api_operations),
        rate_limit_per_second: Number((settingsForm as any).rate_limit_per_second) || 5,
      };
      const { error } = await db.from("livreur_api_settings").upsert(payload, { onConflict: "livreur_id" });
      if (error) throw error;
      const { error: profileError } = await db.from("profiles").update({ authentication_config: authConfig, create_package_config: createPackageConfig }).eq("id", editing.id);
      if (profileError) throw profileError;
      toast.success("Driver settings saved");
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setSavingId(null);
    }
  };

  const saveRetention = async () => {
    const hours = Math.max(Number(retention.hours) || 72, 1);
    const { error } = await db.from("app_settings").upsert({ key: "api_logs_retention", value: { enabled: retention.enabled, hours } }, { onConflict: "key" });
    if (error) toast.error(error.message);
    else { toast.success("Log cleanup settings saved"); setRetention({ enabled: retention.enabled, hours }); }
  };

  const deleteLog = async (id: number) => {
    const { error } = await db.from("livreur_api_logs").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Log deleted"); setSelectedLog(null); await load(); }
  };

  const masked = (t: string | null) => t ? `${t.slice(0, 6)}${"•".repeat(20)}${t.slice(-4)}` : "—";
  const getLogEndpointInfo = (log: typeof apiLogs[number]) => {
    const details = log.details ?? {};
    if ((details as any).endpoint) return (details as any).endpoint;
    const logSettings = log.livreur_id ? settings[log.livreur_id] : null;
    if (log.event_type === "webhook_status") {
      return {
        type: "Incoming webhook endpoint",
        method: "POST",
        url: log.livreur_id ? `${functionsBaseUrl}/livreur-webhook/${log.livreur_id}` : null,
        auth: "Bearer token required",
        tracking_field: logSettings?.webhook_tracking_field ?? "trackingID",
        status_field: logSettings?.webhook_status_field ?? "status",
        note_field: logSettings?.webhook_note_field ?? "note",
        reported_date_field: logSettings?.webhook_reported_date_field ?? "reportedDate",
        scheduled_date_field: logSettings?.webhook_scheduled_date_field ?? "scheduledDate",
        driver_name_field: logSettings?.webhook_driver_name_field ?? "transport.currentDriverName",
        driver_phone_field: logSettings?.webhook_driver_phone_field ?? "transport.currentDriverPhone",
        extra_fields_mapping: logSettings?.webhook_extra_fields_mapping ?? {},
      };
    }
    if (log.event_type === "polling_status") {
      return {
        type: "Outgoing polling endpoint",
        method: logSettings?.polling_status_method ?? null,
        url: logSettings?.polling_status_url ?? null,
        headers: maskSensitiveHeaders(logSettings?.polling_status_headers ?? {}),
        payload_mapping: logSettings?.polling_status_payload_mapping ?? {},
        tracking_field: logSettings?.polling_tracking_field ?? null,
        status_field: logSettings?.polling_status_field ?? null,
        message_field: logSettings?.polling_message_field ?? null,
        reported_date_field: logSettings?.polling_reported_date_field ?? null,
        scheduled_date_field: logSettings?.polling_scheduled_date_field ?? null,
      };
    }
    const livreur = log.livreur_id ? livreurs.find((item) => item.id === log.livreur_id) : null;
    const config = (livreur?.create_package_config as any) ?? {};
    return {
      type: "Outgoing create package endpoint",
      method: config.method ?? logSettings?.create_package_method ?? null,
      url: config.url ?? logSettings?.create_package_url ?? null,
      headers: maskSensitiveHeaders(config.headers ?? logSettings?.create_package_headers ?? {}),
      payload_mapping: config.payload_mapping ?? logSettings?.create_package_mapping ?? {},
      response_tracking_path: config.response_tracking_path ?? (details as any).tracking_path ?? "trackingID",
      extra_operations: config.operations ?? logSettings?.api_operations ?? [],
    };
  };
  const getLogFlowDetails = (log: typeof apiLogs[number]) => {
    const details = (log.details ?? {}) as any;
    return {
      reception: details.reception ?? null,
      sending: details.sending ?? null,
      exchanges: Array.isArray(details.exchanges) ? details.exchanges : [],
    };
  };
  const getLogTracking = (log: typeof apiLogs[number]) => {
    const details = (log.details ?? {}) as any;
    const candidates = [details.tracking, details.expected_tracking, details.response_tracking, details.reception?.payload?.trackingID, details.reception?.payload?.tracking, details.reception?.payload?.partnerTrackingID, details.reception?.body?.trackingID, details.reception?.body?.tracking, details.reception?.body?.partnerTrackingID];
    return candidates.find((value) => value !== undefined && value !== null && String(value).trim()) ?? "—";
  };

  return (
    <>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Livreur</TableHead>
              <TableHead>Hubs assignés</TableHead>
              <TableHead>API / Webhook</TableHead>
              <TableHead>API Token</TableHead>
              <TableHead>Settings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {livreurs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No drivers</TableCell></TableRow>
            ) : livreurs.map((l) => {
              const assigned = hubsOf(l.id);
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="font-medium">{l.full_name || l.username}</div>
                    <div className="text-xs text-muted-foreground">{l.username}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {assigned.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
                      {assigned.map((hid) => {
                        const h = hubs.find((x) => x.id === hid);
                        return <Badge key={hid} variant="secondary">{h?.name ?? `#${hid}`}</Badge>;
                      })}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" disabled={savingId === l.id}>Modifier <ChevronDown className="h-3 w-3 ml-1" /></Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2 max-h-72 overflow-y-auto" align="start">
                          <div className="text-xs font-medium px-2 py-1 text-muted-foreground">Select hubs</div>
                          {hubs.length === 0 && <div className="text-sm p-2 text-muted-foreground">No hubs</div>}
                          {hubs.map((h) => {
                            const owner = hubAssignedTo(h.id);
                            const isMine = owner === l.id;
                            const takenByOther = !!owner && !isMine;
                            return (
                              <label key={h.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent cursor-pointer ${takenByOther ? "opacity-50" : ""}`}>
                                <Checkbox checked={isMine} disabled={takenByOther || savingId === l.id} onCheckedChange={() => toggleHubForLivreur(l.id, h.id, isMine)} />
                                <span className="flex-1">{h.name}</span>
                                {takenByOther && <span className="text-xs text-muted-foreground">pris</span>}
                              </label>
                            );
                          })}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm"><Switch checked={l.api_enabled} onCheckedChange={(v) => toggleApi(l, v)} /><span>API</span></label>
                      <label className="flex items-center gap-2 text-sm"><Switch checked={(settings[l.id] as any)?.webhook_enabled ?? false} onCheckedChange={(v) => toggleWebhook(l, v)} /><span>Webhook</span></label>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input readOnly className="font-mono text-xs h-8 w-64" value={show.has(l.id) ? (l.api_token || "—") : masked(l.api_token)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { const n = new Set(show); n.has(l.id) ? n.delete(l.id) : n.add(l.id); setShow(n); }}>
                        {show.has(l.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => regenToken(l)}><RefreshCw className="h-4 w-4 mr-1" /> Generate</Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setEditing(l)}>
                      <SlidersHorizontal className="h-4 w-4 mr-1" /> Configure
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="mt-4 overflow-x-auto p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Webhook logs & Driver API logs</h3>
            <p className="text-sm text-muted-foreground">Showing latest {apiLogs.length} receptions, rejections, polling checks, and provider responses with full details. Cleanup retention is measured in hours.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Input className="h-9 w-64" placeholder="Search order, tracking, status..." value={logSearch} onChange={(e) => setLogSearch(e.target.value)} />
            <Select value={logFilter} onValueChange={setLogFilter}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All logs</SelectItem><SelectItem value="webhook">Webhook logs</SelectItem><SelectItem value="driver">Driver API logs</SelectItem></SelectContent></Select>
            <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"><Switch checked={retention.enabled} onCheckedChange={(enabled) => setRetention({ ...retention, enabled })} /> Auto clean</label>
            <div className="flex items-center gap-2"><Input type="number" min={1} className="h-9 w-24" value={retention.hours} onChange={(e) => setRetention({ ...retention, hours: Number(e.target.value) })} /><span className="text-sm text-muted-foreground">hours</span></div>
            <Button variant="outline" size="sm" onClick={saveRetention}>Save cleanup</Button>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
          </div>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Order</TableHead><TableHead>Tracking</TableHead><TableHead>Livreur</TableHead><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Message</TableHead><TableHead className="text-right">Details</TableHead></TableRow></TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? <TableRow><TableCell colSpan={8} className="py-6 text-center text-muted-foreground">No logs</TableCell></TableRow> : filteredLogs.map((log) => {
              const livreur = livreurs.find((item) => item.id === log.livreur_id);
              const flow = getLogFlowDetails(log);
              return <TableRow key={log.id}><TableCell className="whitespace-nowrap text-xs">{new Date(log.created_at).toLocaleString("fr-FR")}</TableCell><TableCell>{log.order_id ?? "—"}</TableCell><TableCell className="font-mono text-xs">{getLogTracking(log)}</TableCell><TableCell>{livreur?.full_name || livreur?.username || "—"}</TableCell><TableCell>{log.event_type}<div className="mt-1 flex flex-wrap gap-1"><Badge variant="outline">Reception {flow.reception ? "✓" : "—"}</Badge><Badge variant="outline">Sending {flow.sending ? "✓" : "—"}</Badge></div></TableCell><TableCell><Badge variant={log.status === "success" || log.status === "received" ? "default" : log.status === "ignored" ? "secondary" : "destructive"}>{log.status}</Badge></TableCell><TableCell className="max-w-md truncate" title={log.message ?? ""}>{log.message ?? "—"}</TableCell><TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setSelectedLog(log)}>Full details</Button></TableCell></TableRow>;
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(v) => !v && setSelectedLog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Log full details</DialogTitle></DialogHeader>
          {selectedLog && (
            <div className="space-y-3 text-sm">
              {(() => {
                const flow = getLogFlowDetails(selectedLog);
                return (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div><Label>Reception</Label><pre className="max-h-[30vh] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(flow.reception ?? "No reception data saved for this legacy log", null, 2)}</pre></div>
                    <div><Label>Sending</Label><pre className="max-h-[30vh] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(flow.sending ?? "No sending data saved for this legacy log", null, 2)}</pre></div>
                    {flow.exchanges.length > 0 && <div className="lg:col-span-2"><Label>All request/response exchanges</Label><pre className="max-h-[32vh] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(flow.exchanges, null, 2)}</pre></div>}
                  </div>
                );
              })()}
              <div className="grid gap-2 sm:grid-cols-2">
                <div><Label>Time</Label><p className="rounded-md bg-muted p-2">{new Date(selectedLog.created_at).toLocaleString("fr-FR")}</p></div>
                <div><Label>Event</Label><p className="rounded-md bg-muted p-2">{selectedLog.event_type}</p></div>
                <div><Label>Order</Label><p className="rounded-md bg-muted p-2">{selectedLog.order_id ?? "—"}</p></div>
                <div><Label>Status</Label><p className="rounded-md bg-muted p-2">{selectedLog.status}</p></div>
              </div>
              <div><Label>Message</Label><p className="rounded-md bg-muted p-2">{selectedLog.message ?? "—"}</p></div>
              <div><Label>Endpoint details</Label><pre className="max-h-[32vh] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(getLogEndpointInfo(selectedLog), null, 2)}</pre></div>
              <div><Label>Details</Label><pre className="max-h-[45vh] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedLog.details ?? {}, null, 2)}</pre></div>
            </div>
          )}
          <DialogFooter>
            {selectedLog && <Button type="button" variant="destructive" onClick={() => deleteLog(selectedLog.id)}><Trash2 className="mr-1 h-4 w-4" /> Delete log</Button>}
            <Button type="button" variant="outline" onClick={() => setSelectedLog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>API Settings — {editing?.full_name || editing?.username}</DialogTitle>
            <div className="mt-3 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="space-y-2">
                  <p>API and Webhook are independent. API creates external packages. Webhook receives provider notifications. Polling fetches provider status on schedule.</p>
                  <p>If API and Webhook are both enabled, webhook notifications are logged first, then polling remains responsible for fetching the full current order status.</p>
                </div>
              </div>
            </div>
          </DialogHeader>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-4 space-y-4">
              <SectionHeader icon={PackageCheck} title="Create a package" description="Main request used to create a delivery package with the selected provider." />
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <div><Label>Create package URL</Label><Input value={settingsForm.create_package_url} onChange={(e) => setSettingsForm({ ...settingsForm, create_package_url: e.target.value })} placeholder="https://..." /><FieldHelp>Endpoint provided by the delivery company to create a new package.</FieldHelp></div>
                <div><Label>Method</Label><Input value={settingsForm.create_package_method} onChange={(e) => setSettingsForm({ ...settingsForm, create_package_method: e.target.value })} /><FieldHelp>Usually POST.</FieldHelp></div>
              </div>
              <div><Label>Response tracking path</Label><Input value={settingsForm.response_tracking_path} onChange={(e) => setSettingsForm({ ...settingsForm, response_tracking_path: e.target.value })} placeholder="trackingID" /><FieldHelp>Where the tracking number is found in the create package response. Use nested paths like data.trackingID when needed.</FieldHelp></div>
              <KeyValueEditor label="Headers" help="Optional headers sent with the package creation request. Add one key/value per row." value={settingsForm.create_package_headers} onChange={(value) => setSettingsForm({ ...settingsForm, create_package_headers: value })} keyPlaceholder="Content-Type" valuePlaceholder="application/json" />
              <SmartMappingEditor label="Payload mapping" help="Left = provider field name (free text or detected from past responses). Right = order field sent as the value. Use Add row to capture every body field freely." value={settingsForm.create_package_mapping} onChange={(value) => setSettingsForm({ ...settingsForm, create_package_mapping: value })} keyOptions={detectedProviderFields.createPackage} valueOptions={SYSTEM_ORDER_FIELDS} keyPlaceholder="Provider field" valuePlaceholder="Order field" />
            </Card>
            <Card className="p-4 space-y-4">
              <SectionHeader icon={ShieldCheck} title="Authentication & payloads" description="Optional login/token request used before calling protected provider endpoints." />
              <AuthConfigEditor value={settingsForm.auth_config} onChange={(value) => setSettingsForm({ ...settingsForm, auth_config: value })} />
              <ApiOperationsEditor value={settingsForm.api_operations} onChange={(value) => setSettingsForm({ ...settingsForm, api_operations: value })} />
              <div><Label>Rate limit / second</Label><Input type="number" min={0.1} step={0.1} value={settingsForm.rate_limit_per_second} onChange={(e) => setSettingsForm({ ...settingsForm, rate_limit_per_second: Number(e.target.value) })} /><FieldHelp>Maximum outgoing requests per second for this provider. Set it according to the provider limit.</FieldHelp></div>
            </Card>
            <Card className="p-4 space-y-4">
              <SectionHeader icon={Webhook} title="Validation & webhook" description="Rules checked before sending, plus status mapping for incoming webhook updates." />
              <KeyValueEditor label="Validation rules" help="Input rules such as minimum product length, phone digits, or minimum order value. Values can be plain text, numbers, true/false, or small JSON objects." value={settingsForm.validation_rules} onChange={(value) => setSettingsForm({ ...settingsForm, validation_rules: value })} keyPlaceholder="Order field" valuePlaceholder='Rule, e.g. {"min_alnum":3}' primitiveValues />
              <KeyValueEditor label="Status mapping (Webhook)" help="Used only for incoming webhook notifications. Left = provider status as sent in the webhook body, right = internal status used in this app." value={settingsForm.status_mapping} onChange={(value) => setSettingsForm({ ...settingsForm, status_mapping: value })} keyPlaceholder="Provider status" valuePlaceholder="Internal status" />
              <div><Label>Webhook URL</Label><Input readOnly value={editing ? `${functionsBaseUrl}/livreur-webhook/${editing.id}` : ""} /><FieldHelp>Give this URL to the provider with this driver's API token as a Bearer token.</FieldHelp></div>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"><span>Enable webhook reception</span><Switch checked={settingsForm.webhook_enabled} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, webhook_enabled: v })} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Webhook status field</Label><Input value={settingsForm.webhook_status_field} onChange={(e) => setSettingsForm({ ...settingsForm, webhook_status_field: e.target.value })} /><FieldHelp>Field name that contains the provider status in the webhook body.</FieldHelp></div>
                <div><Label>Webhook tracking field</Label><Input value={settingsForm.webhook_tracking_field} onChange={(e) => setSettingsForm({ ...settingsForm, webhook_tracking_field: e.target.value })} /><FieldHelp>Field name that contains the tracking number in the webhook body.</FieldHelp></div>
                <div><Label>Webhook driver name field</Label><Input value={settingsForm.webhook_driver_name_field} onChange={(e) => setSettingsForm({ ...settingsForm, webhook_driver_name_field: e.target.value })} /><FieldHelp>Path used to capture the driver name shown in order details.</FieldHelp></div>
                <div><Label>Webhook driver phone field</Label><Input value={settingsForm.webhook_driver_phone_field} onChange={(e) => setSettingsForm({ ...settingsForm, webhook_driver_phone_field: e.target.value })} /><FieldHelp>Path used to capture the driver phone shown in order details.</FieldHelp></div>
                <div><Label>Webhook note field</Label><Input value={settingsForm.webhook_note_field} onChange={(e) => setSettingsForm({ ...settingsForm, webhook_note_field: e.target.value })} /><FieldHelp>Path used to capture the delivery note.</FieldHelp></div>
                <div><Label>Webhook date Reporté field</Label><Input value={settingsForm.webhook_reported_date_field} onChange={(e) => setSettingsForm({ ...settingsForm, webhook_reported_date_field: e.target.value })} /><FieldHelp>Path used to capture postponed delivery date.</FieldHelp></div>
                <div><Label>Webhook date Programmé field</Label><Input value={settingsForm.webhook_scheduled_date_field} onChange={(e) => setSettingsForm({ ...settingsForm, webhook_scheduled_date_field: e.target.value })} /><FieldHelp>Path used to capture scheduled delivery date.</FieldHelp></div>
              </div>
              <KeyValueEditor label="Webhook extra fields" help="Optional values captured from the webhook body for future use. Left side is the saved key, right side is the webhook body path." value={settingsForm.webhook_extra_fields_mapping} onChange={(value) => setSettingsForm({ ...settingsForm, webhook_extra_fields_mapping: value })} keyPlaceholder="Saved key" valuePlaceholder="Webhook path" />
              <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"><span>Webhook updates current status</span><Switch checked={settingsForm.webhook_updates_current_status} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, webhook_updates_current_status: v })} /></label>
              <FieldHelp>When API and webhook are both enabled, webhook notifications are saved in logs first and polling should fetch the complete current status. When only webhook is enabled, this switch lets the webhook body update the current order status directly.</FieldHelp>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"><span>Settings enabled</span><Switch checked={settingsForm.is_active} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, is_active: v })} /></label>
            </Card>
            <Card className="p-4 space-y-4">
              <SectionHeader icon={Clock} title="Status polling" description="Use polling when the provider has no webhook. The app checks order status on a schedule." />
              <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"><span>Enable polling</span><Switch checked={settingsForm.polling_enabled} onCheckedChange={(v) => setSettingsForm({ ...settingsForm, polling_enabled: v })} /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Interval in minutes</Label><Input type="number" min={1} value={settingsForm.polling_interval_minutes} onChange={(e) => setSettingsForm({ ...settingsForm, polling_interval_minutes: Number(e.target.value) })} /><FieldHelp>How often the app checks for status updates.</FieldHelp></div>
                <div><Label>Method</Label><Input value={settingsForm.polling_status_method} onChange={(e) => setSettingsForm({ ...settingsForm, polling_status_method: e.target.value })} /><FieldHelp>GET or POST, based on the provider documentation.</FieldHelp></div>
              </div>
              <div><Label>Status URL</Label><Input value={settingsForm.polling_status_url} onChange={(e) => setSettingsForm({ ...settingsForm, polling_status_url: e.target.value })} placeholder="https://..." /><FieldHelp>Endpoint used to fetch the latest provider status for an order.</FieldHelp></div>
              <KeyValueEditor label="Polling headers" help="Optional headers sent with the status polling request." value={settingsForm.polling_status_headers} onChange={(value) => setSettingsForm({ ...settingsForm, polling_status_headers: value })} keyPlaceholder="Header" valuePlaceholder="Value" />
              <KeyValueEditor label="Polling payload mapping" help="Mapping used for status requests, especially when the method is POST." value={settingsForm.polling_status_payload_mapping} onChange={(value) => setSettingsForm({ ...settingsForm, polling_status_payload_mapping: value })} keyPlaceholder="Provider field" valuePlaceholder="Order field" />
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label>Tracking field</Label><Input value={settingsForm.polling_tracking_field} onChange={(e) => setSettingsForm({ ...settingsForm, polling_tracking_field: e.target.value })} /></div>
                <div><Label>Status field</Label><Input value={settingsForm.polling_status_field} onChange={(e) => setSettingsForm({ ...settingsForm, polling_status_field: e.target.value })} /></div>
                <div><Label>Message field</Label><Input value={settingsForm.polling_message_field} onChange={(e) => setSettingsForm({ ...settingsForm, polling_message_field: e.target.value })} /></div>
                <div><Label>Date Reporté field</Label><Input value={settingsForm.polling_reported_date_field} onChange={(e) => setSettingsForm({ ...settingsForm, polling_reported_date_field: e.target.value })} /></div>
                <div><Label>Date Programmé field</Label><Input value={settingsForm.polling_scheduled_date_field} onChange={(e) => setSettingsForm({ ...settingsForm, polling_scheduled_date_field: e.target.value })} /></div>
              </div>
              <KeyValueEditor label="Status mapping (Polling)" help="Used only for the scheduled polling job. Left = provider status returned in the polling response, right = internal status used in this app." value={settingsForm.polling_status_mapping} onChange={(value) => setSettingsForm({ ...settingsForm, polling_status_mapping: value })} keyPlaceholder="Provider status" valuePlaceholder="Internal status" />
            </Card>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="button" onClick={saveSettings} disabled={savingId === editing?.id}>{savingId === editing?.id ? "..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminLivreurs;
