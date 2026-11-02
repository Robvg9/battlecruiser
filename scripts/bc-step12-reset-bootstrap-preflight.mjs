#!/usr/bin/env node
"use strict";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const root = process.env.BC_BACKUP_ROOT || "";
const dbUrl = process.env.DB_URL || process.env.LOCAL_DB_URL || "";
const apiUrl = (process.env.API_URL || "").replace(/\/+$/, "");
const serviceKey = process.env.SERVICE_ROLE_KEY || "";
const cli = process.env.SUPABASE_CLI_BIN || "";
const pgImage = "postgres:17.6-alpine";
const workspace = process.cwd();

function requireLocalTarget() {
  if (!root || !dbUrl || !apiUrl || !serviceKey) throw new Error("STEP12_LOCAL_ENV_MISSING");
  const parsed = new URL(dbUrl);
  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (!localHosts.has(parsed.hostname) || parsed.port !== "54322") {
    throw new Error("STEP12_TARGET_GUARD_FAIL; refusing to test against a non-loopback database");
  }
  const api = new URL(apiUrl);
  if (!localHosts.has(api.hostname) || api.port !== "54321") {
    throw new Error("STEP12_API_GUARD_FAIL; refusing to call a non-local Auth API");
  }
  if (!fs.existsSync(path.join(root, "restored", "manifest.json"))) {
    throw new Error("STEP12_RESTORE_MANIFEST_MISSING");
  }
  if (!fs.existsSync(cli)) throw new Error("STEP12_SUPABASE_CLI_MISSING");
}

function connectionEnv() {
  const u = new URL(dbUrl);
  if (!["postgres:", "postgresql:"].includes(u.protocol)) throw new Error("STEP12_DATABASE_URI_INVALID");
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")),
    PGSSLMODE: "disable",
    PGCONNECT_TIMEOUT: "15",
  };
}

const dbEnv = connectionEnv();

function dockerArgs(args) {
  return [
    "run", "--rm", "--network", "host",
    "--volume", `${root}:/backup`,
    "--volume", `${workspace}:/workspace:ro`,
    "--env", "PGHOST", "--env", "PGPORT", "--env", "PGUSER",
    "--env", "PGPASSWORD", "--env", "PGDATABASE",
    "--env", "PGSSLMODE", "--env", "PGCONNECT_TIMEOUT",
    pgImage, ...args,
  ];
}

function runPsql(args, label) {
  const result = spawnSync("docker", dockerArgs([
    "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", ...args,
  ]), { encoding: "utf8", env: dbEnv, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const safe = String(result.stderr || result.error?.message || "psql failed")
      .split("\n").filter(Boolean).slice(-8).join(" | ");
    throw new Error(`${label}=FAIL; exit=${result.status ?? "spawn"}; ${safe.slice(0,1200)}`);
  }
  return String(result.stdout || "").trim();
}

function runPsqlFile(file, vars, label) {
  const args = [];
  for (const [key, value] of Object.entries(vars || {})) args.push("-v", `${key}=${value}`);
  args.push("-f", `/workspace/${file}`);
  return runPsql(args, label);
}

function spawnPsql(args, label) {
  const child = spawn("docker", dockerArgs([
    "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", ...args,
  ]), { env: dbEnv, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let stdout = "";
  let stderr = "";
  let closed = false;
  let code = null;
  let closeResolve;
  const closedPromise = new Promise(resolve => { closeResolve = resolve; });
  let outputWaiters = [];
  child.stdout.on("data", chunk => {
    stdout += String(chunk);
    const remaining = [];
    for (const waiter of outputWaiters) {
      if (stdout.includes(waiter.marker)) waiter.resolve();
      else remaining.push(waiter);
    }
    outputWaiters = remaining;
  });
  child.stderr.on("data", chunk => { stderr += String(chunk); });
  child.on("error", error => {
    stderr += String(error?.message || error);
  });
  child.on("close", exitCode => {
    closed = true;
    code = exitCode;
    closeResolve();
    for (const waiter of outputWaiters) waiter.reject(new Error(`${label}=FAIL; exited before lock marker`));
    outputWaiters = [];
  });
  return {
    async waitFor(marker) {
      if (stdout.includes(marker)) return;
      if (closed) throw new Error(`${label}=FAIL; exited before lock marker`);
      await new Promise((resolve,reject) => outputWaiters.push({marker,resolve,reject}));
    },
    async result() {
      await closedPromise;
      if (code !== 0) {
        const safe = stderr.split("\n").filter(Boolean).slice(-8).join(" | ");
        throw new Error(`${label}=FAIL; exit=${code}; ${safe.slice(0,1200)}`);
      }
      return stdout.trim();
    },
  };
}

function lastJson(output, label) {
  const lines = output.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  throw new Error(`${label}=FAIL; no JSON response`);
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

async function createSyntheticAuthUser(email, password) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { bc_step12_synthetic_fixture: true } }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error(`STEP12_SYNTHETIC_AUTH_CREATE=FAIL; HTTP ${response.status}`);
  return data.id;
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function startLocalBootstrapEdge(token) {
  const entry = path.join(workspace,"supabase","functions","bc-bootstrap-admin","index.ts");
  if (!fs.existsSync(entry)) throw new Error("STEP12_BOOTSTRAP_EDGE_FILE_MISSING");
  const edgeEnv = {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    SUPABASE_URL: apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    BC_BOOTSTRAP_TOKEN: token,
  };
  if (process.env.DENO_DIR) edgeEnv.DENO_DIR = process.env.DENO_DIR;
  const child = spawn("deno",["run","--allow-net","--allow-env","--allow-read",entry],{
    env: edgeEnv, stdio: ["ignore","ignore","pipe"], windowsHide: true
  });
  let stderr = "";
  child.stderr.on("data",chunk => { stderr += String(chunk); });
  child.on("error",error => { stderr += String(error?.message || error); });
  const probeUrl = "http://127.0.0.1:8000/";
  for (let i=0;i<120;i++) {
    if (child.exitCode !== null || child.signalCode !== null) break;
    try {
      const probe = await fetch(probeUrl,{method:"OPTIONS",headers:{origin:"https://battlecruiser.robvg9.workers.dev"}});
      if (probe.status === 204) return child;
    } catch {}
    await delay(250);
  }
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  throw new Error("STEP12_BOOTSTRAP_EDGE_START=FAIL; local Deno endpoint did not become ready");
}

async function stopLocalBootstrapEdge(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve=>child.once("exit",resolve)),delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function callLocalBootstrapEdge(token, body, origin = "https://battlecruiser.robvg9.workers.dev") {
  return fetch("http://127.0.0.1:8000/",{
    method:"POST",
    headers:{origin,"Content-Type":"application/json","x-bc-bootstrap-token":token},
    body:JSON.stringify(body),
  });
}
function applyMigration() {
  requireLocalTarget();
  const migration = path.join(workspace,"supabase","migrations","20261102170000_step12_reset_bootstrap_guard.sql");
  if (!fs.existsSync(migration)) throw new Error("STEP12_MIGRATION_FILE_MISSING");
  runPsql(["-f","/workspace/supabase/migrations/20261102170000_step12_reset_bootstrap_guard.sql"],"STEP12_LOCAL_MIGRATION_APPLY");
  console.log("BC_STEP12_MIGRATION=PASS; applied to guarded local loopback database only");
}

async function clearLocalStorageObjects() {
  const list = runPsql(["-c","SELECT name FROM storage.objects WHERE bucket_id='productos' ORDER BY name;"],"STEP12_STORAGE_LIST");
  const paths = list.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if (!paths.length) {
    const count = Number(runPsql(["-c","SELECT count(*) FROM storage.objects;"],"STEP12_STORAGE_EMPTY_CHECK"));
    assert(count===0,"STEP12_STORAGE_OTHER_BUCKET_OBJECTS_PRESENT");
    console.log("BC_STEP12_STORAGE_CLEANUP=PASS; no restored objects present");
    return 0;
  }
  const response = await fetch(`${apiUrl}/storage/v1/object/productos`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!response.ok) throw new Error(`STEP12_STORAGE_API_DELETE=FAIL; HTTP ${response.status}`);
  const remaining = Number(runPsql(["-c","SELECT count(*) FROM storage.objects;"],"STEP12_STORAGE_REMAINDER"));
  assert(remaining===0,"STEP12_STORAGE_API_DID_NOT_REMOVE_ALL_OBJECTS");
  console.log(`BC_STEP12_STORAGE_CLEANUP=PASS; ${paths.length} restored objects removed through the local Storage API; bucket preserved`);
  return paths.length;
}

function preservedTableFingerprint(table) {
  const allowed = new Set(["categorias","permisos","presentaciones","roles","turno_configuracion","unidades"]);
  assert(allowed.has(table),"STEP12_PRESERVED_TABLE_NOT_ALLOWLISTED");
  const sql = `SELECT md5(COALESCE(string_agg(row_json,'' ORDER BY row_json),'')) FROM (SELECT to_jsonb(t)::text AS row_json FROM public."${table}" AS t) AS source;`;
  return runPsql(["-c",sql],`STEP12_PRESERVED_FINGERPRINT_${table.toUpperCase()}`);
}
async function main() {
  requireLocalTarget();
  const storageObjectsRemoved = await clearLocalStorageObjects();
  const manifest = JSON.parse(fs.readFileSync(path.join(root,"restored","manifest.json"),"utf8"));
  const expectedPreserved = ["categorias","permisos","presentaciones","roles","turno_configuracion","unidades"];
  const expectedTableCount = Object.keys(manifest.public_rows || {}).length;
  assert(expectedTableCount === 61, "STEP12_SOURCE_MANIFEST_TABLE_COUNT_DRIFT");

  const syntheticTag = crypto.randomUUID();
  const syntheticWarehouse = `STEP12-SYNTHETIC-${syntheticTag}`;
  const syntheticAuditSql = `
    INSERT INTO public.almacenes(nombre,tipo) VALUES (${sqlLiteral(syntheticWarehouse)},'almacenamiento');
    INSERT INTO public.auditoria_operaciones(usuario_nombre,tipo,descripcion,estado,entidad_id,payload_resumen)
    VALUES
      ('step12-synthetic','step12_synthetic_fixture','Synthetic reset rehearsal fixture 1','synthetic',${sqlLiteral(syntheticTag+"-1")},jsonb_build_object('fixture',${sqlLiteral(syntheticTag)},'ordinal',1)),
      ('step12-synthetic','step12_synthetic_fixture','Synthetic reset rehearsal fixture 2','synthetic',${sqlLiteral(syntheticTag+"-2")},jsonb_build_object('fixture',${sqlLiteral(syntheticTag)},'ordinal',2)),
      ('step12-synthetic','step12_synthetic_fixture','Synthetic reset rehearsal fixture 3','synthetic',${sqlLiteral(syntheticTag+"-3")},jsonb_build_object('fixture',${sqlLiteral(syntheticTag)},'ordinal',3));
  `;
  runPsql(["-c",syntheticAuditSql],"STEP12_SYNTHETIC_FIXTURE_SEED");
  const syntheticAuthEmail = `bc-step12-fixture-${crypto.randomBytes(8).toString("hex")}@example.test`;
  const syntheticAuthPassword = `Synthetic-${crypto.randomBytes(24).toString("base64url")}Aa1!`;
  const syntheticAuthUserId = await createSyntheticAuthUser(syntheticAuthEmail,syntheticAuthPassword);
  const syntheticCounts = lastJson(runPsql(["-c",
    `SELECT jsonb_build_object('warehouses',(SELECT count(*) FROM public.almacenes WHERE nombre=${sqlLiteral(syntheticWarehouse)}),'audit_rows',(SELECT count(*) FROM public.auditoria_operaciones WHERE tipo='step12_synthetic_fixture' AND payload_resumen->>'fixture'=${sqlLiteral(syntheticTag)}),'auth_users',(SELECT count(*) FROM auth.users WHERE id=${sqlLiteral(syntheticAuthUserId)}::uuid AND raw_user_meta_data->>'bc_step12_synthetic_fixture'='true'))::text;`
  ],"STEP12_SYNTHETIC_FIXTURE_VERIFY"),"STEP12_SYNTHETIC_FIXTURE_VERIFY");
  assert(syntheticCounts.warehouses===1 && syntheticCounts.audit_rows===3 && syntheticCounts.auth_users===1,"STEP12_SYNTHETIC_FIXTURE_SEED_FAILED");
  console.log("BC_STEP12_SYNTHETIC_FIXTURE=PASS; one operational warehouse, three audit rows, one synthetic Auth identity seeded in local clone");
  const preservedFingerprintsBefore = Object.fromEntries(expectedPreserved.map(table=>[table,preservedTableFingerprint(table)]));

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetRequestId = crypto.randomUUID();
  const resetGateSql = [
    "INSERT INTO private.bc_reset_gate(singleton,token_hash,expires_at,attempts,max_attempts)",
    `VALUES(true,extensions.digest(${sqlLiteral(resetToken)},'sha256'),now()+interval '1 day',0,5)`,
    "ON CONFLICT(singleton) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,attempts=0,max_attempts=5,consumed_at=NULL,consumed_request_id=NULL,updated_at=now();",
  ].join(" ");
  runPsql(["-c",resetGateSql],"STEP12_RESET_GATE_SETUP");

  runPsqlFile("test/step12-reset-bootstrap-preflight.sql",{
    reset_token:resetToken,
    reset_request_id:resetRequestId,
  },"STEP12_ROLLBACK_TEST");
  console.log("BC_STEP12_INVALID_TOKEN=PASS");
  console.log("BC_STEP12_ROLLBACK=PASS");

  // Hold the exact advisory lock used by the reset function, then release two
  // equal idempotency requests at once. Exactly one must execute; the other replays.
  const lock = spawnPsql(["-c",
    "BEGIN; SELECT pg_advisory_xact_lock(1111707218,12); SELECT 'BC_RESET_LOCK_HELD'; SELECT pg_sleep(3); COMMIT;"
  ],"STEP12_CONCURRENCY_LOCK");
  await lock.waitFor("BC_RESET_LOCK_HELD");
  const callSql = `SELECT private.bc_reset_application_data(${sqlLiteral(resetToken)},'CONFIRMO REINICIAR BATTLECRUISER PRODUCCIÓN',${sqlLiteral(resetRequestId)}::uuid)::text;`;
  const first = spawnPsql(["-c",callSql],"STEP12_RESET_CONCURRENT_A");
  const second = spawnPsql(["-c",callSql],"STEP12_RESET_CONCURRENT_B");
  const [firstOutput,secondOutput] = await Promise.all([first.result(),second.result()]);
  await lock.result();
  const outcomes = [lastJson(firstOutput,"STEP12_RESET_CONCURRENT_A"),lastJson(secondOutput,"STEP12_RESET_CONCURRENT_B")];
  assert(outcomes.every(x=>x.ok===true),"STEP12_CONCURRENT_RESET_NOT_PASS");
  assert(outcomes.filter(x=>x.replayed===true).length===1,"STEP12_CONCURRENT_RESET_NOT_IDEMPOTENT");
  assert(outcomes.filter(x=>x.replayed!==true).length===1,"STEP12_CONCURRENT_RESET_EXECUTION_COUNT_INVALID");
  console.log("BC_STEP12_CONCURRENCY=PASS; two concurrent same-key requests; exactly one execution and one replay");

  const postResetSql = `SELECT jsonb_build_object(
    'public_table_count',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),
    'public_policy_count',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),
    'managed_policy_count',(SELECT count(*) FROM pg_policies WHERE schemaname IN ('auth','storage')),
    'public_function_count',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'),
    'rls_table_count',(SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity),
    'auth_users',(SELECT count(*) FROM auth.users),
    'auth_identities',(SELECT count(*) FROM auth.identities),
    'auth_sessions',(SELECT count(*) FROM auth.sessions),
    'auth_refresh_tokens',(SELECT count(*) FROM auth.refresh_tokens),
    'auth_one_time_tokens',(SELECT count(*) FROM auth.one_time_tokens),
    'storage_buckets',(SELECT count(*) FROM storage.buckets),
    'storage_bucket_ids',(SELECT jsonb_agg(id ORDER BY id) FROM storage.buckets),
    'storage_objects',(SELECT count(*) FROM storage.objects),
    'synthetic_warehouses',(SELECT count(*) FROM public.almacenes WHERE nombre=${sqlLiteral(syntheticWarehouse)}),
    'synthetic_audit_rows',(SELECT count(*) FROM public.auditoria_operaciones WHERE tipo='step12_synthetic_fixture' AND payload_resumen->>'fixture'=${sqlLiteral(syntheticTag)}),
    'synthetic_auth_users',(SELECT count(*) FROM auth.users WHERE raw_user_meta_data->>'bc_step12_synthetic_fixture'='true'),
    'preserved',jsonb_build_object(
      'categorias',(SELECT count(*) FROM public.categorias),
      'permisos',(SELECT count(*) FROM public.permisos),
      'presentaciones',(SELECT count(*) FROM public.presentaciones),
      'roles',(SELECT count(*) FROM public.roles),
      'turno_configuracion',(SELECT count(*) FROM public.turno_configuracion),
      'unidades',(SELECT count(*) FROM public.unidades)),
    'empty',jsonb_build_object(
      'almacenes',(SELECT count(*) FROM public.almacenes),
      'usuarios',(SELECT count(*) FROM public.usuarios),
      'productos',(SELECT count(*) FROM public.productos),
      'stock',(SELECT count(*) FROM public.stock),
      'turnos',(SELECT count(*) FROM public.turnos),
      'ventas',(SELECT count(*) FROM public.ventas),
      'mensajes',(SELECT count(*) FROM public.mensajes),
      'auditoria_operaciones',(SELECT count(*) FROM public.auditoria_operaciones)),
    'reset_ledger',(SELECT count(*) FROM private.bc_reset_operations WHERE status='completed'),
    'reset_gate_consumed',(SELECT consumed_at IS NOT NULL FROM private.bc_reset_gate WHERE singleton=true),
    'extension_names',(SELECT jsonb_agg(extname ORDER BY extname) FROM pg_extension)
  )::text;`;
  const postReset = lastJson(runPsql(["-c",postResetSql],"STEP12_RESET_POSTCONDITIONS"),"STEP12_RESET_POSTCONDITIONS");
  assert(postReset.public_table_count===expectedTableCount,"STEP12_SCHEMA_TABLES_CHANGED");
  assert(postReset.public_policy_count===manifest.public_policies.length,"STEP12_PUBLIC_POLICIES_CHANGED");
  assert(postReset.managed_policy_count===manifest.managed_policies.length,"STEP12_AUTH_STORAGE_POLICIES_CHANGED");
  assert(postReset.public_function_count===manifest.public_function_signatures.length+3,"STEP12_PUBLIC_FUNCTIONS_CHANGED");
  assert(postReset.rls_table_count===manifest.public_rls_tables.length,"STEP12_RLS_CHANGED");
  assert(postReset.auth_users===0 && postReset.auth_identities===0 && postReset.auth_sessions===0 &&
    postReset.auth_refresh_tokens===0 && postReset.auth_one_time_tokens===0,"STEP12_AUTH_CREDENTIALS_NOT_CLEARED");
  assert(postReset.storage_buckets===1 && JSON.stringify(postReset.storage_bucket_ids)==='["productos"]' &&
    postReset.storage_objects===0,"STEP12_STORAGE_POSTCONDITION_FAILED");
  assert(postReset.synthetic_warehouses===0 && postReset.synthetic_audit_rows===0 &&
    postReset.synthetic_auth_users===0,"STEP12_SYNTHETIC_FIXTURES_NOT_CLEARED");
  assert(postReset.empty.almacenes===0 && postReset.empty.usuarios===0 && postReset.empty.productos===0 &&
    postReset.empty.stock===0 && postReset.empty.turnos===0 && postReset.empty.ventas===0 &&
    postReset.empty.mensajes===0 && postReset.empty.auditoria_operaciones===1,"STEP12_OPERATIONAL_ROWS_NOT_CLEARED");
  for(const table of expectedPreserved){
    assert(postReset.preserved[table]===Number(manifest.public_rows[`public.${table}`]),`STEP12_PRESERVED_TABLE_CHANGED:${table}`);
  }
  const preservedFingerprintsAfter = Object.fromEntries(expectedPreserved.map(table=>[table,preservedTableFingerprint(table)]));
  for(const table of expectedPreserved){
    assert(preservedFingerprintsAfter[table]===preservedFingerprintsBefore[table],`STEP12_PRESERVED_TABLE_CONTENT_CHANGED:${table}`);
  }
  assert(postReset.reset_ledger===1 && postReset.reset_gate_consumed===true,"STEP12_RESET_LEDGER_OR_GATE_FAILED");
  assert(JSON.stringify(postReset.extension_names)===JSON.stringify(manifest.extensions),"STEP12_EXTENSIONS_CHANGED");
  console.log("BC_STEP12_RESET_SANDBOX=PASS; operational rows cleared; schema, RLS, policies, RPC functions, catalogues, role matrix, and bucket preserved");

  const bootstrapToken = crypto.randomBytes(32).toString("hex");
  const bootstrapRequestId = crypto.randomUUID();
  const bootstrapGateSql = [
    "INSERT INTO private.bc_bootstrap_gate(singleton,token_hash,expires_at,attempts,max_attempts)",
    `VALUES(true,extensions.digest(${sqlLiteral(bootstrapToken)},'sha256'),now()+interval '1 day',0,6)`,
    "ON CONFLICT(singleton) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,attempts=0,max_attempts=6,claim_request_id=NULL,claim_expires_at=NULL,consumed_at=NULL,consumed_request_id=NULL,auth_user_id=NULL,updated_at=now();",
  ].join(" ");
  runPsql(["-c",bootstrapGateSql],"STEP12_BOOTSTRAP_GATE_SETUP");

  const bootstrapEmail = `bc-step12-${crypto.randomBytes(8).toString("hex")}@example.test`;
  const bootstrapPassword = `Step12-${crypto.randomBytes(24).toString("base64url")}Aa1!`;
  const bootstrapBody = {
    username: "Administrador de prueba",
    email: bootstrapEmail,
    password: bootstrapPassword,
    request_id: bootstrapRequestId,
  };
  const edgeChild = await startLocalBootstrapEdge(bootstrapToken);
  let authUserId = "";
  try {
    const preflight = await fetch("http://127.0.0.1:8000/",{method:"OPTIONS",headers:{origin:"https://battlecruiser.robvg9.workers.dev"}});
    assert(preflight.status===204,"STEP12_BOOTSTRAP_CORS_PREFLIGHT_FAILED");
    const rejectedOrigin = await callLocalBootstrapEdge(bootstrapToken,bootstrapBody,"https://untrusted.example");
    assert(rejectedOrigin.status===403,"STEP12_BOOTSTRAP_ORIGIN_NOT_REJECTED");
    const wrongToken = crypto.randomBytes(32).toString("hex");
    for(let i=0;i<5;i++){
      const badBody = {
        username: "Invalid token test",
        email: `bc-step12-invalid-${i}-${crypto.randomBytes(4).toString("hex")}@example.test`,
        password: `Invalid-${crypto.randomBytes(20).toString("base64url")}Aa1!`,
        request_id: crypto.randomUUID(),
      };
      const badResponse = await callLocalBootstrapEdge(wrongToken,badBody);
      assert(badResponse.status===401,"STEP12_BOOTSTRAP_INVALID_TOKEN_NOT_REJECTED");
    }
    const recordedAttempts = Number(runPsql(["-c","SELECT attempts FROM private.bc_bootstrap_gate WHERE singleton=true;"],"STEP12_BOOTSTRAP_ATTEMPT_COUNT"));
    assert(recordedAttempts===5,"STEP12_BOOTSTRAP_ATTEMPTS_NOT_PERSISTED");
    console.log("BC_STEP12_BOOTSTRAP_INVALID_TOKEN=PASS; five failed Edge requests counted in the database");

    const created = await callLocalBootstrapEdge(bootstrapToken,bootstrapBody);
    const createdBody = await created.json().catch(()=>({}));
    assert(created.status===201 && createdBody.initialized===true && createdBody.role==="Dueño","STEP12_BOOTSTRAP_EDGE_CREATE_FAILED");
    authUserId = runPsql(["-c",`SELECT id FROM auth.users WHERE email=${sqlLiteral(bootstrapEmail)};`],"STEP12_BOOTSTRAP_AUTH_ID").trim();
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId),"STEP12_BOOTSTRAP_AUTH_ID_MISSING");
    const authAndProfile = lastJson(runPsql(["-c",
      `SELECT jsonb_build_object('auth_users',(SELECT count(*) FROM auth.users),'profiles',(SELECT count(*) FROM public.usuarios),'owner_profile',(SELECT count(*) FROM public.usuarios u JOIN public.roles r ON r.id=u.role_id WHERE u.id=${sqlLiteral(authUserId)}::uuid AND r.nombre='Dueño' AND u.activo))::text;`
    ],"STEP12_AUTH_TRIGGER_ATOMICITY"),"STEP12_AUTH_TRIGGER_ATOMICITY");
    assert(authAndProfile.auth_users===1 && authAndProfile.profiles===1 && authAndProfile.owner_profile===1,"STEP12_AUTH_PROFILE_NOT_ATOMIC");
    console.log("BC_STEP12_AUTH_PROFILE_ATOMICITY=PASS; Edge request created Auth identity and Dueño profile through the database trigger");
    console.log("BC_STEP12_BOOTSTRAP_EDGE=PASS; real Deno Edge Function returned 201 with the Dueño role");

    const replayResponse = await callLocalBootstrapEdge(bootstrapToken,bootstrapBody);
    const replayBody = await replayResponse.json().catch(()=>({}));
    assert(replayResponse.status===200 && replayBody.initialized===true && replayBody.replayed===true,"STEP12_BOOTSTRAP_EDGE_REPLAY_NOT_IDEMPOTENT");
    const secondBody = { ...bootstrapBody, email:`bc-step12-second-${crypto.randomBytes(8).toString("hex")}@example.test`, request_id:crypto.randomUUID() };
    const secondResponse = await callLocalBootstrapEdge(bootstrapToken,secondBody);
    assert(secondResponse.status===401,"STEP12_BOOTSTRAP_EDGE_NOT_CLOSED_AFTER_USE");
  } finally {
    await stopLocalBootstrapEdge(edgeChild);
  }
  const bootstrapPost = lastJson(runPsql(["-c",
    "SELECT jsonb_build_object('auth_users',(SELECT count(*) FROM auth.users),'app_users',(SELECT count(*) FROM public.usuarios),'owners',(SELECT count(*) FROM public.usuarios u JOIN public.roles r ON r.id=u.role_id WHERE r.nombre='Dueño' AND u.activo),'consumed',(SELECT consumed_at IS NOT NULL FROM private.bc_bootstrap_gate WHERE singleton=true),'remaining_token_hash',(SELECT token_hash IS NOT NULL FROM private.bc_bootstrap_gate WHERE singleton=true),'bootstrap_audit',(SELECT count(*) FROM public.auditoria_operaciones WHERE tipo='bootstrap_admin'))::text;"
  ],"STEP12_BOOTSTRAP_POSTCONDITIONS"),"STEP12_BOOTSTRAP_POSTCONDITIONS");
  assert(bootstrapPost.auth_users===1 && bootstrapPost.app_users===1 && bootstrapPost.owners===1 &&
    bootstrapPost.consumed===true && bootstrapPost.remaining_token_hash===false && bootstrapPost.bootstrap_audit===1,
    "STEP12_BOOTSTRAP_POSTCONDITION_FAILED");
  const resetExecution = outcomes.find(x => x.replayed !== true);
  const evidence = {
    format: "battlecruiser-step12-isolated-reset-bootstrap-v1",
    status: "PASS",
    generated_at_utc: new Date().toISOString(),
    project_ref: manifest.project_ref,
    source_public_table_count: expectedTableCount,
    restored_storage_objects_removed_through_api: storageObjectsRemoved,
    backup_manifest_generated_at_utc: manifest.generated_at_utc,
    checks: {
      backup_restored: true,
      invalid_reset_token_rate_limit: true,
      destructive_reset_rollback: true,
      concurrent_reset_serialized: true,
      same_request_id_replayed: true,
      operational_data_cleared_in_isolation: true,
      roles_permissions_catalogues_preserved: true,
      schema_rls_policies_rpc_extensions_preserved: true,
      storage_bucket_preserved_objects_cleared: true,
      storage_deleted_via_api_before_reset: true,
      bootstrap_failed_attempts_persisted: true,
      auth_user_and_owner_profile_created_atomically: true,
      first_admin_created_with_owner_role: true,
      bootstrap_finalize_idempotent: true,
      bootstrap_closed_after_use: true
    },
    reset: {
      request_id: resetRequestId,
      concurrent_requests: 2,
      successful_execution_count: 1,
      idempotent_replay_count: 1,
      public_rows_before: resetExecution.public_rows_before,
      public_rows_after: resetExecution.public_rows_after,
      preserved_tables: resetExecution.preserved_tables,
      cleared_tables: resetExecution.cleared_tables,
      public_policy_count_after: postReset.public_policy_count,
      managed_policy_count_after: postReset.managed_policy_count,
      public_function_count_after: postReset.public_function_count,
      rls_table_count_after: postReset.rls_table_count,
      storage_bucket_ids_after: postReset.storage_bucket_ids,
      storage_objects_after: postReset.storage_objects
    },
    bootstrap: {
      request_id: bootstrapRequestId,
      invalid_attempts_before_success: 5,
      total_attempts_after_success: 6,
      auth_users_after: bootstrapPost.auth_users,
      application_users_after: bootstrapPost.app_users,
      active_owner_count_after: bootstrapPost.owners,
      consumed: bootstrapPost.consumed,
      token_hash_cleared: bootstrapPost.remaining_token_hash === false,
      audit_events: bootstrapPost.bootstrap_audit
    },
    secrets_recorded: false,
    live_database_mutated: false,
    live_deployment_performed: false
  };
  fs.writeFileSync(path.join(root,"step12-reset-bootstrap-report.json"), JSON.stringify(evidence,null,2)+"\n", {mode:0o600});
  console.log("BC_STEP12_BOOTSTRAP=PASS; 5 bad attempts persisted, first owner created atomically in DB, replay idempotent, gate closed after one use");
  console.log("BC_STEP12_ISOLATED_DESTRUCTIVE_REHEARSAL=PASS");
}

const mode = process.argv[2] || "rehearse";
const task = mode === "apply-migration" ? Promise.resolve().then(applyMigration)
  : mode === "rehearse" ? main()
  : Promise.reject(new Error("STEP12_MODE_INVALID"));
task.catch(error => {
  const safe = String(error?.message || error).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[EMAIL_REDACTED]");
  console.error(safe);
  process.exitCode = 1;
});
