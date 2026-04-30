import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isInternalConfirmed(status?: string | null) {
  const normalized = status?.toLowerCase();
  return normalized === "confirmed";
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { order_id?: number } = {};
  try { payload = await req.json(); } catch { /* ignore */ }
  if (!payload.order_id || typeof payload.order_id !== "number") {
    return new Response(JSON.stringify({ error: "order_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const callerId = userData.user.id;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("*")
    .eq("id", payload.order_id)
    .single();

  if (orderErr || !order) {
    return new Response(JSON.stringify({ error: "Order not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const [{ data: callerProfile }, { data: callerRoles }] = await Promise.all([
    admin.from("profiles").select("id, agent_of").eq("id", callerId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", callerId),
  ]);

  const isPrivileged = (callerRoles ?? []).some((r: any) => ["administrateur", "superviseur", "ramassoire", "livreur", "support", "suivi"].includes(r.role));
  const isVendeurOwner = order.vendeur_id === callerId;
  const isAgentOfVendeur = callerProfile?.agent_of && callerProfile.agent_of === order.vendeur_id;
  const isAssignedLivreur = order.assigned_livreur_id === callerId;

  if (!isPrivileged && !isVendeurOwner && !isAgentOfVendeur && !isAssignedLivreur) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const [{ data: history }, { data: vendeur }, { data: latestWebhookLog }] = await Promise.all([
    admin.from("order_status_history").select("id, old_status, new_status, changed_at, changed_by, notes, provider_note, reported_date, scheduled_date, actor_label").eq("order_id", order.id).order("changed_at", { ascending: true }),
    admin.from("profiles").select("id, full_name, username, company_name, phone").eq("id", order.vendeur_id).maybeSingle(),
    admin.from("livreur_api_logs").select("details").eq("order_id", order.id).eq("event_type", "webhook_status").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const actorIds = Array.from(new Set((history ?? []).map((h: any) => h.changed_by).filter(Boolean)));
  let actors: Record<string, any> = {};
  if (actorIds.length > 0) {
    const { data: rows } = await admin.from("profiles").select("id, full_name, username, role").in("id", actorIds);
    (rows ?? []).forEach((p: any) => { actors[p.id] = p; });
  }

  const packageError: string | null = null;
  const tracking = order.external_tracking_number || order.tracking_number;

  const currentOrder = order;
  // No more deduplication: each saved history row appears as-is. Webhook/polling
  // functions are now responsible for not inserting rows when status is unchanged.
  const mergedHistory = (history ?? [])
    .filter((h: any) => !isInternalConfirmed(h.new_status) && !isInternalConfirmed(h.old_status))
    .map((h: any) => ({
      source: h.changed_by === order.assigned_livreur_id ? "provider" : "odit",
      status: h.new_status,
      old_status: h.old_status,
      message: h.notes,
      note: h.provider_note ?? h.notes ?? null,
      reported_date: h.reported_date ?? null,
      scheduled_date: h.scheduled_date ?? null,
      changed_at: h.changed_at,
      actor: h.changed_by && h.changed_by !== order.assigned_livreur_id ? actors[h.changed_by] ?? null : null,
    }))
    .sort((a: any, b: any) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());

  return new Response(JSON.stringify({
    order: currentOrder,
    tracking,
    vendeur,
    livreur: {
      name: (currentOrder as any)?.driver_name || latestWebhookLog?.details?.driver_name || null,
      phone: (currentOrder as any)?.driver_phone || latestWebhookLog?.details?.driver_phone || null,
    },
    support: null,
    destination: null,
    history: mergedHistory,
    package_error: packageError,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
