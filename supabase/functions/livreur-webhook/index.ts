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
  const external = await admin
    .from("orders")
    .select(baseSelect)
    .eq("assigned_livreur_id", livreurId)
    .eq("external_tracking_number", tracking)
    .maybeSingle();
  if (external.data || external.error) return external;
  return admin
    .from("orders")
    .select(baseSelect)
    .eq("assigned_livreur_id", livreurId)
    .eq("tracking_number", tracking)
    .maybeSingle();
}

async function removeRecentSystemDuplicate(admin: any, order: any, mappedStatus: string) {
  const since = new Date(Date.now() - 5000).toISOString();
  await admin
    .from("order_status_history")
    .delete()
    .eq("order_id", order.id)
    .eq("old_status", order.status)
    .eq("new_status", mappedStatus)
    .is("changed_by", null)
    .gte("changed_at", since);
}

async function latestDuplicate(admin: any, orderId: number, mappedStatus: string, livreurId: string) {
  const { data } = await admin
    .from("order_status_history")
    .select("id, new_status, changed_by")
    .eq("order_id", orderId)
    .eq("new_status", mappedStatus)
    .eq("changed_by", livreurId)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function updateOrderStatusFromProvider(admin: any, order: any, mappedStatus: string, livreurId: string, meta: Record<string, unknown>, updateCurrentStatus = true) {
  const orderPatch = {
    ...(updateCurrentStatus ? { status: mappedStatus } : {}),
    status_note: meta.note ?? null,
    postponed_date: meta.reported_date ?? null,
    scheduled_date: meta.scheduled_date ?? null,
  };
  const { error: updateError } = await admin.from("orders").update(orderPatch).eq("id", order.id);
  if (updateError) return updateError;
  if (updateCurrentStatus) await removeRecentSystemDuplicate(admin, order, mappedStatus);
  const duplicate = await latestDuplicate(admin, order.id, mappedStatus, livreurId);
  if (duplicate) {
    await admin.from("order_status_history").update({ notes: meta.note ?? null, provider_note: meta.note ?? null, reported_date: meta.reported_date ?? null, scheduled_date: meta.scheduled_date ?? null }).eq("id", duplicate.id);
    return null;
  }
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
  const meta = { note: message, reported_date: reportedDate, scheduled_date: scheduledDate };
  const driverName = getPath(payload, settings?.webhook_driver_name_field || "transport.currentDriverName") ?? null;
  const driverPhone = getPath(payload, settings?.webhook_driver_phone_field || "transport.currentDriverPhone") ?? null;
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

  const apiEnabled = profile.api_enabled === true;
  const pollingEnabled = settings.polling_enabled === true;
  const shouldUpdateCurrentStatus = settings.webhook_updates_current_status === true && !(apiEnabled && pollingEnabled);
  if (shouldUpdateCurrentStatus && mappedStatus !== order.status) {
    const updateError = await updateOrderStatusFromProvider(admin, order, mappedStatus, livreurId, meta, true);
    if (updateError) {
      await logApi(admin, { order_id: order.id, livreur_id: livreurId, event_type: "webhook_status", status: "failed", message: "Unable to update order status", details: webhookExchangeDetails(req, livreurId, settings, payload, 500, { error: "Unable to update order status" }, { tracking, raw_status: rawStatus, mapped_status: mappedStatus, error: updateError.message }) });
      return jsonResponse({ error: "Unable to update order status" }, 500);
    }
  } else {
    const duplicate = await latestDuplicate(admin, order.id, mappedStatus, livreurId);
    if (duplicate) {
      await admin.from("order_status_history").update({ notes: message, provider_note: message, reported_date: reportedDate, scheduled_date: scheduledDate }).eq("id", duplicate.id);
      await admin.from("orders").update({ status_note: message, postponed_date: reportedDate, scheduled_date: scheduledDate }).eq("id", order.id);
    await logApi(admin, { order_id: order.id, livreur_id: livreurId, event_type: "webhook_status", status: "ignored", message: "Duplicate status updated with latest metadata", details: webhookExchangeDetails(req, livreurId, settings, payload, 200, { ok: true, ignored: true, reason: "duplicate_status", order_id: order.id, status: mappedStatus }, { tracking, raw_status: rawStatus, mapped_status: mappedStatus, note: message, reported_date: reportedDate, scheduled_date: scheduledDate, driver_name: driverName, driver_phone: driverPhone, captured_fields: capturedFields }) });
      return jsonResponse({ ok: true, ignored: true, reason: "duplicate_status", order_id: order.id, status: mappedStatus });
    }
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
