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
//   - "history.last.msg"   → last entry's `msg` from `history` array
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

function buildCapturedFields(payload: any, mapping: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(mapping ?? {})
      .map(([key, path]) => [key, getPath(payload, path)])
      .filter(([key, value]) => String(key).trim() && value !== undefined),
  );
}

function maskSensitiveHeaders(headers: Headers | Record<string, unknown>) {
  const entries = headers instanceof Headers ? Array.from(headers.entries()) : Object.entries(headers ?? {});
  return Object.fromEntries(entries.map(([key, value]) => {
    const name = key.toLowerCase();
    if (name.includes("authorization") || name.includes("token") || name.includes("secret") || name.includes("key")) {
      const text = String(value ?? "");
      return [key, text ? `${text.slice(0, 8)}••••${text.slice(-4)}` : "••••"];
    }
    return [key, value];
  }));
}

function webhookEndpointInfo(req: Request, livreurId: string | null, settings: any) {
  return {
    type: "Incoming webhook endpoint",
    method: req.method,
    url: req.url,
    auth: "Bearer token required",
    tracking_field: settings?.webhook_tracking_field || "trackingID",
    status_field: settings?.webhook_status_field || "status",
    note_field: settings?.webhook_note_field || "note",
    reported_date_field: settings?.webhook_reported_date_field || "reportedDate",
    scheduled_date_field: settings?.webhook_scheduled_date_field || "scheduledDate",
    driver_name_field: settings?.webhook_driver_name_field || "transport.currentDriverName",
    driver_phone_field: settings?.webhook_driver_phone_field || "transport.currentDriverPhone",
    actor_field: settings?.webhook_actor_field || "lastmsg",
    extra_fields_mapping: settings?.webhook_extra_fields_mapping ?? {},
    livreur_id: livreurId,
  };
}

function parseDateValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

function createAdmin() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function webhookExchangeDetails(req: Request, livreurId: string | null, settings: any, payload: any, responseStatus: number, responseBody: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    endpoint: webhookEndpointInfo(req, livreurId, settings),
    reception: {
      direction: "incoming",
      method: req.method,
      url: req.url,
      headers: maskSensitiveHeaders(req.headers),
      payload,
    },
    sending: {
      direction: "outgoing_response",
      status_code: responseStatus,
      body: responseBody,
    },
    ...extra,
  };
}

async function findOrderByTracking(admin: any, livreurId: string, tracking: string) {
  const baseSelect = "id, status";
  const directExternal = await admin
    .from("orders")
    .select(baseSelect)
    .eq("assigned_livreur_id", livreurId)
    .eq("external_tracking_number", tracking)
    .maybeSingle();
  if (directExternal.data || directExternal.error) return directExternal;
  const directInternal = await admin
    .from("orders")
    .select(baseSelect)
    .eq("assigned_livreur_id", livreurId)
    .eq("tracking_number", tracking)
    .maybeSingle();
  if (directInternal.data || directInternal.error) return directInternal;

  const { data: links } = await admin.from("hub_livreur").select("hub_id").eq("livreur_id", livreurId);
  const hubIds = [...new Set((links ?? []).map((row: any) => row.hub_id).filter(Boolean))];
  if (hubIds.length) {
    const byHubExternal = await admin.from("orders").select(baseSelect).in("hub_id", hubIds).eq("external_tracking_number", tracking).maybeSingle();
    if (byHubExternal.data || byHubExternal.error) return byHubExternal;
    const byHubInternal = await admin.from("orders").select(baseSelect).in("hub_id", hubIds).eq("tracking_number", tracking).maybeSingle();
    if (byHubInternal.data || byHubInternal.error) return byHubInternal;
  }

  const { data: cities } = hubIds.length ? await admin.from("hub_cities").select("city_name").in("hub_id", hubIds) : { data: [] };
  const cityNames = [...new Set((cities ?? []).map((row: any) => row.city_name).filter(Boolean))];
  if (cityNames.length) {
    const byCityExternal = await admin.from("orders").select(baseSelect).in("customer_city", cityNames).eq("external_tracking_number", tracking).maybeSingle();
    if (byCityExternal.data || byCityExternal.error) return byCityExternal;
    return admin.from("orders").select(baseSelect).in("customer_city", cityNames).eq("tracking_number", tracking).maybeSingle();
  }

  return directInternal;
}

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

async function updateOrderStatusFromProvider(admin: any, order: any, mappedStatus: string, livreurId: string, meta: Record<string, unknown>, updateCurrentStatus = true) {
  const orderPatch: Record<string, unknown> = {
    ...(updateCurrentStatus ? { status: mappedStatus } : {}),
    status_note: meta.note ?? null,
    postponed_date: meta.reported_date ?? null,
    scheduled_date: meta.scheduled_date ?? null,
  };
  if (meta.driver_name !== undefined && meta.driver_name !== null && String(meta.driver_name).trim() !== "") {
    orderPatch.driver_name = String(meta.driver_name);
  }
  if (meta.driver_phone !== undefined && meta.driver_phone !== null && String(meta.driver_phone).trim() !== "") {
    orderPatch.driver_phone = String(meta.driver_phone);
  }
  Object.assign(orderPatch, pickAllowedExtras(meta.extra_order_updates as Record<string, unknown> | undefined));
  const { error: updateError } = await admin.from("orders").update(orderPatch).eq("id", order.id);
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
  });
  return historyError;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idIdx = parts.findIndex((p) => p === "livreur-webhook");
  const livreurId = idIdx >= 0 ? parts[idIdx + 1] : null;
  const admin = createAdmin();
  let payload: any = {};
  try { payload = await req.json(); } catch { payload = {}; }

  if (req.method !== "POST") {
    await logApi(admin, { livreur_id: livreurId, event_type: "webhook_status", status: "failed", message: "Rejected webhook: method not allowed", details: webhookExchangeDetails(req, livreurId, null, payload, 405, { error: "Method not allowed" }, { rejected: true, rejection_reason: "method_not_allowed" }) });
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!livreurId) {
    await logApi(admin, { livreur_id: null, event_type: "webhook_status", status: "failed", message: "Rejected webhook: missing livreur id", details: webhookExchangeDetails(req, null, null, payload, 401, { error: "Missing livreur id" }, { rejected: true, rejection_reason: "missing_livreur_id" }) });
    return jsonResponse({ error: "Missing livreur id or bearer token" }, 401);
  }

  if (!token) {
    await logApi(admin, { livreur_id: livreurId, event_type: "webhook_status", status: "failed", message: "Rejected webhook: missing bearer token", details: webhookExchangeDetails(req, livreurId, null, payload, 401, { error: "Missing bearer token" }, { rejected: true, rejection_reason: "missing_bearer_token" }) });
    return jsonResponse({ error: "Missing livreur id or bearer token" }, 401);
  }

  const [{ data: profile }, { data: settings }] = await Promise.all([
    admin.from("profiles").select("id, api_token, api_enabled").eq("id", livreurId).maybeSingle(),
    admin.from("livreur_api_settings").select("*").eq("livreur_id", livreurId).maybeSingle(),
  ]);

  if (!profile || profile.api_token !== token) {
    await logApi(admin, { livreur_id: livreurId, event_type: "webhook_status", status: "failed", message: "Rejected webhook: invalid credentials", details: webhookExchangeDetails(req, livreurId, settings, payload, 401, { error: "Invalid credentials" }, { rejected: true, rejection_reason: "invalid_credentials" }) });
    return jsonResponse({ error: "Invalid credentials" }, 401);
  }

  const trackingField = settings?.webhook_tracking_field || "trackingID";
  const statusField = settings?.webhook_status_field || "status";
  const tracking = getPath(payload, trackingField) || payload.tracking_id || payload.trackingNumber || payload.partnerTrackingID;
  const rawStatus = getPath(payload, statusField);
  const mappedStatus = mapProviderStatus(rawStatus, settings?.status_mapping ?? {});
  const message = getPath(payload, settings?.webhook_note_field || "note") ?? payload.message ?? payload.msg ?? payload.description ?? null;
  const reportedDate = parseDateValue(getPath(payload, settings?.webhook_reported_date_field || "reportedDate"));
  const scheduledDate = parseDateValue(getPath(payload, settings?.webhook_scheduled_date_field || "scheduledDate"));
  const driverName = getPath(payload, settings?.webhook_driver_name_field || "transport.currentDriverName") ?? null;
  const driverPhone = getPath(payload, settings?.webhook_driver_phone_field || "transport.currentDriverPhone") ?? null;
  // Capture admin-configured extra order column updates from the webhook body.
  const extraOrderUpdates: Record<string, unknown> = {};
  const orderFieldsMapping = settings?.webhook_order_fields_mapping ?? {};
  for (const [orderField, responsePath] of Object.entries(orderFieldsMapping)) {
    if (!orderField || !responsePath) continue;
    const captured = getPath(payload, String(responsePath));
    if (captured !== undefined && captured !== null && String(captured).trim() !== "") {
      extraOrderUpdates[String(orderField)] = captured;
    }
  }
  const meta = { note: message, reported_date: reportedDate, scheduled_date: scheduledDate, driver_name: driverName, driver_phone: driverPhone, extra_order_updates: extraOrderUpdates };
  const capturedFields = buildCapturedFields(payload, settings?.webhook_extra_fields_mapping ?? {});

  if (!tracking || !String(rawStatus ?? "").trim()) {
    await logApi(admin, { livreur_id: livreurId, event_type: "webhook_status", status: "failed", message: "Rejected webhook: tracking and status are required", details: webhookExchangeDetails(req, livreurId, settings, payload, 400, { error: "Webhook requires tracking and status" }, { rejected: true, rejection_reason: "missing_tracking_or_status", trackingField, statusField }) });
    return jsonResponse({ error: "Webhook requires tracking and status" }, 400);
  }

  if (!settings || settings.is_active === false) {
    await logApi(admin, { livreur_id: livreurId, event_type: "webhook_status", status: "ignored", message: "Rejected webhook: API settings disabled", details: webhookExchangeDetails(req, livreurId, settings, payload, 200, { ok: true, ignored: true, reason: "settings_disabled" }, { rejected: true, rejection_reason: "settings_disabled", tracking, raw_status: rawStatus }) });
    return jsonResponse({ ok: true, ignored: true, reason: "settings_disabled" });
  }

  if (settings.webhook_enabled !== true) {
    await logApi(admin, { livreur_id: livreurId, event_type: "webhook_status", status: "ignored", message: "Webhook received but reception is disabled", details: webhookExchangeDetails(req, livreurId, settings, payload, 200, { ok: true, ignored: true, reason: "webhook_disabled" }, { rejected: true, rejection_reason: "webhook_disabled", tracking, raw_status: rawStatus }) });
    return jsonResponse({ ok: true, ignored: true, reason: "webhook_disabled" });
  }

  if (!mappedStatus) {
    await logApi(admin, { livreur_id: livreurId, event_type: "webhook_status", status: "ignored", message: "Rejected webhook: provider status is not mapped", details: webhookExchangeDetails(req, livreurId, settings, payload, 200, { ok: true, ignored: true, reason: "status_not_mapped" }, { rejected: true, rejection_reason: "status_not_mapped", tracking, raw_status: rawStatus, status_mapping: settings?.status_mapping ?? {} }) });
    return jsonResponse({ ok: true, ignored: true, reason: "status_not_mapped" });
  }

  const { data: order, error: orderError } = await findOrderByTracking(admin, livreurId, String(tracking).trim());

  if (orderError || !order) {
    await logApi(admin, { livreur_id: livreurId, event_type: "webhook_status", status: "failed", message: "Rejected webhook: order not found for tracking", details: webhookExchangeDetails(req, livreurId, settings, payload, 404, { error: "Order not found for tracking" }, { rejected: true, rejection_reason: "order_not_found", tracking, raw_status: rawStatus, error: orderError?.message }) });
    return jsonResponse({ error: "Order not found for tracking" }, 404);
  }

  await logApi(admin, { order_id: order.id, livreur_id: livreurId, event_type: "webhook_status", status: "received", message: `Webhook received: ${mappedStatus}`, details: webhookExchangeDetails(req, livreurId, settings, payload, 202, { ok: true, received: true, order_id: order.id, status: mappedStatus }, { tracking, raw_status: rawStatus, mapped_status: mappedStatus, previous_status: order.status, note: message, reported_date: reportedDate, scheduled_date: scheduledDate, driver_name: driverName, driver_phone: driverPhone, captured_fields: capturedFields }) });

  // New simple rule: if mapped status equals current order status → do nothing (no status update, no history insert).
  // Still capture driver info if it changed.
  if (mappedStatus === order.status) {
    const driverPatch: Record<string, unknown> = {};
    if (driverName && String(driverName).trim() && String(driverName) !== (order.driver_name ?? "")) driverPatch.driver_name = String(driverName);
    if (driverPhone && String(driverPhone).trim() && String(driverPhone) !== (order.driver_phone ?? "")) driverPatch.driver_phone = String(driverPhone);
    const allowedExtras = pickAllowedExtras(extraOrderUpdates);
    for (const [k, v] of Object.entries(allowedExtras)) {
      if (String(v) !== String((order as any)[k] ?? "")) driverPatch[k] = v;
    }
    if (Object.keys(driverPatch).length > 0) {
      await admin.from("orders").update(driverPatch).eq("id", order.id);
    }
    await logApi(admin, { order_id: order.id, livreur_id: livreurId, event_type: "webhook_status", status: "ignored", message: "Webhook ignored: status matches current order status", details: webhookExchangeDetails(req, livreurId, settings, payload, 200, { ok: true, ignored: true, reason: "status_unchanged", order_id: order.id, status: mappedStatus }, { tracking, raw_status: rawStatus, mapped_status: mappedStatus, current_status: order.status, driver_name: driverName, driver_phone: driverPhone, rejection_reason: "status_unchanged" }) });
    return jsonResponse({ ok: true, ignored: true, reason: "status_unchanged", order_id: order.id, status: mappedStatus });
  }

  const shouldUpdateCurrentStatus = settings.webhook_updates_current_status === true;
  if (shouldUpdateCurrentStatus) {
    const updateError = await updateOrderStatusFromProvider(admin, order, mappedStatus, livreurId, meta, true);
    if (updateError) {
      await logApi(admin, { order_id: order.id, livreur_id: livreurId, event_type: "webhook_status", status: "failed", message: "Unable to update order status", details: webhookExchangeDetails(req, livreurId, settings, payload, 500, { error: "Unable to update order status" }, { tracking, raw_status: rawStatus, mapped_status: mappedStatus, error: updateError.message }) });
      return jsonResponse({ error: "Unable to update order status" }, 500);
    }
  } else {
    await admin.from("orders").update({ status_note: message, postponed_date: reportedDate, scheduled_date: scheduledDate }).eq("id", order.id);
    const { error: historyError } = await admin.from("order_status_history").insert({
      order_id: order.id,
      old_status: order.status,
      new_status: mappedStatus,
      changed_by: livreurId,
      notes: message,
      provider_note: message,
      reported_date: reportedDate,
      scheduled_date: scheduledDate,
    });
    if (historyError) {
      await logApi(admin, { order_id: order.id, livreur_id: livreurId, event_type: "webhook_status", status: "failed", message: "Unable to record status history", details: webhookExchangeDetails(req, livreurId, settings, payload, 500, { error: "Unable to record status history" }, { tracking, raw_status: rawStatus, mapped_status: mappedStatus, error: historyError.message }) });
      return jsonResponse({ error: "Unable to record status history" }, 500);
    }
  }

  await logApi(admin, { order_id: order.id, livreur_id: livreurId, event_type: "webhook_status", status: "success", message: shouldUpdateCurrentStatus ? "Order status and history updated" : "History updated only", details: webhookExchangeDetails(req, livreurId, settings, payload, 200, { ok: true, order_id: order.id, status: mappedStatus, updated_current_status: shouldUpdateCurrentStatus && mappedStatus !== order.status }, { tracking, raw_status: rawStatus, mapped_status: mappedStatus, updated_current_status: shouldUpdateCurrentStatus && mappedStatus !== order.status, note: message, reported_date: reportedDate, scheduled_date: scheduledDate, driver_name: driverName, driver_phone: driverPhone, captured_fields: capturedFields }) });

  return jsonResponse({ ok: true, order_id: order.id, status: mappedStatus, updated_current_status: shouldUpdateCurrentStatus && mappedStatus !== order.status });
});
