#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.env.BC_BACKUP_ROOT || path.join(process.env.RUNNER_TEMP || "/tmp", "bc-backup-restore");
const stage = path.join(root, "stage");
const restored = path.join(root, "restored");
const tmp = path.join(root, "tmp");
const projectRef = process.env.PROJECT_REF || "papxnkkjtkxsitcsvcme";
const DB_URL = process.env.BC_SUPABASE_DB_URL || "";
const PG_IMAGE = "postgres:17.6-alpine";

fs.mkdirSync(stage, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });

function redact(value = "") {
  let s = String(value);
  if (DB_URL) s = s.split(DB_URL).join("[DB_URL_REDACTED]");
  try {
    const u = new URL(DB_URL);
    const pwd = decodeURIComponent(u.password || "");
    if (pwd) s = s.split(pwd).join("[PASSWORD_REDACTED]");
  } catch {}
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]");
  s = s.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[ID_REDACTED]");
  return s;
}

function connectionEnv(urlString, sslmode = "require") {
  const u = new URL(urlString);
  const username = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") throw new Error("DATABASE_URI_INVALID");
  if (/\r|\n/.test(password) || /\r|\n/.test(username) || /\r|\n/.test(database)) throw new Error("DATABASE_URI_INVALID");
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: username,
    PGPASSWORD: password,
    PGDATABASE: database,
    PGSSLMODE: sslmode,
    PGCONNECT_TIMEOUT: "20"
  };
}

function runDocker(args, env, label) {
  const dockerArgs = [
    "run", "--rm", "--network", "host",
    "--volume", `${root}:/backup`,
    "--env", "PGHOST",
    "--env", "PGPORT",
    "--env", "PGUSER",
    "--env", "PGDATABASE",
    "--env", "PGPASSWORD",
    "--env", "PGSSLMODE",
    "--env", "PGCONNECT_TIMEOUT",
    PG_IMAGE,
    ...args
  ];
  const r = spawnSync("docker", dockerArgs, { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) {
    const firstUseful = redact(r.stderr || r.error?.message || "command failed").split("\n").filter(Boolean).slice(-3).join(" | ");
    throw new Error(`${label}=FAIL; exit=${r.status ?? "spawn"}; ${firstUseful.slice(0, 600)}`);
  }
  return r.stdout || "";
}

function runPsql(env, query, label) {
  return runDocker(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query], env, label).trim();
}

function runPsqlFile(env, file, label) {
  return runDocker(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", file], env, label).trim();
}

function runCli(args, label) {
  const r = spawnSync(process.env.SUPABASE_CLI_BIN || "supabase", args, { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) {
    const firstUseful = redact(r.stderr || r.error?.message || "CLI command failed").split("\n").filter(Boolean).slice(-3).join(" | ");
    throw new Error(`${label}=FAIL; exit=${r.status ?? "spawn"}; ${firstUseful.slice(0, 600)}`);
  }
}

const metricQuery = `
SELECT jsonb_build_object(
  'captured_at_utc', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'public_table_count', (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'),
  'public_rls_tables', COALESCE((SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity), '[]'::jsonb),
  'public_policies', COALESCE((SELECT jsonb_agg(jsonb_build_object('schemaname', schemaname, 'tablename', tablename, 'policyname', policyname, 'permissive', permissive, 'roles', roles, 'cmd', cmd, 'qual', qual, 'with_check', with_check) ORDER BY schemaname, tablename, policyname) FROM pg_policies WHERE schemaname = 'public'), '[]'::jsonb),
  'managed_policies', COALESCE((SELECT jsonb_agg(jsonb_build_object('schemaname', schemaname, 'tablename', tablename, 'policyname', policyname, 'permissive', permissive, 'roles', roles, 'cmd', cmd, 'qual', qual, 'with_check', with_check) ORDER BY schemaname, tablename, policyname) FROM pg_policies WHERE schemaname IN ('auth', 'storage')), '[]'::jsonb),
  'public_function_signatures', COALESCE((SELECT jsonb_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'), '[]'::jsonb),
  'auth_users', (SELECT count(*) FROM auth.users),
  'auth_identities', (SELECT count(*) FROM auth.identities),
  'storage_buckets', (SELECT count(*) FROM storage.buckets),
  'storage_objects', (SELECT count(*) FROM storage.objects),
  'storage_product_objects', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'metadata', metadata) ORDER BY name) FROM storage.objects WHERE bucket_id = 'productos'), '[]'::jsonb),
  'policy_counts_by_schema', COALESCE((SELECT jsonb_object_agg(schemaname, policy_count) FROM (SELECT schemaname, count(*) AS policy_count FROM pg_policies WHERE schemaname IN ('public', 'auth', 'storage') GROUP BY schemaname) p), '{}'::jsonb),
  'extensions', COALESCE((SELECT jsonb_agg(extname ORDER BY extname) FROM pg_extension), '[]'::jsonb)
)::text;
`;

const policySqlQuery = `
SELECT COALESCE(string_agg(
  format(
    'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
    policyname, schemaname, tablename, lower(permissive), cmd,
    CASE
      WHEN roles = ARRAY['public']::name[] THEN 'PUBLIC'
      ELSE (SELECT string_agg(format('%I', role_name), ', ' ORDER BY role_name) FROM unnest(roles) AS role(role_name))
    END,
    CASE WHEN qual IS NOT NULL THEN format(' USING (%s)', qual) ELSE '' END,
    CASE WHEN with_check IS NOT NULL THEN format(' WITH CHECK (%s)', with_check) ELSE '' END
  ),
  E'\\n\\n' ORDER BY schemaname, tablename, policyname
), '') FROM pg_policies WHERE schemaname IN ('auth', 'storage');
`;

function readPublicRowCounts(env) {
  const countsFile = path.join(tmp, "counts.sql");
  fs.writeFileSync(countsFile, "CREATE TEMP TABLE bc_row_counts (table_name text, row_count bigint); DO $bc$ DECLARE r record; c bigint; BEGIN FOR r IN SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = $q$public$q$ AND table_type = $q$BASE TABLE$q$ ORDER BY table_name LOOP EXECUTE format($q$SELECT count(*) FROM %I.%I$q$, r.table_schema, r.table_name) INTO c; INSERT INTO bc_row_counts VALUES (r.table_schema || $q$.$q$ || r.table_name, c); END LOOP; END $bc$; SELECT table_name || $q$|$q$ || row_count::text FROM bc_row_counts ORDER BY table_name;");
  const output = runDocker(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "/backup/tmp/counts.sql"], env, "PUBLIC_ROW_COUNTS");
  const rows = {};
  for (const line of output.split("\n").map(s => s.trim()).filter(Boolean)) {
    const splitAt = line.lastIndexOf("|");
    if (splitAt < 0) continue;
    const name = line.slice(0, splitAt);
    const count = Number(line.slice(splitAt + 1));
    if (!name.startsWith("public.") || !Number.isSafeInteger(count) || count < 0) continue;
    rows[name] = count;
  }
  if (Object.keys(rows).length === 0) throw new Error("PUBLIC_ROW_COUNTS=FAIL; no valid public table counts parsed");
  return rows;
}
function snapshot(env, label) {
  const raw = runPsql(env, metricQuery, `${label}_METRICS`);
  let metrics;
  try { metrics = JSON.parse(raw); } catch { throw new Error(`${label}_METRICS=FAIL; invalid JSON result`); }
  metrics.public_rows = readPublicRowCounts(env);
  return metrics;
}

async function backup() {
  if (!DB_URL) throw new Error("BC_DB_SECRET_PRESENT=NO");
  const remote = connectionEnv(DB_URL);
  const uri = new URL(DB_URL);
  if (uri.hostname !== "aws-0-us-east-1.pooler.supabase.com" ||
      uri.port !== "5432" ||
      decodeURIComponent(uri.username) !== `postgres.${projectRef}` ||
      decodeURIComponent(uri.pathname.replace(/^\//, "")) !== "postgres") {
    throw new Error("BC_DB_URI_METADATA=FAIL; unexpected connection target; no dump performed");
  }
  console.log("BC_DB_URI_METADATA=PASS; expected Session Pooler target");
  const roleFile = path.join(stage, "roles.sql");
  const schemaFile = path.join(stage, "schema.sql");
  const dataFile = path.join(stage, "data.sql");
  runCli(["db", "dump", "--db-url", DB_URL, "-f", roleFile, "--role-only"], "BC_DUMP_ROLES");
  console.log("BC_DUMP_ROLES=PASS");
  runCli(["db", "dump", "--db-url", DB_URL, "-f", schemaFile], "BC_DUMP_SCHEMA");
  console.log("BC_DUMP_SCHEMA=PASS");
  runCli(["db", "dump", "--db-url", DB_URL, "-f", dataFile, "--schema", "public", "--use-copy", "--data-only"], "BC_DUMP_PUBLIC_DATA");
  console.log("BC_DUMP_PUBLIC_DATA=PASS");

  runDocker(["pg_dump", "--data-only", "--schema=auth", "--exclude-table=auth.schema_migrations", "--exclude-table=auth.instances", "--no-owner", "--no-privileges", "--column-inserts", "--file=/backup/stage/auth-data.sql"], remote, "BC_DUMP_AUTH_DATA");
  console.log("BC_DUMP_AUTH_DATA=PASS");
  runDocker(["pg_dump", "--data-only", "--table=storage.buckets", "--table=storage.objects", "--no-owner", "--no-privileges", "--column-inserts", "--file=/backup/stage/storage-metadata.sql"], remote, "BC_DUMP_STORAGE_METADATA");
  console.log("BC_DUMP_STORAGE_METADATA=PASS");

  const metrics = snapshot(remote, "SOURCE");
  const policies = runPsql(remote, policySqlQuery, "BC_DUMP_MANAGED_POLICIES");
  fs.writeFileSync(path.join(stage, "managed-policies.sql"), policies ? `${policies}\n` : "-- Source contains no auth/storage policies\n", { mode: 0o600 });
  const files = [];
  let totalBytes = 0;
  for (const item of (metrics.storage_product_objects || [])) {
    const name = String(item.name || "");
    const segments = name.split("/");
    if (!name || name.startsWith("/") || segments.some(part => !part || part === "." || part === "..")) {
      throw new Error("BC_STORAGE_OBJECT_PATH=FAIL; unsafe path in product bucket metadata");
    }
    const encoded = segments.map(encodeURIComponent).join("/");
    const url = `https://${projectRef}.supabase.co/storage/v1/object/public/productos/${encoded}`;
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`BC_STORAGE_OBJECT_DOWNLOAD=FAIL; HTTP ${response.status}; object index ${files.length + 1}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const declaredSize = Number(item.metadata?.size);
    if (Number.isFinite(declaredSize) && declaredSize >= 0 && declaredSize !== bytes.length) {
      throw new Error(`BC_STORAGE_OBJECT_DOWNLOAD=FAIL; size mismatch; object index ${files.length + 1}`);
    }
    const dest = path.join(stage, "storage", "productos", ...segments);
    const rootPath = path.resolve(stage, "storage", "productos");
    if (!path.resolve(dest).startsWith(rootPath + path.sep)) throw new Error("BC_STORAGE_OBJECT_PATH=FAIL; path escaped backup root");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes, { mode: 0o600 });
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    files.push({ name, bytes: bytes.length, sha256, content_type: item.metadata?.mimetype || item.metadata?.contentType || "application/octet-stream" });
    totalBytes += bytes.length;
  }
  const manifest = { format: "battlecruiser-supabase-logical-backup-v1", project_ref: projectRef, generated_at_utc: new Date().toISOString(), ...metrics, storage_files: files, storage_file_bytes: totalBytes };
  fs.writeFileSync(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  console.log(`BC_SOURCE_SNAPSHOT=PASS; public tables=${Object.keys(metrics.public_rows).length}; auth users=${metrics.auth_users}; identities=${metrics.auth_identities}; storage objects=${metrics.storage_objects}; productos files downloaded=${files.length}; downloaded bytes=${totalBytes}`);
  console.log("BC_BACKUP_COMPONENTS=PASS; public roles/schema/data + Auth data + Storage metadata/files + policies captured");
}

function dockerPsqlLocal(args, label) {
  const url = process.env.DB_URL || process.env.LOCAL_DB_URL;
  if (!url) throw new Error("LOCAL_DB_URL=NO");
  const parsed = new URL(url);
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (!loopbackHosts.has(parsed.hostname) || parsed.port !== "54322") {
    throw new Error("LOCAL_DB_TARGET_GUARD=FAIL; refusing restore/write outside loopback 127.0.0.1:54322");
  }
  const target = connectionEnv(url, "disable");
  return runDocker(args, target, label);
}

async function restore() {
  if (!fs.existsSync(path.join(restored, "manifest.json"))) throw new Error("BC_RESTORE_INPUT=FAIL; decrypted archive not extracted");
  const existingRoleOutput = dockerPsqlLocal(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", "SELECT rolname FROM pg_roles"], "BC_RESTORE_LOCAL_ROLE_LIST");
  const existingRoles = new Set(existingRoleOutput.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
  const sourceRoleLines = fs.readFileSync(path.join(restored, "roles.sql"), "utf8").split(/\r?\n/);
  const skippedRoles = new Set();
  let skippedLogSettings = 0;
  const filteredRoleLines = sourceRoleLines.filter(line => {
    if (/log_min_messages/i.test(line)) {
      skippedLogSettings += 1;
      return false;
    }
    const match = line.match(/^\s*(?:CREATE|ALTER)\s+ROLE\s+("[^"]+"|[A-Za-z0-9_$-]+)/i);
    if (!match) return true;
    const name = match[1].replace(/^"|"$/g, "");
    if (!existingRoles.has(name)) return true;
    skippedRoles.add(name);
    return false;
  });
  fs.writeFileSync(path.join(restored, "roles-restore.sql"), filteredRoleLines.join("\n") + "\n", { mode: 0o600 });
  console.log(`BC_RESTORE_ROLE_FILTER=PASS; preserving ${skippedRoles.size} roles supplied by isolated Supabase stack; skipped nonessential log_min_messages settings=${skippedLogSettings}`);
  const clearLocalAuthSql = `DO $bc_clear_auth$ DECLARE r record; BEGIN FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'auth' AND tablename NOT IN ('instances','schema_migrations') ORDER BY tablename LOOP EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', r.schemaname, r.tablename); END LOOP; END $bc_clear_auth$;`;
  dockerPsqlLocal([
    "psql", "-X", "--single-transaction", "--set=ON_ERROR_STOP=1",
    "--file=/backup/restored/roles-restore.sql",
    "--file=/backup/restored/schema.sql",
    "--command", clearLocalAuthSql,
    "--command", "SET session_replication_role = replica",
    "--file=/backup/restored/data.sql",
    "--dbname=postgres"
  ], "BC_RESTORE_PUBLIC_DATABASE");
  console.log("BC_RESTORE_PUBLIC_DATABASE=PASS; explicit public-only data import");
  console.log("BC_RESTORE_LOCAL_AUTH_BASELINE=PASS; temporary auth tables cleared before public data load");

  dockerPsqlLocal([
    "psql", "-X", "--single-transaction", "--set=ON_ERROR_STOP=1",
    "--command", "SET session_replication_role = replica",
    "--file=/backup/restored/auth-data.sql",
    "--dbname=postgres"
  ], "BC_RESTORE_AUTH_DATA");
  console.log("BC_RESTORE_AUTH_DATA=PASS");

  dockerPsqlLocal([
    "psql", "-X", "--single-transaction", "--set=ON_ERROR_STOP=1",
    "--command", "TRUNCATE TABLE storage.objects, storage.buckets RESTART IDENTITY CASCADE",
    "--command", "SET session_replication_role = replica",
    "--file=/backup/restored/storage-metadata.sql",
    "--dbname=postgres"
  ], "BC_RESTORE_STORAGE_METADATA");
  console.log("BC_RESTORE_STORAGE_METADATA=PASS; temporary storage metadata replaced from source");

  const dropManaged = `DO $drop$ DECLARE r record; BEGIN FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname IN ('auth','storage') LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename); END LOOP; END $drop$;`;
  dockerPsqlLocal(["psql", "-X", "--set=ON_ERROR_STOP=1", "--command", dropManaged, "--dbname=postgres"], "BC_RESTORE_CLEAR_LOCAL_MANAGED_POLICIES");
  dockerPsqlLocal(["psql", "-X", "--set=ON_ERROR_STOP=1", "--file=/backup/restored/managed-policies.sql", "--dbname=postgres"], "BC_RESTORE_MANAGED_POLICIES");
  console.log("BC_RESTORE_MANAGED_POLICIES=PASS");
}

async function uploadStorage() {
  const manifestPath = path.join(restored, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const apiUrl = (process.env.API_URL || "").replace(/\/+$/, "");
  const serviceKey = process.env.SERVICE_ROLE_KEY || "";
  if (!apiUrl || !serviceKey) throw new Error("LOCAL_STORAGE_API_CONFIG=FAIL; endpoint or local service key missing");
  let totalBytes = 0;
  for (const item of (manifest.storage_files || [])) {
    const segments = String(item.name).split("/");
    if (!item.name || item.name.startsWith("/") || segments.some(part => !part || part === "." || part === "..")) {
      throw new Error("BC_STORAGE_RESTORE=FAIL; unsafe object path");
    }
    const localFile = path.join(restored, "storage", "productos", ...segments);
    const buf = fs.readFileSync(localFile);
    const digest = crypto.createHash("sha256").update(buf).digest("hex");
    if (digest !== item.sha256 || buf.length !== item.bytes) throw new Error("BC_STORAGE_RESTORE=FAIL; decrypted object integrity mismatch");
    const encoded = segments.map(encodeURIComponent).join("/");
    const endpoint = `${apiUrl}/storage/v1/object/productos/${encoded}`;
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": item.content_type || "application/octet-stream", "x-upsert": "true" };
    const put = await fetch(endpoint, { method: "POST", headers, body: buf });
    if (!put.ok) throw new Error(`BC_STORAGE_RESTORE=FAIL; upload HTTP ${put.status}; object index without name=${totalBytes === 0 ? 1 : "next"}`);
    const downloadUrl = `${apiUrl}/storage/v1/object/public/productos/${encoded}`;
    const get = await fetch(downloadUrl);
    if (!get.ok) throw new Error(`BC_STORAGE_RESTORE=FAIL; verification download HTTP ${get.status}`);
    const after = Buffer.from(await get.arrayBuffer());
    const afterHash = crypto.createHash("sha256").update(after).digest("hex");
    if (afterHash !== item.sha256 || after.length !== item.bytes) throw new Error("BC_STORAGE_RESTORE=FAIL; restored object bytes differ from encrypted backup");
    totalBytes += after.length;
  }
  fs.writeFileSync(path.join(root, "storage-restore-report.json"), JSON.stringify({ status: "PASS", object_count: (manifest.storage_files || []).length, total_bytes: totalBytes, all_sha256_verified: true }, null, 2) + "\n", { mode: 0o600 });
  console.log(`BC_STORAGE_RESTORE=PASS; ${(manifest.storage_files || []).length} objects; ${totalBytes} bytes; SHA-256 matches after local Storage API download`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}

function signature(value) {
  return JSON.stringify(canonical(value));
}

async function verify() {
  const manifest = JSON.parse(fs.readFileSync(path.join(restored, "manifest.json"), "utf8"));
  const source = manifest;
  const target = snapshot(connectionEnv(process.env.DB_URL || process.env.LOCAL_DB_URL, "disable"), "RESTORE");
  const checks = {};
  const issues = [];
  const sourceRows = source.public_rows || {};
  const targetRows = target.public_rows || {};
  const missingOrDifferent = [];
  for (const [table, count] of Object.entries(sourceRows)) {
    if (!(table in targetRows) || targetRows[table] !== count) missingOrDifferent.push(table);
  }
  checks.public_table_counts_match = missingOrDifferent.length === 0;
  checks.public_source_table_count = Object.keys(sourceRows).length;
  checks.public_table_count_mismatches = missingOrDifferent.length;
  if (missingOrDifferent.length) issues.push("public table counts differ");

  const targetRls = new Set(target.public_rls_tables || []);
  const rlsMissing = (source.public_rls_tables || []).filter(n => !targetRls.has(n));
  checks.public_rls_enabled_matches = rlsMissing.length === 0;
  checks.public_rls_tables_missing = rlsMissing.length;
  if (rlsMissing.length) issues.push("RLS enabled-table list differs");

  const targetPublicPolicies = new Set((target.public_policies || []).map(signature));
  const sourcePublicPolicies = (source.public_policies || []).map(signature);
  const publicPoliciesMissing = sourcePublicPolicies.filter(s => !targetPublicPolicies.has(s));
  checks.public_policies_restored = publicPoliciesMissing.length === 0;
  checks.public_policy_count_source = sourcePublicPolicies.length;
  checks.public_policy_count_missing = publicPoliciesMissing.length;
  if (publicPoliciesMissing.length) issues.push("public policies missing or different");

  const sourceManagedPolicies = new Set((source.managed_policies || []).map(signature));
  const targetManagedPolicies = new Set((target.managed_policies || []).map(signature));
  const managedPoliciesMissing = [...sourceManagedPolicies].filter(s => !targetManagedPolicies.has(s));
  const unexpectedManagedPolicies = [...targetManagedPolicies].filter(s => !sourceManagedPolicies.has(s));
  checks.auth_storage_policies_restored_exactly = managedPoliciesMissing.length === 0 && unexpectedManagedPolicies.length === 0;
  checks.auth_storage_policy_count_source = sourceManagedPolicies.size;
  checks.auth_storage_policy_count_restored = targetManagedPolicies.size;
  if (managedPoliciesMissing.length || unexpectedManagedPolicies.length) issues.push("auth/storage policies differ");

  const targetFunctions = new Set(target.public_function_signatures || []);
  const missingFunctions = (source.public_function_signatures || []).filter(s => !targetFunctions.has(s));
  checks.public_rpc_functions_present = missingFunctions.length === 0;
  checks.public_function_count_source = (source.public_function_signatures || []).length;
  checks.public_functions_missing = missingFunctions.length;
  if (missingFunctions.length) issues.push("public functions missing");

  checks.auth_users_match = Number(source.auth_users) === Number(target.auth_users);
  checks.auth_identities_match = Number(source.auth_identities) === Number(target.auth_identities);
  if (!checks.auth_users_match || !checks.auth_identities_match) issues.push("Auth user/identity counts differ");

  checks.storage_bucket_count_match = Number(source.storage_buckets) === Number(target.storage_buckets);
  checks.storage_object_count_match = Number(source.storage_objects) === Number(target.storage_objects);
  const sourceProductNames = (source.storage_product_objects || []).map(x => x.name).sort();
  const targetProductNames = (target.storage_product_objects || []).map(x => x.name).sort();
  checks.product_object_names_match = signature(sourceProductNames) === signature(targetProductNames);
  if (!checks.storage_bucket_count_match || !checks.storage_object_count_match || !checks.product_object_names_match) issues.push("Storage metadata counts or product paths differ");

  const targetExtensions = new Set(target.extensions || []);
  const missingExtensions = (source.extensions || []).filter(x => !targetExtensions.has(x));
  checks.required_extensions_present = missingExtensions.length === 0;
  checks.missing_extension_count = missingExtensions.length;
  if (missingExtensions.length) issues.push("required extension missing");

  let storageReport = { status: "MISSING", object_count: 0, total_bytes: 0, all_sha256_verified: false };
  const storageReportPath = path.join(root, "storage-restore-report.json");
  if (fs.existsSync(storageReportPath)) storageReport = JSON.parse(fs.readFileSync(storageReportPath, "utf8"));
  checks.storage_file_hashes_verified = storageReport.status === "PASS" && storageReport.all_sha256_verified === true;
  checks.storage_file_count = Number(storageReport.object_count || 0);
  checks.storage_file_bytes = Number(storageReport.total_bytes || 0);
  if (!checks.storage_file_hashes_verified || checks.storage_file_count !== (source.storage_files || []).length) issues.push("Storage file byte verification failed");

  const report = {
    format: "battlecruiser-isolated-restore-report-v1",
    status: issues.length ? "FAIL" : "PASS",
    project_ref: projectRef,
    generated_at_utc: new Date().toISOString(),
    checks,
    source_public_row_tables: Object.keys(sourceRows).length,
    restored_public_row_tables_including_local_extensions: Object.keys(targetRows).length,
    source_auth_users: Number(source.auth_users),
    restored_auth_users: Number(target.auth_users),
    source_auth_identities: Number(source.auth_identities),
    restored_auth_identities: Number(target.auth_identities),
    source_storage_buckets: Number(source.storage_buckets),
    restored_storage_buckets: Number(target.storage_buckets),
    source_storage_objects: Number(source.storage_objects),
    restored_storage_objects: Number(target.storage_objects),
    issues
  };
  fs.writeFileSync(path.join(root, "restore-report.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  if (issues.length) throw new Error(`BC_ISOLATED_RESTORE_RECONCILIATION=FAIL; ${issues.join("; ")}; report saved without row data or credentials`);
  console.log(`BC_ISOLATED_RESTORE_RECONCILIATION=PASS; ${Object.keys(sourceRows).length} source public tables, RLS/policies/RPC, ${source.auth_users} Auth users, ${source.auth_identities} identities, ${source.storage_buckets} buckets, ${source.storage_objects} Storage objects; Storage file SHA-256 PASS`);
}

async function main() {
  const mode = process.argv[2];
  try {
    if (mode === "backup") await backup();
    else if (mode === "restore") await restore();
    else if (mode === "upload-storage") await uploadStorage();
    else if (mode === "verify") await verify();
    else throw new Error("Usage: node scripts/bc-backup-restore-preflight.mjs backup|restore|upload-storage|verify");
  } catch (error) {
    console.error(redact(error?.message || "unknown error"));
    process.exitCode = 1;
  }
}

await main();
