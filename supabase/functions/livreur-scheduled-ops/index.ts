import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Json = Record<string, any>;

function getPath(obj: any, path?: string | null) {
  if (!path) return undefined;
  return path.split(".").reduce((acc: any, k) => acc?.[k], obj);
}

function resolveTemplate(input: unknown, ctx: Json): any {
  if (typeof input !== "string") return input;
  if (input.startsWith("secret:")) return Deno.env.get(input.slice(7)) ?? "";
  const exact = input.match(/^\{\{\s*([^}]+)\s*\}\}$/);
  if (exact) {
    const path = exact[1];
    if (path.startsWith("secret.")) return Deno.env.get(path.slice(7)) ?? "";
    return getPath(ctx, path);
  }
  if (input.includes("{{")) {
    return input.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, p) => {
      if (p.startsWith("secret.")) return Deno.env.get(p.slice(7)) ?? "";
      return String(getPath(ctx, p) ?? "");
    });
  }
  return input;
}

function renderObject(value: any, ctx: Json): any {
  if (Array.isArray(value)) return value.map((i) => renderObject(i, ctx));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renderObject(v, ctx)]));
  }
  return resolveTemplate(value, ctx);
}

function buildPayload(mapping: Json, ctx: Json) {
  const out: Json = {};
  for (const [k, v] of Object.entries(mapping ?? {})) {
    const keys = k.split(".").filter(Boolean);
    let cur = out;
    keys.slice(0, -1).forEach((kk) => {
      if (!cur[kk] || typeof cur[kk] !== "object") cur[kk] = {};
      cur = cur[kk];
    });
    cur[keys[keys.length - 1]] = resolveTemplate(v, ctx);
  }
  return out;
}

function intervalMs(op: Json): number {
  const v = Number(op.interval_value ?? 60);
  const u = String(op.interval_unit ?? "minutes");
  const mult = u === "days" ? 86400000 : u === "hours" ? 3600000 : 60000;
  return Math.max(v, 1) * mult;
}

function opKey(op: Json, idx: number): string {
  return String(op.id ?? op.name ?? `op_${idx}`);
}

async function executeOp(op: Json, ctx: Json) {
  const url = resolveTemplate(op.url, ctx);
  if (!url) throw new Error("URL missing");
  const method = String(op.method || "POST").toUpperCase();
  const headers = renderObject(op.headers ?? {}, ctx);
  const payload = op.payload
    ? renderObject(op.payload, ctx)
    : buildPayload(op.payload_mapping ?? {}, ctx);
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: method === "GET" ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, body: text.slice(0, 1000) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const { data: livreurs } = await admin
    .from("profiles")
    .select("id, api_enabled, create_package_config, authentication_config")
    .eq("api_enabled", true);

  const results: any[] = [];

  for (const lv of livreurs ?? []) {
    const cfg: any = lv.create_package_config;
    const ops: any[] = Array.isArray(cfg)
      ? (cfg[0]?.operations ?? [])
      : (cfg?.operations ?? []);
    const scheduledOps = ops
      .map((op, idx) => ({ op, idx }))
      .filter(({ op }) => op?.enabled !== false && (op?.trigger === "scheduled" || op?.trigger === "recurring"));

    if (!scheduledOps.length) continue;

    const { data: runs } = await admin
      .from("livreur_scheduled_runs")
      .select("*")
      .eq("livreur_id", lv.id);
    const runMap = new Map((runs ?? []).map((r: any) => [r.operation_key, r]));

    for (const { op, idx } of scheduledOps) {
      const key = opKey(op, idx);
      const existing: any = runMap.get(key);
      let shouldRun = false;
      let nextRun: Date | null = null;

      if (op.trigger === "scheduled") {
        const due = op.scheduled_at ? new Date(op.scheduled_at) : null;
        if (due && due <= now && !existing?.last_run_at) shouldRun = true;
      } else {
        // recurring
        const ms = intervalMs(op);
        if (!existing?.last_run_at) {
          shouldRun = true;
        } else {
          const last = new Date(existing.last_run_at);
          if (now.getTime() - last.getTime() >= ms) shouldRun = true;
        }
        nextRun = new Date(now.getTime() + ms);
      }

      if (!shouldRun) continue;

      let status = "success";
      let message = "OK";
      try {
        await executeOp(op, { livreur: { id: lv.id }, now: now.toISOString() });
      } catch (e) {
        status = "failed";
        message = e instanceof Error ? e.message : String(e);
      }

      await admin.from("livreur_scheduled_runs").upsert(
        {
          livreur_id: lv.id,
          operation_key: key,
          trigger: op.trigger,
          last_run_at: now.toISOString(),
          last_status: status,
          last_message: message.slice(0, 500),
          next_run_at: nextRun?.toISOString() ?? null,
        },
        { onConflict: "livreur_id,operation_key" },
      );

      await admin.from("livreur_api_logs").insert({
        livreur_id: lv.id,
        event_type: "scheduled_op",
        status,
        message: `[${op.trigger}] ${op.name ?? key}: ${message}`.slice(0, 500),
        details: { op_key: key, trigger: op.trigger, url: op.url },
      });

      results.push({ livreur: lv.id, key, status });
    }
  }

  return new Response(JSON.stringify({ ok: true, executed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
