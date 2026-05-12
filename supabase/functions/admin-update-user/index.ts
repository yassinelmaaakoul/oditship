// Admin/vendeur user update: updates auth user (email/password) and profile fields.
// Authorization:
//   - administrateur can update any user
//   - vendeur can only update their own agents (profiles.agent_of = caller.id)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  user_id: string;
  get_email?: boolean;
  username?: string;
  email?: string;
  password?: string;
  full_name?: string | null;
  phone?: string | null;
  cin?: string | null;
  city?: string | null;
  role?: string;
  is_active?: boolean;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  agent_pages?: Record<string, boolean> | null;
}

const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Missing Authorization" });

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoErr } = await userClient.auth.getUser();
  if (whoErr || !who.user) return json(401, { error: "Invalid session" });
  const callerId = who.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  if (!body.user_id) return json(400, { error: "user_id required" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // Authorization
  const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
  const isAdmin = (callerRoles ?? []).some((r) => r.role === "administrateur");

  if (!isAdmin) {
    // Vendeurs can only edit their own agents
    const { data: target } = await admin.from("profiles").select("agent_of").eq("id", body.user_id).maybeSingle();
    if (!target || target.agent_of !== callerId) return json(403, { error: "Forbidden" });
    // Vendeurs cannot change role
    if (body.role && body.role !== "agent") return json(403, { error: "Cannot change role" });
  }

  if (body.get_email) {
    const { data: targetUser, error: targetErr } = await admin.auth.admin.getUserById(body.user_id);
    if (targetErr || !targetUser.user) return json(404, { error: targetErr?.message || "User not found" });
    let current_password = "";
    if (isAdmin) {
      const { data: pw } = await admin.from("plain_passwords").select("password").eq("user_id", body.user_id).maybeSingle();
      current_password = (pw as { password?: string } | null)?.password ?? "";
    }
    return json(200, { email: targetUser.user.email ?? "", current_password });
  }

  // Auth update (email/password)
  if (body.email || body.password) {
    const updates: Record<string, unknown> = {};
    if (body.email) {
      const { data: targetUser, error: targetErr } = await admin.auth.admin.getUserById(body.user_id);
      if (targetErr || !targetUser.user) return json(404, { error: targetErr?.message || "User not found" });
      const nextEmail = body.email.trim().toLowerCase();
      if (nextEmail && nextEmail !== (targetUser.user.email ?? "").toLowerCase()) updates.email = nextEmail;
    }
    if (body.password) {
      if (body.password.length < 6) return json(400, { error: "Password too short" });
      updates.password = body.password;
    }
    if (Object.keys(updates).length > 0) {
      const { error: authErr } = await admin.auth.admin.updateUserById(body.user_id, updates);
      if (authErr) return json(400, { error: authErr.message });
    }

    // Mirror plain password into plain_passwords (admin-only readable via RLS)
    if (body.password && isAdmin) {
      const { error: pwErr } = await admin.from("plain_passwords").upsert(
        { user_id: body.user_id, password: body.password, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (pwErr) console.error("Failed to store plain password", pwErr);
    }
  }

  // Profile update
  const profileUpdates: Record<string, unknown> = {};
  if (body.username !== undefined) profileUpdates.username = body.username.trim().toLowerCase();
  if (body.full_name !== undefined) profileUpdates.full_name = body.full_name;
  if (body.phone !== undefined) profileUpdates.phone = body.phone;
  if (body.cin !== undefined) profileUpdates.cin = body.cin;
  if (body.city !== undefined) profileUpdates.city = body.city;
  if (body.is_active !== undefined) profileUpdates.is_active = body.is_active;
  if (body.role && isAdmin) profileUpdates.role = body.role;
  if (body.bank_account_name !== undefined && isAdmin) profileUpdates.bank_account_name = body.bank_account_name;
  if (body.bank_account_number !== undefined && isAdmin) profileUpdates.bank_account_number = body.bank_account_number;
  if (body.agent_pages !== undefined) profileUpdates.agent_pages = body.agent_pages;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: pErr } = await admin.from("profiles").update(profileUpdates).eq("id", body.user_id);
    if (pErr) return json(400, { error: pErr.message });
  }

  // Sync user_roles if role changed (admin only)
  if (body.role && isAdmin) {
    await admin.from("user_roles").delete().eq("user_id", body.user_id);
    await admin.from("user_roles").insert({ user_id: body.user_id, role: body.role as any });
  }

  return json(200, { ok: true });
});
