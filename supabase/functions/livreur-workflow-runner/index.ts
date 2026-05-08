import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Json = Record<string, any>;

const json = (b: Json, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function getPath(obj: any, path?: string | null) {
  if (!path) return undefined;
  return String(path).split(".").reduce((a: any, k) => a?.[k], obj);
}

function setPath(obj: Json, path: string, value: unknown) {
  const keys = path.split(".").filter(Boolean);
  if (!keys.length) return;
  let cur = obj;
  keys.slice(0, -1).forEach((k) => {
    if (!cur[k] || typeof cur[k] !== "object" || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = value;
}

function resolveExpression(expr: string, ctx: Json): any {
  // Built-ins
  if (expr === "$now") return new Date().toISOString();
  if (expr === "$timestamp") return Date.now();
  if (expr === "$uuid") return crypto.randomUUID();
  if (expr === "$random") return Math.random();
  if (expr.startsWith("$secret.")) return Deno.env.get(expr.slice(8)) ?? "";
  if (expr.startsWith("$env.")) return Deno.env.get(expr.slice(5)) ?? "";
  return getPath(ctx, expr);
}

function interpolate(input: any, ctx: Json): any {
  if (Array.isArray(input)) return input.map((i) => interpolate(i, ctx));
  if (input && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, interpolate(v, ctx)]));
  }
  if (typeof input !== "string") return input;
  // exact match {{ ... }} → preserve original type
  const exact = input.match(/^\{\{\s*([^}]+)\s*\}\}$/);
  if (exact) return resolveExpression(exact[1].trim(), ctx);
  if (input.includes("{{")) {
    return input.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, e) => {
      const v = resolveExpression(e.trim(), ctx);
      return v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    });
  }
  return input;
}

function maskHeaders(h: Json = {}) {
  return Object.fromEntries(
    Object.entries(h).map(([k, v]) => {
      const n = k.toLowerCase();
      if (n.includes("auth") || n.includes("token") || n.includes("secret") || n.includes("key")) {
        const t = String(v ?? "");
        return [k, t ? `${t.slice(0, 6)}••••${t.slice(-4)}` : "••••"];
      }
      return [k, v];
    })
  );
}

function evalCondition(cond: Json, ctx: Json): boolean {
  if (!cond || !cond.left) return true;
  const left = interpolate(cond.left, ctx);
  const right = interpolate(cond.right, ctx);
  const op = cond.operator || "eq";
  switch (op) {
    case "eq": return left == right;
    case "neq": return left != right;
    case "gt": return Number(left) > Number(right);
    case "gte": return Number(left) >= Number(right);
    case "lt": return Number(left) < Number(right);
    case "lte": return Number(left) <= Number(right);
    case "contains": return String(left ?? "").includes(String(right ?? ""));
    case "starts_with": return String(left ?? "").startsWith(String(right ?? ""));
    case "exists": return left !== undefined && left !== null && left !== "";
    case "is_empty": return left === undefined || left === null || left === "";
    case "regex": try { return new RegExp(String(right)).test(String(left ?? "")); } catch { return false; }
    default: return false;
  }
}

function evalConditions(group: Json, ctx: Json): boolean {
  if (!group) return true;
  const conditions: Json[] = group.conditions || [];
  if (!conditions.length) return true;
  const mode = group.mode === "any" ? "any" : "all";
  return mode === "all"
    ? conditions.every((c) => evalCondition(c, ctx))
    : conditions.some((c) => evalCondition(c, ctx));
}

async function runHttpStep(step: Json, ctx: Json) {
  const config = step.config || {};
  const url = interpolate(config.url, ctx);
  const method = String(config.method || "POST").toUpperCase();
  const headers = interpolate(config.headers || {}, ctx);
  let body: any = null;
  if (method !== "GET" && method !== "HEAD") {
    if (config.body_type === "raw" || typeof config.body === "string") {
      const raw = interpolate(config.body, ctx);
      body = typeof raw === "string" ? raw : JSON.stringify(raw);
    } else {
      body = JSON.stringify(interpolate(config.body || {}, ctx));
    }
  }
  const reqHeaders: Json = { "Content-Type": "application/json", ...headers };
  const started = Date.now();
  const res = await fetch(url, { method, headers: reqHeaders, body });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  const exchange = {
    request: { method, url, headers: maskHeaders(reqHeaders), body: body ? safeParse(body) : null },
    response: { status: res.status, ok: res.ok, headers: maskHeaders(Object.fromEntries(res.headers.entries())), body: parsed },
    duration_ms: Date.now() - started,
  };
  if (!res.ok && !config.continue_on_error) {
    const err: any = new Error(`HTTP ${res.status}: ${typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed).slice(0, 200)}`);
    err.exchange = exchange;
    throw err;
  }
  return { output: parsed, exchange };
}

function safeParse(s: string) { try { return JSON.parse(s); } catch { return s; } }

async function runStep(step: Json, ctx: Json, admin: any): Promise<{ output: any; log: Json }> {
  const log: Json = { id: step.id, name: step.name, type: step.type, started_at: new Date().toISOString() };
  try {
    // condition gate
    if (step.condition && !evalConditions(step.condition, ctx)) {
      log.status = "skipped";
      log.reason = "condition_false";
      log.finished_at = new Date().toISOString();
      return { output: null, log };
    }
    let output: any = null;
    const retry = step.retry || {};
    const maxAttempts = Math.max(1, Number(retry.max_attempts) || 1);
    const backoff = Math.max(0, Number(retry.backoff_ms) || 0);
    let lastErr: any = null;
    let exchanges: any[] = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (step.type === "http") {
          const r = await runHttpStep(step, ctx);
          output = r.output;
          exchanges.push({ attempt, ...r.exchange });
        } else if (step.type === "delay") {
          const ms = Number(interpolate(step.config?.ms, ctx) || 1000);
          await new Promise((r) => setTimeout(r, ms));
          output = { delayed_ms: ms };
        } else if (step.type === "set_variable") {
          const v: Json = {};
          for (const [k, expr] of Object.entries(step.config?.values || {})) v[k] = interpolate(expr, ctx);
          ctx.vars = { ...(ctx.vars || {}), ...v };
          output = v;
        } else if (step.type === "update_order") {
          const oid = ctx.order?.id ?? interpolate(step.config?.order_id, ctx);
          const updates: Json = {};
          for (const [k, expr] of Object.entries(step.config?.updates || {})) updates[k] = interpolate(expr, ctx);
          if (oid) {
            const { data, error } = await admin.from("orders").update(updates).eq("id", oid).select().single();
            if (error) throw new Error(`update_order: ${error.message}`);
            output = data;
            ctx.order = data;
          }
        } else if (step.type === "log_status") {
          const oid = ctx.order?.id;
          if (oid) {
            await admin.from("order_status_history").insert({
              order_id: oid,
              old_status: interpolate(step.config?.old_status, ctx) ?? ctx.order?.status,
              new_status: interpolate(step.config?.new_status, ctx),
              notes: interpolate(step.config?.note, ctx),
            });
          }
          output = { logged: true };
        } else if (step.type === "find_order") {
          // Find an order by a field (default: external_tracking_number) and load into ctx.order
          const field = String(step.config?.field || "external_tracking_number");
          const value = interpolate(step.config?.value, ctx);
          if (value === undefined || value === null || value === "") throw new Error(`find_order: empty value for ${field}`);
          const { data, error } = await admin.from("orders").select("*").eq(field, value).order("id", { ascending: false }).limit(1).maybeSingle();
          if (error) throw new Error(`find_order: ${error.message}`);
          if (!data) {
            if (step.config?.optional) { output = { found: false }; }
            else throw new Error(`find_order: no order with ${field}=${value}`);
          } else {
            ctx.order = data;
            output = { found: true, order_id: data.id };
          }
        } else if (step.type === "find_active_orders") {
          // Query DB for orders matching filters; return as array (use with for_each)
          const cfg = step.config || {};
          const exclude: string[] = Array.isArray(cfg.exclude_statuses) && cfg.exclude_statuses.length
            ? cfg.exclude_statuses
            : ["Crée", "Confirmé", "Pickup"];
          const includeStatuses: string[] = Array.isArray(cfg.include_statuses) ? cfg.include_statuses : [];
          const trackingField = String(cfg.tracking_field || "external_tracking_number");
          const requireTracking = cfg.require_tracking !== false;
          const limit = Math.min(Math.max(Number(cfg.limit) || 100, 1), 500);
          let q: any = admin.from("orders").select("*");
          if (requireTracking) q = q.not(trackingField, "is", null).neq(trackingField, "");
          if (exclude.length) q = q.not("status", "in", `(${exclude.map((s) => `"${s}"`).join(",")})`);
          if (includeStatuses.length) q = q.in("status", includeStatuses);
          if (cfg.livreur_scope === "workflow") {
            const wfLivreur = (ctx as any).workflow_livreur_id;
            if (wfLivreur) q = q.eq("assigned_livreur_id", wfLivreur);
          }
          q = q.order("updated_at", { ascending: false }).limit(limit);
          const { data, error } = await q;
          if (error) throw new Error(`find_active_orders: ${error.message}`);
          output = data || [];
        } else if (step.type === "extract") {
          const result: Json = {};
          for (const [k, p] of Object.entries(step.config?.fields || {})) result[k] = getPath(ctx, String(p));
          output = result;
        } else if (step.type === "validate") {
          const rules: Json = step.config?.rules || {};
          for (const [field, rule] of Object.entries(rules) as [string, any][]) {
            const v = getPath(ctx, field);
            if (rule.required && (v === undefined || v === null || v === "")) throw new Error(`Validation: ${field} is required`);
            if (rule.min_length && String(v ?? "").length < Number(rule.min_length)) throw new Error(`Validation: ${field} min length ${rule.min_length}`);
            if (rule.regex && !(new RegExp(rule.regex).test(String(v ?? "")))) throw new Error(`Validation: ${field} invalid format`);
          }
          output = { valid: true };
        } else if (step.type === "map_value") {
          const cfg = step.config || {};
          const v = interpolate(cfg.value, ctx);
          const key = String(v ?? "");
          const mapping: Json = cfg.mapping || {};
          const def = cfg.default !== undefined && cfg.default !== null && cfg.default !== ""
            ? interpolate(cfg.default, ctx)
            : v;
          const mapped = Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : def;
          if (cfg.output_var) {
            ctx.vars = { ...(ctx.vars || {}), [cfg.output_var]: mapped };
          }
          output = { input: v, mapped };
        } else if (step.type === "for_each") {
          const cfg = step.config || {};
          const itemsRaw = interpolate(cfg.items, ctx);
          const itemVar = cfg.item_var || "item";
          const indexVar = cfg.index_var || "index";
          const subSteps: Json[] = cfg.steps || [];
          let arr: any[] = [];
          if (Array.isArray(itemsRaw)) arr = itemsRaw;
          else if (itemsRaw && typeof itemsRaw === "object") arr = Object.values(itemsRaw);
          const maxIter = Math.min(arr.length, Number(cfg.max_iterations) || 500);
          const iterations: Json[] = [];
          const savedOrder = ctx.order;
          const savedItem = (ctx as any)[itemVar];
          const savedIndex = (ctx as any)[indexVar];
          for (let i = 0; i < maxIter; i++) {
            (ctx as any)[itemVar] = arr[i];
            (ctx as any)[indexVar] = i;
            ctx.order = savedOrder;
            delete (ctx as any).__filter_stop;
            const itemLogs: Json[] = [];
            let iterErr: string | null = null;
            try {
              for (const sub of subSteps) {
                if (sub.enabled === false) {
                  itemLogs.push({ id: sub.id, name: sub.name, type: sub.type, status: "disabled" });
                  continue;
                }
                const { log: subLog } = await runStep(sub, ctx, admin);
                itemLogs.push(subLog);
                if ((ctx as any).__filter_stop) break;
              }
            } catch (e: any) {
              iterErr = e?.message || String(e);
              if (cfg.on_iteration_error === "stop") {
                iterations.push({ index: i, item: arr[i], logs: itemLogs, error: iterErr });
                throw e;
              }
            }
            iterations.push({ index: i, item: arr[i], logs: itemLogs, error: iterErr });
          }
          (ctx as any)[itemVar] = savedItem;
          (ctx as any)[indexVar] = savedIndex;
          ctx.order = savedOrder;
          delete (ctx as any).__filter_stop;
          output = { count: arr.length, executed: iterations.length, iterations };
        } else if (step.type === "loop") {
          const cfg = step.config || {};
          const times = Math.max(0, Math.min(Number(interpolate(cfg.times, ctx)) || 0, 1000));
          const indexVar = cfg.index_var || "i";
          const subSteps: Json[] = cfg.steps || [];
          const iterations: Json[] = [];
          const savedIndex = (ctx as any)[indexVar];
          for (let i = 0; i < times; i++) {
            (ctx as any)[indexVar] = i;
            delete (ctx as any).__filter_stop;
            const itemLogs: Json[] = [];
            try {
              for (const sub of subSteps) {
                if (sub.enabled === false) continue;
                const { log: subLog } = await runStep(sub, ctx, admin);
                itemLogs.push(subLog);
                if ((ctx as any).__filter_stop) break;
              }
            } catch (e: any) {
              iterations.push({ index: i, logs: itemLogs, error: e?.message || String(e) });
              if (cfg.on_iteration_error === "stop") throw e;
              continue;
            }
            iterations.push({ index: i, logs: itemLogs });
          }
          (ctx as any)[indexVar] = savedIndex;
          delete (ctx as any).__filter_stop;
          output = { times, iterations };
        } else if (step.type === "filter") {
          const cfg = step.config || {};
          const ok = evalConditions({ mode: cfg.mode, conditions: cfg.conditions }, ctx);
          output = { passed: ok };
          if (!ok) {
            const onFalse = cfg.on_false || "stop";
            if (onFalse === "fail") throw new Error(`Filter "${step.name}" non satisfait`);
            // stop / skip_rest → mark step as filtered and stop the loop gracefully
            log.status = "filtered";
            log.output = output;
            log.finished_at = new Date().toISOString();
            if (step.id) ctx.steps = { ...(ctx.steps || {}), [step.id]: output };
            (ctx as any).__filter_stop = true;
            return { output, log };
          }
        } else {
          throw new Error(`Unknown step type: ${step.type}`);
        }
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, backoff * attempt));
      }
    }
    if (lastErr) throw lastErr;
    log.status = "success";
    log.output = output;
    if (exchanges.length) log.exchanges = exchanges;
    // Save output to context under step.id
    if (step.id) ctx.steps = { ...(ctx.steps || {}), [step.id]: output };
    log.finished_at = new Date().toISOString();
    return { output, log };
  } catch (e: any) {
    log.status = "failed";
    log.error = e?.message || String(e);
    if (e?.exchange) log.exchange = e.exchange;
    log.finished_at = new Date().toISOString();
    if (step.on_error === "continue") return { output: null, log };
    throw e;
  }
}

async function runWorkflow(workflow: Json, ctx: Json, admin: any, opts: { isTest?: boolean; triggerType: string; triggerPayload?: Json } = { triggerType: "manual" }) {
  const startedAt = Date.now();
  const stepResults: Json[] = [];
  let status: "success" | "failed" = "success";
  let errorMessage: string | null = null;
  // initialize ctx with workflow variables
  ctx.vars = { ...(workflow.variables || {}), ...(ctx.vars || {}) };
  ctx.steps = {};
  (ctx as any).workflow_livreur_id = workflow.livreur_id;
  try {
    for (const step of workflow.steps || []) {
      if (step.enabled === false) {
        stepResults.push({ id: step.id, name: step.name, type: step.type, status: "disabled" });
        continue;
      }
      const { log } = await runStep(step, ctx, admin);
      stepResults.push(log);
      if ((ctx as any).__filter_stop) break;
    }
  } catch (e: any) {
    status = "failed";
    errorMessage = e?.message || String(e);
  }
  const finished = Date.now();
  const run = {
    workflow_id: workflow.id,
    livreur_id: workflow.livreur_id,
    order_id: ctx.order?.id ?? null,
    trigger_type: opts.triggerType,
    trigger_payload: opts.triggerPayload || {},
    status,
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(finished).toISOString(),
    duration_ms: finished - startedAt,
    step_results: stepResults,
    error_message: errorMessage,
    output: ctx.steps,
    is_test: !!opts.isTest,
  };
  if (!opts.isTest || opts.isTest === false) {
    await admin.from("livreur_workflow_runs").insert(run);
  }
  return run;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  const userClient = authHeader ? createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }) : null;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  // Detect path-based webhook: /livreur-workflow-runner/webhook/{livreur_id}
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const wIdx = parts.indexOf("webhook");
  const pathLivreurId = wIdx >= 0 ? parts[wIdx + 1] : null;

  let body: Json;
  try { body = await req.json(); } catch { body = {}; }

  let action = body.action || (pathLivreurId ? "webhook" : "run");
  if (pathLivreurId && !body.livreur_id) body.livreur_id = pathLivreurId;
  if (pathLivreurId) { action = "webhook"; body.payload = body; }


  // Auth check (optional for cron, required for user actions)
  let userId: string | null = null;
  if (userClient) {
    const { data: u } = await userClient.auth.getUser();
    userId = u?.user?.id ?? null;
  }

  try {
    if (action === "test_step") {
      // run a single step in isolation for testing
      const step = body.step;
      const ctx = body.context || {};
      const { log } = await runStep(step, ctx, admin);
      return json({ ok: true, log });
    }

    if (action === "test_workflow" || action === "run") {
      let workflow = body.workflow;
      if (!workflow && body.workflow_id) {
        const { data } = await admin.from("livreur_workflows").select("*").eq("id", body.workflow_id).single();
        workflow = data;
      }
      if (!workflow) return json({ error: "workflow required" }, 400);

      let order: Json | null = body.order || null;
      if (!order && body.order_id) {
        const { data } = await admin.from("orders").select("*").eq("id", body.order_id).single();
        order = data;
      }
      const ctx: Json = { order, trigger: body.trigger_payload || {}, user_id: userId };
      const run = await runWorkflow(workflow, ctx, admin, {
        isTest: action === "test_workflow",
        triggerType: body.trigger_type || (action === "test_workflow" ? "test" : "manual"),
        triggerPayload: body.trigger_payload,
      });
      return json({ ok: run.status === "success", run });
    }

    if (action === "trigger_event" || action === "webhook") {
      // For webhook: validate token
      const livreurId = body.livreur_id;
      let event = body.event;
      let webhookPayload: Json | null = null;
      if (action === "webhook") {
        event = "webhook";
        const auth = req.headers.get("Authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!livreurId || !token) return json({ error: "livreur_id + bearer token required" }, 401);
        const { data: prof } = await admin.from("profiles").select("api_token").eq("id", livreurId).maybeSingle();
        if (!prof || prof.api_token !== token) return json({ error: "Invalid credentials" }, 401);
        webhookPayload = body.payload || body;
      }
      const order = body.order;
      const { data: workflows } = await admin
        .from("livreur_workflows")
        .select("*")
        .eq("livreur_id", livreurId)
        .eq("enabled", true);
      const matching = (workflows || []).filter((wf: Json) => {
        const triggers: Json[] = wf.triggers || [];
        return triggers.some((t) => {
          if (t.enabled === false) return false;
          if (t.type !== event) return false;
          if (event === "order_status_changed") {
            const from = t.from_status;
            const to = t.to_status;
            if (from && body.from_status && from !== body.from_status) return false;
            if (to && body.to_status && to !== body.to_status) return false;
          }
          return true;
        });
      });
      const runs = [];
      for (const wf of matching) {
        const ctx: Json = { order, trigger: body, user_id: userId, webhook: webhookPayload };
        const r = await runWorkflow(wf, ctx, admin, { triggerType: event, triggerPayload: body });
        runs.push(r);
      }
      return json({ ok: true, executed: runs.length, runs });
    }

    if (action === "scheduled_tick") {
      // Called by cron every minute
      // Auto-cleanup old runs/logs based on app_settings.api_logs_retention
      try {
        const { data: setting } = await admin.from("app_settings").select("value").eq("key", "api_logs_retention").maybeSingle();
        const v = (setting?.value || {}) as any;
        if (v?.enabled) {
          const hours = Math.max(Number(v.hours) || 72, 1);
          const cutoff = new Date(Date.now() - hours * 3600000).toISOString();
          await admin.from("livreur_workflow_runs").delete().lt("started_at", cutoff);
          await admin.from("livreur_api_logs").delete().lt("created_at", cutoff);
        }
      } catch (_e) { /* ignore cleanup errors */ }

      const { data: workflows } = await admin.from("livreur_workflows").select("*").eq("enabled", true);
      const now = new Date();
      let executed = 0;
      for (const wf of workflows || []) {
        for (const trigger of (wf.triggers || []) as Json[]) {
          if (trigger.enabled === false) continue;
          if (trigger.type !== "schedule" && trigger.type !== "recurring") continue;
          const key = `${trigger.type}:${trigger.id || trigger.name || "default"}`;
          const { data: sched } = await admin
            .from("livreur_workflow_schedules")
            .select("*")
            .eq("workflow_id", wf.id)
            .eq("trigger_key", key)
            .maybeSingle();
          let shouldRun = false;
          if (trigger.type === "schedule") {
            const at = trigger.scheduled_at ? new Date(trigger.scheduled_at) : null;
            if (at && now >= at && !sched?.last_run_at) shouldRun = true;
          } else if (trigger.type === "recurring") {
            const interval = Number(trigger.interval_value || 0);
            const unit = trigger.interval_unit || "minutes";
            const mult = unit === "seconds" ? 1000 : unit === "minutes" ? 60000 : unit === "hours" ? 3600000 : 86400000;
            const ms = interval * mult;
            if (!sched?.last_run_at) shouldRun = true;
            else if (now.getTime() - new Date(sched.last_run_at).getTime() >= ms) shouldRun = true;
          }
          if (shouldRun) {
            const ctx: Json = { trigger };
            try {
              const r = await runWorkflow(wf, ctx, admin, { triggerType: trigger.type, triggerPayload: trigger });
              executed++;
              await admin.from("livreur_workflow_schedules").upsert({
                workflow_id: wf.id,
                trigger_key: key,
                last_run_at: new Date().toISOString(),
                last_status: r.status,
                last_message: r.error_message,
                updated_at: new Date().toISOString(),
              }, { onConflict: "workflow_id,trigger_key" });
            } catch (e: any) {
              await admin.from("livreur_workflow_schedules").upsert({
                workflow_id: wf.id,
                trigger_key: key,
                last_run_at: new Date().toISOString(),
                last_status: "failed",
                last_message: e?.message,
                updated_at: new Date().toISOString(),
              }, { onConflict: "workflow_id,trigger_key" });
            }
          }
        }
      }
      return json({ ok: true, executed });
    }

    if (action === "import_curl") {
      // Parse cURL → step config
      const curl = String(body.curl || "");
      const parsed = parseCurl(curl);
      return json({ ok: true, config: parsed });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    return json({ error: e?.message || "Internal error" }, 500);
  }
});

function parseCurl(input: string): Json {
  // Strip backslash line continuations
  const text = input.replace(/\\\r?\n/g, " ").trim();
  // Tokenize respecting quotes
  const tokens: string[] = [];
  let cur = ""; let q: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === q) { q = null; tokens.push(cur); cur = ""; }
      else cur += c;
    } else if (c === '"' || c === "'") { q = c; }
    else if (/\s/.test(c)) { if (cur) { tokens.push(cur); cur = ""; } }
    else cur += c;
  }
  if (cur) tokens.push(cur);

  const result: Json = { method: "GET", url: "", headers: {}, body: null };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "curl") continue;
    if (t === "-X" || t === "--request") { result.method = (tokens[++i] || "GET").toUpperCase(); }
    else if (t === "-H" || t === "--header") {
      const h = tokens[++i] || "";
      const idx = h.indexOf(":");
      if (idx > 0) result.headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    }
    else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      result.body = tokens[++i] || "";
      if (result.method === "GET") result.method = "POST";
    }
    else if (t === "-u" || t === "--user") {
      const u = tokens[++i] || "";
      result.headers["Authorization"] = "Basic " + btoa(u);
    }
    else if (t === "--url") { result.url = tokens[++i] || ""; }
    else if (!t.startsWith("-") && !result.url) { result.url = t; }
  }
  // Try to parse body as JSON for prettier display
  if (typeof result.body === "string") {
    try { result.body = JSON.parse(result.body); result.body_type = "json"; }
    catch { result.body_type = "raw"; }
  }
  return result;
}
