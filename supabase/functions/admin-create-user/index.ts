// Admin/vendeur user creation: creates auth user + ensures profile + role.
// Authorization:
//   - administrateur can create any role
//   - vendeur can only create role='agent' with agent_of = self

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROLES = [
  "superviseur","administrateur","vendeur","agent","ramassoire","magasinier",
  "support","suivi","comptable","livreur","commercial","gestion_retour",
];

interface Body {
  email: string;
  password: string;
  username: string;
  full_name?: string;
  phone?: string;
  cin?: string;
  city?: string;
  role: string;
  agent_of?: string | null;
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
  if (!body.email || !body.password || !body.username || !body.role) return json(400, { error: "email, password, username, role required" });
  if (!ROLES.includes(body.role)) return json(400, { error: "Invalid role" });
  if (body.password.length < 6) return json(400, { error: "Password too short" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // Authorize caller
  const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", callerId);
  const isAdmin = (callerRoles ?? []).some((r) => r.role === "administrateur");
  if (!isAdmin) {
    // Vendeur can create only agents under themselves
    const isVendeur = (callerRoles ?? []).some((r) => r.role === "vendeur");
    if (!isVendeur || body.role !== "agent" || body.agent_of !== callerId) {
      return json(403, { error: "Forbidden" });
    }
  }

  // Create auth user (auto-confirmed since signups are open and we want immediate login)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      username: body.username,
      role: body.role,
      full_name: body.full_name ?? null,
      phone: body.phone ?? null,
      cin: body.cin ?? null,
      city: body.city ?? null,
    },
  });

  if (createErr || !created.user) return json(400, { error: createErr?.message || "Could not create user" });
  const uid = created.user.id;

  // handle_new_user trigger should have created profile + user_roles. Patch missing fields & role/agent_of.
  await admin.from("profiles").upsert({
    id: uid,
    username: body.username.toLowerCase(),
    role: body.role,
    full_name: body.full_name ?? null,
    phone: body.phone ?? null,
    cin: body.cin ?? null,
    city: body.city ?? null,
    agent_of: body.agent_of ?? null,
    is_active: body.is_active ?? true,
    agent_pages: body.role === "agent" ? (body.agent_pages ?? null) : null,
    bank_account_name: isAdmin ? (body.bank_account_name ?? null) : null,
    bank_account_number: isAdmin ? (body.bank_account_number ?? null) : null,
  }, { onConflict: "id" });

  // Ensure role row exists with the requested role
  await admin.from("user_roles").upsert({ user_id: uid, role: body.role as any }, { onConflict: "user_id,role" });

  // Store plain password for admin reference (only admins can read this table via RLS)
  const { error: pwErr } = await admin.from("plain_passwords").upsert({ user_id: uid, password: body.password, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (pwErr) console.error("Failed to store plain password", pwErr);

  return json(200, { ok: true, user_id: uid });
});
