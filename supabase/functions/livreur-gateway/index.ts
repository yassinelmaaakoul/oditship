import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonRecord = Record<string, any>;

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPath(obj: any, path?: string | null) {
  if (!path) return undefined;
  return path.split(".").reduce((acc: any, key) => acc?.[key], obj);
}

function setPath(obj: JsonRecord, path: string, value: unknown) {
  const keys = path.split(".").filter(Boolean);
  if (!keys.length) return;
  let cur = obj;
  keys.slice(0, -1).forEach((key) => {
    if (!cur[key] || typeof cur[key] !== "object" || Array.isArray(cur[key])) cur[key] = {};
    cur = cur[key];
  });
  cur[keys[keys.length - 1]] = value ?? "";
}

function resolveTemplate(input: unknown, context: JsonRecord): any {
  if (typeof input !== "string") return input;
  if (input.startsWith("secret:")) return Deno.env.get(input.slice(7)) ?? "";
  if (input === "partner_tracking_id") return `ODiT-${context.order?.id}`;
  if (input === "external_tracking") return context.order?.external_tracking_number || context.order?.tracking_number;
  const exact = input.match(/^\{\{\s*([^}]+)\s*\}\}$/);
  if (exact) return resolveTemplatePath(exact[1], context);
  if (input.includes("{{")) {
    return input.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, path) => String(resolveTemplatePath(path, context) ?? ""));
  }
  const orderValue = getPath(context.order, input.replace(/^order\./, ""));
  return orderValue !== undefined ? orderValue : input;
}

function resolveTemplatePath(path: string, context: JsonRecord) {
  if (path === "token") return context.token;
  if (path.startsWith("order.")) return getPath(context.order, path.slice(6));
  if (path.startsWith("auth.")) return getPath(context.auth, path.slice(5));
  if (path.startsWith("secret.")) return Deno.env.get(path.slice(7)) ?? "";
  return getPath(context, path);
}

function renderObject(value: any, context: JsonRecord): any {
  if (Array.isArray(value)) return value.map((item) => renderObject(item, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderObject(item, context)]));
  return resolveTemplate(value, context);
}

function buildMappedPayload(order: JsonRecord, mapping: JsonRecord, context: JsonRecord) {
  const payload: JsonRecord = {};
  Object.entries(mapping ?? {}).forEach(([target, source]) => setPath(payload, target, resolveTemplate(source, { ...context, order })));
  return payload;
}

function maskSensitiveHeaders(headers: JsonRecord = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => {
    const name = key.toLowerCase();
    if (name.includes("authorization") || name.includes("token") || name.includes("secret") || name.includes("key")) {
      const text = String(value ?? "");
      return [key, text ? `${text.slice(0, 8)}••••${text.slice(-4)}` : "••••"];
    }
    return [key, value];
  }));
}

function createEndpointInfo(config: JsonRecord, payload: JsonRecord, label = "Create package") {
  return {
    type: "Outgoing create package endpoint",
    label,
    method: String(config.method || "POST").toUpperCase(),
    url: config.url ?? null,
    headers: maskSensitiveHeaders(config.headers ?? {}),
    payload,
    payload_mapping: config.payload_mapping ?? {},
    response_tracking_path: config.response_tracking_path || config.tracking_path || "trackingID",
    extra_operations: config.operations ?? [],
  };
}

function alnumCount(value: unknown) {
  return String(value ?? "").replace(/[^\p{L}\p{N}]/gu, "").length;
}

function validateOrder(order: JsonRecord, rules: JsonRecord) {
  for (const [field, rule] of Object.entries(rules ?? {})) {
    const value = getPath(order, field);
    if (rule?.min_alnum && alnumCount(value) < Number(rule.min_alnum)) throw new Error(`${field} must contain at least ${rule.min_alnum} letters or digits`);
    if (rule?.min_length && String(value ?? "").trim().length < Number(rule.min_length)) throw new Error(`${field} must contain at least ${rule.min_length} characters`);
    if (rule?.digits && String(value ?? "").replace(/\D/g, "").length !== Number(rule.digits)) throw new Error(`${field} must contain ${rule.digits} digits`);
    if (rule?.min !== undefined && Number(value) < Number(rule.min)) throw new Error(`${field} must be greater than or equal to ${rule.min}`);
  }
}

async function authenticate(order: JsonRecord, authConfig: JsonRecord | null) {
  if (!authConfig || authConfig.type === "none" || !authConfig.url) return { token: null, auth: null };
  const context = { order, token: null, auth: null };
  const headers = renderObject(authConfig.headers ?? {}, context);
  const payload = authConfig.payload ? renderObject(authConfig.payload, context) : buildMappedPayload(order, authConfig.payload_mapping ?? {}, context);
  const response = await fetch(authConfig.url, {
    method: String(authConfig.method || "POST").toUpperCase(),
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!response.ok) throw new Error(`Authentication ${response.status}: ${parsed?.description || parsed?.message || text}`);
  const token = getPath(parsed, authConfig.response_token_path || "token");
  if (!token) throw new Error("Authentication: missing token in response");
  return { token: String(token), auth: parsed };
}

function normalizeCreateConfig(profileConfig: any, legacySettings: any) {
  if (Array.isArray(profileConfig)) {
    const [main, ...operations] = profileConfig;
    return { ...(main ?? {}), operations: [...(main?.operations ?? []), ...operations] };
  }
  if (profileConfig && typeof profileConfig === "object" && Object.keys(profileConfig).length) return profileConfig;
  if (!legacySettings) return null;
  return {
    url: legacySettings.create_package_url,
    method: legacySettings.create_package_method,
    headers: legacySettings.create_package_headers ?? {},
    payload_mapping: legacySettings.create_package_mapping ?? {},
    response_tracking_path: legacySettings.create_package_response_tracking_path || "trackingID",
    operations: legacySettings.api_operations ?? [],
  };
}

async function sendRequest(config: JsonRecord, order: JsonRecord, context: JsonRecord, label = "Create package") {
  if (!config?.url) throw new Error(`${label} URL is missing`);
  const method = String(config.method || "POST").toUpperCase();
  const headers = renderObject(config.headers ?? {}, context);
  const payload = config.payload ? renderObject(config.payload, context) : buildMappedPayload(order, config.payload_mapping ?? {}, context);
  const response = await fetch(config.url, { method, headers: { "Content-Type": "application/json", ...headers }, body: method === "GET" ? undefined : JSON.stringify(payload) });
  const text = await response.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  const exchange = {
    sending: { direction: "outgoing", label, method, url: config.url, headers: maskSensitiveHeaders({ "Content-Type": "application/json", ...headers }), payload: method === "GET" ? null : payload },
    reception: { direction: "incoming_response", status_code: response.status, ok: response.ok, headers: maskSensitiveHeaders(Object.fromEntries(response.headers.entries())), body: parsed },
  };
  if (!response.ok) {
    const err = new Error(`${label} ${response.status}: ${parsed?.description || parsed?.message || text}`) as Error & { exchange?: JsonRecord };
    err.exchange = exchange;
    throw err;
  }
  return { data: parsed, exchange };
}

async function logApi(admin: any, entry: JsonRecord) {
  await admin.from("livreur_api_logs").insert({
    order_id: entry.order_id ?? null,
    livreur_id: entry.livreur_id ?? null,
    event_type: entry.event_type,
    status: entry.status,
    message: entry.message ?? null,
    details: entry.details ?? {},
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Invalid session" }, 401);

  let body: { order_id?: number; livreur_id?: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }
  if (!body.order_id || typeof body.order_id !== "number") return jsonResponse({ error: "order_id (number) required" }, 400);

  const { data: order } = await admin.from("orders").select("*").eq("id", body.order_id).single();
  if (!order) return jsonResponse({ error: "Order not found" }, 404);

  const callerId = userData.user.id;
  const [{ data: callerProfile }, { data: callerRoles }] = await Promise.all([
    admin.from("profiles").select("id, agent_of").eq("id", callerId).single(),
    admin.from("user_roles").select("role").eq("user_id", callerId),
  ]);
  const isAdmin = (callerRoles ?? []).some((r: any) => r.role === "administrateur");
  const isOwner = order.vendeur_id === callerId;
  const isAgent = callerProfile?.agent_of && callerProfile.agent_of === order.vendeur_id;
  if (!isOwner && !isAgent && !isAdmin) return jsonResponse({ error: "Forbidden" }, 403);
  if (order.status !== "Confirmé") return jsonResponse({ error: `Order must be in 'Confirmé' (current: ${order.status})` }, 400);

  const { data: hubCity } = await admin.from("hub_cities").select("hub_id").eq("city_name", order.customer_city).limit(1).maybeSingle();
  if (!hubCity) {
    const msg = `City "${order.customer_city}" is not assigned to any hub. Contact administrator.`;
    await admin.from("orders").update({ api_sync_status: "failed", api_sync_error: msg }).eq("id", order.id);
    return jsonResponse({ error: msg }, 422);
  }

  let livreurId = body.livreur_id;
  if (!livreurId) {
    const { data: hubLivreur } = await admin.from("hub_livreur").select("livreur_id").eq("hub_id", hubCity.hub_id).maybeSingle();
    livreurId = hubLivreur?.livreur_id;
  }
  if (!livreurId) {
    const msg = "No delivery person assigned to this hub. Contact administrator.";
    await admin.from("orders").update({ api_sync_status: "failed", api_sync_error: msg }).eq("id", order.id);
    return jsonResponse({ error: msg }, 422);
  }

  const [{ data: livreur }, { data: legacySettings }] = await Promise.all([
    admin.from("profiles").select("id, api_enabled, authentication_config, create_package_config").eq("id", livreurId).single(),
    admin.from("livreur_api_settings").select("*").eq("livreur_id", livreurId).maybeSingle(),
  ]);
  if (!livreur) return jsonResponse({ error: "Delivery profile missing" }, 404);

  if (!livreur.api_enabled) {
    const trackingNumber = order.tracking_number || `ODiT-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const { error } = await admin.from("orders").update({ tracking_number: trackingNumber, status: "Pickup", assigned_livreur_id: livreur.id, hub_id: hubCity.hub_id, api_sync_status: "not_required", api_sync_error: null }).eq("id", order.id);
    if (error) return jsonResponse({ error: error.message }, 500);
    await logApi(admin, { order_id: order.id, livreur_id: livreur.id, event_type: "create_package", status: "success", message: "Internal tracking generated because driver API is disabled", details: { mode: "internal_tracking", webhook_enabled: legacySettings?.webhook_enabled === true, generated_tracking: trackingNumber } });
    return jsonResponse({ ok: true, mode: "internal_tracking", message: "External API disabled for this driver; internal tracking generated.", tracking_number: trackingNumber });
  }

  let lastEndpoint: JsonRecord | null = null;
  try {
    const settings = legacySettings?.is_active === false ? null : legacySettings;
    validateOrder(order, settings?.validation_rules ?? {});
    const authConfig = livreur.authentication_config ?? settings?.auth_config ?? null;
    const createConfig = normalizeCreateConfig(livreur.create_package_config, settings);
    if (!createConfig) throw new Error("Create package configuration is missing");

    const authResult = await authenticate(order, authConfig);
    const context = { order, token: authResult.token, auth: authResult.auth };
    if (authResult.token && authConfig?.token_header) createConfig.headers = { ...(createConfig.headers ?? {}), [authConfig.token_header]: `${authConfig.token_prefix ?? "Bearer "}{{token}}` };
    const endpoint = createEndpointInfo(createConfig, createConfig.payload ? renderObject(createConfig.payload, context) : buildMappedPayload(order, createConfig.payload_mapping ?? {}, context));
    lastEndpoint = endpoint;

    const delayMs = Math.ceil(1000 / Math.max(Number(settings?.rate_limit_per_second) || Number(createConfig.rate_limit_per_second) || 5, 0.1));
    const createResult = await sendRequest(createConfig, order, context);
    const result = createResult.data;
    const exchanges = [createResult.exchange];
    for (const operation of createConfig.operations ?? []) {
      if (operation?.enabled === false) continue;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const operationResult = await sendRequest(operation, order, { ...context, create_response: result }, operation.name || "API operation");
      exchanges.push(operationResult.exchange);
    }

    const trackingPath = createConfig.response_tracking_path || createConfig.tracking_path || "trackingID";
    const tracking = getPath(result, trackingPath) || result.trackingID || result.tracking_id || result.trackingNumber || result.tracking_number || result.id;
    if (!tracking) throw new Error(`Create package: missing tracking id in response path '${trackingPath}'`);

    const { error } = await admin.from("orders").update({ external_tracking_number: String(tracking), status: "Pickup", assigned_livreur_id: livreur.id, hub_id: hubCity.hub_id, api_sync_status: "success", api_sync_error: null }).eq("id", order.id);
    if (error) return jsonResponse({ error: `Provider succeeded but database update failed: ${error.message}`, tracking_id: String(tracking) }, 500);
    await logApi(admin, { order_id: order.id, livreur_id: livreur.id, event_type: "create_package", status: "success", message: `Tracking ${String(tracking)}`, details: { endpoint, sending: exchanges[0]?.sending, reception: exchanges[0]?.reception, exchanges, tracking_path: trackingPath } });

    return jsonResponse({ ok: true, mode: "external_api", tracking_id: String(tracking) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown delivery API error";
    await admin.from("orders").update({ api_sync_status: "failed", api_sync_error: message }).eq("id", order.id);
    const exchange = (error as Error & { exchange?: JsonRecord })?.exchange ?? null;
    await logApi(admin, { order_id: order.id, livreur_id: livreurId, event_type: "create_package", status: "failed", message, details: { endpoint: lastEndpoint, sending: exchange?.sending ?? null, reception: exchange?.reception ?? null, customer_city: order.customer_city } });
    return jsonResponse({ error: "Commande refusée par les règles ou l'API du livreur. Contactez l'administration." }, 502);
  }
});
