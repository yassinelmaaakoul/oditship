import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPath(obj: any, path?: string | null) {
  if (!path) return undefined;
  return path.split(".").reduce((acc: any, key) => acc?.[key], obj);
}

// Resolve a "smart" path used for the activity actor:
//   - "lastmsg"            → last entry's `msg` from any array named history/timeline/events/logs
//   - "history.last.msg"   → last entry's `msg` from `history` array (or any array name)
//   - any other dotted path → standard getPath()
function resolveSmartPath(body: any, path?: string | null) {
  if (!path) return undefined;
  const trimmed = String(path).trim();
  if (!trimmed) return undefined;
  const findHistoryArray = (obj: any): any[] | null => {
    if (!obj || typeof obj !== "object") return null;
    for (const key of ["history", "timeline", "events", "logs", "statusHistory"]) {
      if (Array.isArray(obj[key]) && obj[key].length > 0) return obj[key];
    }
    return null;
  };
  if (trimmed.toLowerCase() === "lastmsg") {
    const arr = findHistoryArray(body);
    if (!arr) return undefined;
    const last = arr[arr.length - 1];
    return last?.msg ?? last?.message ?? last?.note ?? last?.user ?? null;
  }
  const lastMatch = trimmed.match(/^([a-zA-Z0-9_]+)\.last\.(.+)$/);
  if (lastMatch) {
    const [, arrName, rest] = lastMatch;
    const arr = (body && typeof body === "object") ? (body as any)[arrName] : null;
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return getPath(arr[arr.length - 1], rest);
  }
  return getPath(body, trimmed);
}

function setPath(obj: Record<string, any>, path: string, value: unknown) {
  const keys = path.split(".");
  let cur = obj;
  keys.slice(0, -1).forEach((key) => {
    if (!cur[key] || typeof cur[key] !== "object") cur[key] = {};
    cur = cur[key];
  });
  cur[keys[keys.length - 1]] = value ?? "";
}

function mapProviderStatus(status: unknown, mapping: Record<string, string>) {
  const raw = String(status ?? "").trim();
  if (!raw) return null;
  const direct = mapping[raw];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const normalizedRaw = raw.toLowerCase();
  const match = Object.entries(mapping ?? {}).find(([providerStatus]) => providerStatus.trim().toLowerCase() === normalizedRaw);
  return typeof match?.[1] === "string" && match[1].trim() ? match[1].trim() : null;
}

function parseDateValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveValue(order: Record<string, any>, source: unknown) {
  const value = String(source ?? "");
  if (value === "external_tracking") return order.external_tracking_number || order.tracking_number;
  if (value.startsWith("secret:")) return Deno.env.get(value.slice(7)) ?? "";
  return getPath(order, value);
}

function buildPayload(order: Record<string, any>, mapping: Record<string, string>) {
  const payload: Record<string, any> = {};
  Object.entries(mapping ?? {}).forEach(([target, source]) => setPath(payload, target, resolveValue(order, source)));
  return payload;
}

function maskSensitiveHeaders(headers: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => {
    const name = key.toLowerCase();
    if (name.includes("authorization") || name.includes("token") || name.includes("secret") || name.includes("key")) {
      const text = String(value ?? "");
      return [key, text ? `${text.slice(0, 8)}••••${text.slice(-4)}` : "••••"];
    }
    return [key, value];
  }));
}

function pollingEndpointInfo(settings: any, url: string, method: string, payload: Record<string, any>) {
  return {
    type: "Outgoing polling endpoint",
    method,
    url,
    headers: maskSensitiveHeaders(settings.polling_status_headers ?? {}),
    payload,
    payload_mapping: settings.polling_status_payload_mapping ?? {},
    tracking_field: settings.polling_tracking_field,
    status_field: settings.polling_status_field,
    message_field: settings.polling_message_field,
    reported_date_field: settings.polling_reported_date_field,
    scheduled_date_field: settings.polling_scheduled_date_field,
  };
}

function pollingExchange(endpoint: Record<string, unknown>, responseStatus: number | null, responseBody: unknown, responseHeaders: Headers | null = null) {
  return {
    sending: {
      direction: "outgoing",
      method: endpoint.method,
      url: endpoint.url,
      headers: endpoint.headers,
      payload: endpoint.payload,
    },
    reception: {
      direction: "incoming_response",
      status_code: responseStatus,
      headers: responseHeaders ? maskSensitiveHeaders(Object.fromEntries(responseHeaders.entries())) : {},
      body: responseBody,
    },
  };
}

function skippedPollingExchange(endpoint: Record<string, unknown>, reason: string) {
  return {
    sending: {
      direction: "not_sent",
      method: endpoint.method,
      url: endpoint.url,
      headers: endpoint.headers,
      payload: endpoint.payload,
    },
    reception: {
      direction: "not_received",
      reason,
    },
  };
}

async function logApi(admin: any, entry: Record<string, unknown>) {
  const { error } = await admin.from("livreur_api_logs").insert({
    order_id: entry.order_id ?? null,
    livreur_id: entry.livreur_id ?? null,
    event_type: entry.event_type,
    status: entry.status,
    message: entry.message ?? null,
    details: entry.details ?? {},
  });
  if (error) console.error("livreur_api_logs insert failed", error.message);
}

async function listPollingOrders(admin: any, livreurId: string) {
  const { data } = await admin
    .from("orders")
    .select("*")
    .eq("assigned_livreur_id", livreurId)
    .not("external_tracking_number", "is", null)
    .limit(500);
  return data ?? [];
}

// Whitelist of order columns admins can target via order_fields_mapping.
const ALLOWED_ORDER_COLUMNS = new Set([
  "status_note", "return_note", "scheduled_date", "postponed_date",
  "driver_name", "driver_phone", "comment", "delivered_at",
  "external_tracking_number", "tracking_number", "barcode", "qr_code",
]);

function pickAllowedExtras(extras: Record<string, unknown> | undefined | null) {
  const out: Record<string, unknown> = {};
  if (!extras) return out;
  for (const [k, v] of Object.entries(extras)) {
    if (ALLOWED_ORDER_COLUMNS.has(k) && v !== undefined && v !== null && String(v).trim() !== "") out[k] = v;
  }
  return out;
}

async function updateOrderStatusFromProvider(admin: any, order: any, mappedStatus: string, livreurId: string, meta: Record<string, unknown>) {
  const updatePayload: Record<string, unknown> = {
    status: mappedStatus,
    status_note: meta.note ?? null,
    postponed_date: meta.reported_date ?? null,
    scheduled_date: meta.scheduled_date ?? null,
  };
  if (meta.driver_name !== undefined && meta.driver_name !== null && String(meta.driver_name).trim() !== "") {
    updatePayload.driver_name = String(meta.driver_name);
  }
  if (meta.driver_phone !== undefined && meta.driver_phone !== null && String(meta.driver_phone).trim() !== "") {
    updatePayload.driver_phone = String(meta.driver_phone);
  }
  Object.assign(updatePayload, pickAllowedExtras(meta.extra_order_updates as Record<string, unknown> | undefined));
  const { error: updateError } = await admin.from("orders").update(updatePayload).eq("id", order.id);
  if (updateError) return updateError;
  const { error: historyError } = await admin.from("order_status_history").insert({
    order_id: order.id,
    old_status: order.status,
    new_status: mappedStatus,
    changed_by: livreurId,
    notes: meta.note ?? null,
    provider_note: meta.note ?? null,
    reported_date: meta.reported_date ?? null,
    scheduled_date: meta.scheduled_date ?? null,
    actor_label: meta.actor_label ?? null,
  });
  return historyError;
}

async function updateDriverInfoOnly(admin: any, order: any, driverName: unknown, driverPhone: unknown, extraOrderUpdates?: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const newName = driverName === undefined || driverName === null ? "" : String(driverName).trim();
  const newPhone = driverPhone === undefined || driverPhone === null ? "" : String(driverPhone).trim();
  if (newName && newName !== (order.driver_name ?? "")) patch.driver_name = newName;
  if (newPhone && newPhone !== (order.driver_phone ?? "")) patch.driver_phone = newPhone;
  const extras = pickAllowedExtras(extraOrderUpdates);
  for (const [k, v] of Object.entries(extras)) {
    if (String(v) !== String(order[k] ?? "")) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return null;
  const { error } = await admin.from("orders").update(patch).eq("id", order.id);
  return error;
}

async function authenticate(order: Record<string, any>, headers: Record<string, string>, authConfig: Record<string, any> | null) {
  if (!authConfig || authConfig.type === "none" || !authConfig.url) return headers;
  const response = await fetch(authConfig.url, {
    method: authConfig.method || "POST",
    headers: { "Content-Type": "application/json", ...(authConfig.headers ?? {}) },
    body: JSON.stringify(buildPayload(order, authConfig.payload_mapping ?? {})),
  });
  const text = await response.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!response.ok) throw new Error(`Authentication ${response.status}: ${parsed?.description || parsed?.message || text}`);
  const token = getPath(parsed, authConfig.response_token_path || "token");
  if (!token) throw new Error("Authentication: missing token in response");
  return { ...headers, [authConfig.token_header || "Authorization"]: `${authConfig.token_prefix ?? "Bearer "}${token}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: settingsRows, error } = await admin
    .from("livreur_api_settings")
    .select("*")
    .eq("is_active", true)
    .eq("polling_enabled", true)
    .not("polling_status_url", "is", null);
  if (error) return jsonResponse({ error: error.message }, 500);

  const now = Date.now();
  let checked = 0;
  let updated = 0;

  for (const settings of settingsRows ?? []) {
    const lastRun = settings.polling_last_run_at ? new Date(settings.polling_last_run_at).getTime() : 0;
    const intervalMs = Math.max(Number(settings.polling_interval_minutes) || 15, 1) * 60_000;
    if (lastRun && now - lastRun < intervalMs) continue;

    const orders = await listPollingOrders(admin, settings.livreur_id);
    if (!orders?.length) {
      await logApi(admin, { livreur_id: settings.livreur_id, event_type: "polling_status", status: "ignored", message: "Polling skipped: no tracked orders", details: { rejection_reason: "no_tracked_orders" } });
    }

    const delayMs = Math.ceil(1000 / Math.max(Number(settings.rate_limit_per_second) || 5, 0.1));
    for (const order of orders ?? []) {
      try {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        const method = String(settings.polling_status_method || "GET").toUpperCase();
        const headers = await authenticate(order, settings.polling_status_headers ?? {}, settings.auth_config ?? null);
        const payload = buildPayload(order, settings.polling_status_payload_mapping ?? {});
        const tracking = order.external_tracking_number || order.tracking_number || "";
        const url = String(settings.polling_status_url).replace("{tracking}", encodeURIComponent(tracking));
        const endpoint = pollingEndpointInfo(settings, url, method, payload);
        if (!tracking) {
          await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "ignored", message: "Polling skipped: missing tracking number", details: { endpoint, ...skippedPollingExchange(endpoint, "missing_tracking"), rejection_reason: "missing_tracking" } });
          continue;
        }
        if (!url || url === "null" || url === "undefined") {
          await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "ignored", message: "Polling skipped: missing status URL", details: { endpoint, ...skippedPollingExchange(endpoint, "missing_status_url"), tracking, rejection_reason: "missing_status_url" } });
          continue;
        }
        const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...headers }, body: method === "GET" ? undefined : JSON.stringify(payload) });
        checked += 1;
        const text = await response.text();
        let body: any = {};
        try { body = JSON.parse(text); } catch { body = { raw: text }; }
        const exchange = pollingExchange(endpoint, response.status, body, response.headers);
        if (!response.ok) {
          await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "failed", message: `Polling ${response.status}`, details: { endpoint, ...exchange, tracking, response: body } });
          continue;
        }
        const responseTracking = getPath(body, settings.polling_tracking_field);
        if (responseTracking && String(responseTracking).trim() !== String(tracking).trim()) {
          await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "ignored", message: "Polling response tracking mismatch", details: { endpoint, ...exchange, expected_tracking: tracking, response_tracking: responseTracking } });
          continue;
        }
        const rawStatus = getPath(body, settings.polling_status_field);
        const pollingMapping = (settings.polling_status_mapping && Object.keys(settings.polling_status_mapping).length > 0) ? settings.polling_status_mapping : (settings.status_mapping ?? {});
        const mappedStatus = mapProviderStatus(rawStatus, pollingMapping);
        if (!mappedStatus) {
          await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "ignored", message: "Provider status is not mapped", details: { endpoint, ...exchange, tracking, raw_status: rawStatus, status_mapping: pollingMapping } });
          continue;
        }
        const message = getPath(body, settings.polling_message_field) ?? null;
        const reportedDate = parseDateValue(getPath(body, settings.polling_reported_date_field || "reportedDate"));
        const scheduledDate = parseDateValue(getPath(body, settings.polling_scheduled_date_field || "scheduledDate"));
        const driverName = getPath(body, settings.polling_driver_name_field || settings.webhook_driver_name_field || "transport.currentDriverName");
        const driverPhone = getPath(body, settings.polling_driver_phone_field || settings.webhook_driver_phone_field || "transport.currentDriverPhone");
        const actorLabelRaw = resolveSmartPath(body, settings.polling_actor_field || "lastmsg");
        const actorLabel = actorLabelRaw === undefined || actorLabelRaw === null || String(actorLabelRaw).trim() === "" ? null : String(actorLabelRaw);
        // Capture extra order columns from response if admin configured a polling_order_fields_mapping.
        const extraOrderUpdates: Record<string, unknown> = {};
        const orderFieldsMapping = settings.polling_order_fields_mapping ?? {};
        for (const [orderField, responsePath] of Object.entries(orderFieldsMapping)) {
          if (!orderField || !responsePath) continue;
          const captured = getPath(body, String(responsePath));
          if (captured !== undefined && captured !== null && String(captured).trim() !== "") {
            extraOrderUpdates[String(orderField)] = captured;
          }
        }
        await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "received", message: `Provider status received: ${mappedStatus}`, details: { endpoint, ...exchange, tracking, raw_status: rawStatus, mapped_status: mappedStatus, previous_status: order.status, note: message, reported_date: reportedDate, scheduled_date: scheduledDate, driver_name: driverName, driver_phone: driverPhone, extra_order_updates: extraOrderUpdates } });
        if (mappedStatus === order.status) {
          // Same status as current → no status update, no history insert.
          // Still capture driver info if it changed (driver may be assigned without a status change).
          const driverErr = await updateDriverInfoOnly(admin, order, driverName, driverPhone, extraOrderUpdates);
          await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "ignored", message: driverErr ? "Provider status unchanged; driver update failed" : "Provider status matches current order status — no update needed", details: { endpoint, ...exchange, tracking, raw_status: rawStatus, mapped_status: mappedStatus, current_status: order.status, driver_name: driverName, driver_phone: driverPhone, rejection_reason: "status_unchanged", driver_update_error: driverErr?.message ?? null } });
          continue;
        }
        const updateError = await updateOrderStatusFromProvider(admin, order, mappedStatus, settings.livreur_id, { note: message, reported_date: reportedDate, scheduled_date: scheduledDate, driver_name: driverName, driver_phone: driverPhone, extra_order_updates: extraOrderUpdates, actor_label: actorLabel });
        if (updateError) {
          await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "failed", message: "Unable to update order status", details: { endpoint, ...exchange, tracking, raw_status: rawStatus, mapped_status: mappedStatus, error: updateError.message } });
          continue;
        }
        await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "success", message: "Order status and history updated", details: { endpoint, ...exchange, tracking, raw_status: rawStatus, mapped_status: mappedStatus, note: message, reported_date: reportedDate, scheduled_date: scheduledDate, driver_name: driverName, driver_phone: driverPhone } });
        updated += 1;
      } catch (e) {
        await logApi(admin, { order_id: order.id, livreur_id: settings.livreur_id, event_type: "polling_status", status: "failed", message: e instanceof Error ? e.message : "Unknown polling error", details: { tracking: order.external_tracking_number || order.tracking_number || null } });
      }
    }

    await admin.from("livreur_api_settings").update({ polling_last_run_at: new Date().toISOString() }).eq("livreur_id", settings.livreur_id);
  }

  return jsonResponse({ ok: true, checked, updated });
});