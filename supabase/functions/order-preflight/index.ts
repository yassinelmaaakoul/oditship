import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type JsonRecord = Record<string, any>;

const GENERIC_SYSTEM_ERROR = "Un problème système est survenu. Veuillez contacter le support.";
const FIELD_LABELS: Record<string, string> = {
  customer_name: "Nom client",
  customer_phone: "Téléphone",
  customer_address: "Adresse",
  customer_city: "Ville",
  product_name: "Produit",
  order_value: "Prix",
};

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function getPath(obj: any, path?: string | null) {
  if (!path) return undefined;
  return path.split(".").reduce((acc: any, key) => acc?.[key], obj);
}

function alnumCount(value: unknown) {
  return String(value ?? "").replace(/[^\p{L}\p{N}]/gu, "").length;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeComparable(value: string) {
  return normalizeText(value).toLocaleLowerCase();
}

async function getEligibleCities(admin: any) {
  const [{ data: hubCities, error: citiesError }, { data: hubLivreurs, error: hubLivreursError }, { data: livreurs, error: livreursError }] = await Promise.all([
    admin.from("hub_cities").select("hub_id, city_name"),
    admin.from("hub_livreur").select("hub_id, livreur_id"),
    admin.from("profiles").select("id, full_name, username, is_active").eq("is_active", true),
  ]);

  if (citiesError || hubLivreursError || livreursError) throw new Error("configuration lookup failed");

  const activeLivreurIds = new Set((livreurs ?? []).map((livreur: JsonRecord) => livreur.id));
  const eligibleHubIds = new Set(
    (hubLivreurs ?? [])
      .filter((row: JsonRecord) => activeLivreurIds.has(row.livreur_id))
      .map((row: JsonRecord) => row.hub_id),
  );
  const seen = new Set<string>();

  return (hubCities ?? [])
    .filter((row: JsonRecord) => eligibleHubIds.has(row.hub_id))
    .map((row: JsonRecord) => normalizeText(String(row.city_name ?? "")))
    .filter((city: string) => {
      const key = normalizeComparable(city);
      if (!city || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

function validationError(field: string, message: string) {
  const label = FIELD_LABELS[field] ?? field;
  return Object.assign(new Error(`${label}: ${message}`), { field, label, publicMessage: `${label}: ${message}` });
}

function validateOrder(order: JsonRecord, rules: JsonRecord) {
  for (const [rawField, rule] of Object.entries(rules ?? {})) {
    // Accept both "customer_phone" and "order.customer_phone" path formats
    const field = rawField.startsWith("order.") ? rawField.slice(6) : rawField;
    const value = getPath(order, field);
    const isEmpty = value === undefined || value === null || String(value).trim() === "";
    if (rule?.required && isEmpty) throw validationError(field, `champ obligatoire`);
    if (isEmpty) continue;
    if (rule?.min_alnum && alnumCount(value) < Number(rule.min_alnum)) throw validationError(field, `minimum ${rule.min_alnum} lettres ou chiffres`);
    if (rule?.min_length && String(value ?? "").trim().length < Number(rule.min_length)) throw validationError(field, `minimum ${rule.min_length} caractères`);
    if (rule?.digits && String(value ?? "").replace(/\D/g, "").length !== Number(rule.digits)) throw validationError(field, `doit contenir ${rule.digits} chiffres`);
    if (rule?.min !== undefined && Number(value) < Number(rule.min)) throw validationError(field, `minimum ${rule.min}`);
    if (rule?.regex) {
      try {
        if (!new RegExp(String(rule.regex)).test(String(value))) throw validationError(field, `format invalide`);
      } catch (e) {
        if ((e as any)?.field) throw e;
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Session requise" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Session invalide" }, 401);

  let body: { action?: string; city?: string; order?: JsonRecord } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

  if (body.action === "list_cities") {
    try {
      const cities = await getEligibleCities(admin);
      return jsonResponse({ ok: true, cities });
    } catch {
      return jsonResponse({ error: GENERIC_SYSTEM_ERROR, code: "CONFIGURATION_ERROR" }, 500);
    }
  }

  const city = normalizeText(String(body.city || body.order?.customer_city || ""));
  if (!city) return jsonResponse({ error: "Ville obligatoire" }, 400);

  const { data: hubCity } = await admin.from("hub_cities").select("hub_id").ilike("city_name", city).limit(1).maybeSingle();
  if (!hubCity) return jsonResponse({ error: GENERIC_SYSTEM_ERROR, code: "CONFIGURATION_ERROR" }, 422);

  const { data: hubLivreur } = await admin.from("hub_livreur").select("livreur_id").eq("hub_id", hubCity.hub_id).maybeSingle();
  if (!hubLivreur?.livreur_id) return jsonResponse({ error: GENERIC_SYSTEM_ERROR, code: "CONFIGURATION_ERROR" }, 422);

  const [{ data: livreur }, { data: workflows }] = await Promise.all([
    admin.from("profiles").select("id, full_name, username, is_active").eq("id", hubLivreur.livreur_id).maybeSingle(),
    admin.from("livreur_workflows").select("settings, enabled").eq("livreur_id", hubLivreur.livreur_id).eq("enabled", true),
  ]);
  if (!livreur?.is_active) return jsonResponse({ error: GENERIC_SYSTEM_ERROR, code: "CONFIGURATION_ERROR" }, 422);

  // Aggregate validation rules from active workflows' settings.validation_rules
  const validationRules = (workflows ?? []).reduce((acc: any, wf: any) => ({ ...acc, ...(wf?.settings?.validation_rules ?? {}) }), {});

  try {
    if (body.order && Object.keys(validationRules).length > 0) validateOrder(body.order, validationRules);
  } catch (error) {
    const publicMessage = error && typeof error === "object" && "publicMessage" in error ? String((error as any).publicMessage) : "Commande non conforme aux règles du livreur";
    return jsonResponse({ error: publicMessage, code: "VALIDATION_ERROR", field: (error as any)?.field, label: (error as any)?.label }, 422);
  }

  return jsonResponse({ ok: true, livreur_id: livreur.id, livreur_name: livreur.full_name || livreur.username });
});