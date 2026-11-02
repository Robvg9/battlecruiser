#!/usr/bin/env node
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, spawn } from "node:child_process";

const root = process.env.BC_BACKUP_ROOT || path.join(process.env.RUNNER_TEMP || "/tmp", "bc-backup-restore");
const restored = path.join(root, "restored");
const sourceManifest = path.join(restored, "manifest.json");
const scope = JSON.parse(fs.readFileSync(path.resolve("config/bc-step12-reset-scope.json"), "utf8"));
const deleted = scope.delete_public_tables;
const preserved = scope.preserve_public_tables;
const image = "postgres:17.6-alpine";
const projectRef = process.env.PROJECT_REF || "papxnkkjtkxsitcsvcme";

function stop(message) { throw new Error(message); }
function redact(value) {
  let s = String(value || "");
  for (const secret of [process.env.DB_URL, process.env.LOCAL_DB_URL, process.env.SERVICE_ROLE_KEY, process.env.BC_BACKUP_PASSPHRASE]) {
    if (secret) s = s.split(secret).join("[REDACTED]");
  }
  return s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]");
}
function guard() {
  if (process.env.BC_STEP12_REHEARSAL !== "1" || projectRef !== "papxnkkjtkxsitcsvcme") stop("STEP12_GUARD=FAIL");
  const db = new URL(process.env.DB_URL || process.env.LOCAL_DB_URL || "");
  const api = new URL(process.env.API_URL || "");
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (!loopback.has(db.hostname) || db.port !== "54322") stop("STEP12_DB_GUARD=FAIL; only local loopback:54322");
  if (!loopback.has(api.hostname) || api.port !== "54321") stop("STEP12_API_GUARD=FAIL; only local loopback:54321");
  if (db.hostname.endsWith(".supabase.co") || api.hostname.endsWith(".supabase.co")) stop("STEP12_GUARD=FAIL; remote endpoint forbidden");
  if (!process.env.SERVICE_ROLE_KEY || !fs.existsSync(sourceManifest)) stop("STEP12_CONFIG=FAIL; local service key or restored manifest missing");
  if (deleted.length !== 58 || preserved.length !== 3 || !["roles","permisos","auditoria_operaciones"].every(x => preserved.includes(x))) stop("STEP12_SCOPE=FAIL");
}
function pgEnv() {
  const u = new URL(process.env.DB_URL || process.env.LOCAL_DB_URL);
  if (!["127.0.0.1","localhost","[::1]"].includes(u.hostname) || u.port !== "54322") stop("STEP12_DOCKER_GUARD=FAIL");
  return { ...process.env, PGHOST:u.hostname, PGPORT:u.port, PGUSER:decodeURIComponent(u.username),
    PGPASSWORD:decodeURIComponent(u.password), PGDATABASE:decodeURIComponent(u.pathname.slice(1)),
    PGSSLMODE:"disable", PGCONNECT_TIMEOUT:"10" };
}
function dockerArgs(args) {
  return ["run","--rm","--network","host","--env","PGHOST","--env","PGPORT","--env","PGUSER",
    "--env","PGPASSWORD","--env","PGDATABASE","--env","PGSSLMODE","--env","PGCONNECT_TIMEOUT",image,...args];
}
function psql(sql,label) {
  const r=spawnSync("docker",dockerArgs(["psql","-X","-A","-t","-v","ON_ERROR_STOP=1","-c",sql]),
    {encoding:"utf8",env:pgEnv(),maxBuffer:32*1024*1024});
  if(r.error || r.status!==0) stop(label+"=FAIL; "+redact((r.stderr||r.error?.message||"psql failed").slice(-1200)));
  return (r.stdout||"").trim();
}
function psqlAsync(sql,label) {
  return new Promise((resolve,reject)=>{
    const c=spawn("docker",dockerArgs(["psql","-X","-A","-t","-v","ON_ERROR_STOP=1","-c",sql]),
      {env:pgEnv(),stdio:["ignore","pipe","pipe"],windowsHide:true});
    let out="",err="";
    c.stdout.on("data",x=>out+=x); c.stderr.on("data",x=>err+=x);
    c.on("error",e=>reject(new Error(label+"=FAIL; "+redact(e.message))));
    c.on("close",code=>code===0?resolve(out.trim()):reject(new Error(label+"=FAIL; "+redact(err).slice(-1200))));
  });
}
function q(v) { return "'" + String(v).replace(/'/g,"''") + "'"; }
function rowsSql() {
  const list=[...deleted,...preserved].sort().map(q).join(",");
  return "(SELECT COALESCE(jsonb_object_agg(table_name,row_count ORDER BY table_name),'{}'::jsonb) FROM ("+
    "SELECT table_name,((xpath('//*[local-name()=\"c\"]/text()',query_to_xml(format('SELECT count(*) AS c FROM public.%I',table_name),false,true,'')))[1]::text)::bigint AS row_count "+
    "FROM unnest(ARRAY["+list+"]::text[]) AS t(table_name)) counts)";
}
function snapshot() {
  const sql="SELECT jsonb_build_object("+
    "'public_rows',"+rowsSql()+","+
    "'auth_users',(SELECT count(*) FROM auth.users),"+
    "'auth_identities',(SELECT count(*) FROM auth.identities),"+
    "'storage_buckets',(SELECT count(*) FROM storage.buckets),"+
    "'storage_objects',(SELECT count(*) FROM storage.objects),"+
    "'migration_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),"+
    "'migration_fingerprint',(SELECT md5(COALESCE(string_agg(version||'|'||COALESCE(name,'')||'|'||md5(COALESCE(array_to_string(statements,E'\\\\n'),''))||'|'||md5(COALESCE(array_to_string(rollback,E'\\\\n'),'')),E'\\\\n' ORDER BY version),'')) FROM supabase_migrations.schema_migrations),"+
    "'roles',(SELECT count(*) FROM public.roles),"+
    "'permissions',(SELECT count(*) FROM public.permisos),"+
    "'audit_rows',(SELECT count(*) FROM public.auditoria_operaciones),"+
    "'public_policy_count',(SELECT count(*) FROM pg_policies WHERE schemaname='public'),"+
    "'public_rls_disabled',(SELECT count(*) FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=t.schemaname WHERE t.schemaname='public' AND NOT c.relrowsecurity),"+
    "'bucket_products_exists',(SELECT count(*) FROM storage.buckets WHERE id='productos'))::text";
  const result=JSON.parse(psql(sql,"STEP12_SNAPSHOT"));
  if(!result.public_rows || Object.keys(result.public_rows).length!==61) stop("STEP12_SNAPSHOT=FAIL; incomplete public table counts");
  return result;
}
function exact(a,b,label) { if(JSON.stringify(a)!==JSON.stringify(b)) stop(label+"=FAIL; counts differ"); }
async function api(pathname,method="GET",body=undefined,expected=[200,201,204]) {
  const base=(process.env.API_URL||"").replace(/\\/+$/,""), key=process.env.SERVICE_ROLE_KEY;
  const res=await fetch(base+pathname,{method,headers:{apikey:key,Authorization:"Bearer "+key,...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const raw=await res.text();
  if(!expected.includes(res.status)) stop("STEP12_LOCAL_API=FAIL; "+method+" "+pathname.split("?")[0]+" HTTP "+res.status+" "+redact(raw).slice(0,500));
  let json=null; try{json=raw?JSON.parse(raw):null;}catch{}
  return json;
}
async function authUsers() {
  const r=await api("/auth/v1/admin/users?page=1&per_page=1000");
  const users=Array.isArray(r)?r:(r?.users||[]);
  if(!Array.isArray(users)) stop("STEP12_AUTH_LIST=FAIL");
  return users;
}
async function removeAuth(id) { await api("/auth/v1/admin/users/"+encodeURIComponent(id),"DELETE",undefined,[200,204]); }
async function addAuth(email,password) {
  const r=await api("/auth/v1/admin/users","POST",{email,password,email_confirm:true,user_metadata:{source:"step12-isolated-rehearsal"}},[200,201]);
  const id=r?.id||r?.user?.id; if(!id) stop("STEP12_AUTH_CREATE=FAIL"); return id;
}
async function storageObjects() {
  const r=await api("/storage/v1/object/list/productos","POST",{prefix:"",limit:1000,offset:0,sortBy:{column:"name",order:"asc"}},[200]);
  if(!Array.isArray(r)) stop("STEP12_STORAGE_LIST=FAIL"); return r;
}
async function removeObjects(names) {
  for(let i=0;i<names.length;i+=100) await api("/storage/v1/object/productos","DELETE",{prefixes:names.slice(i,i+100)},[200,204]);
}
async function uploadObject(name,bytes) {
  const base=(process.env.API_URL||"").replace(/\\/+$/,""), key=process.env.SERVICE_ROLE_KEY;
  const url=base+"/storage/v1/object/productos/"+name.split("/").map(encodeURIComponent).join("/");
  const r=await fetch(url,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"text/plain","x-upsert":"false"},body:bytes});
  if(![200,201].includes(r.status)) stop("STEP12_STORAGE_UPLOAD=FAIL; HTTP "+r.status);
}
async function downloadObject(name) {
  const base=(process.env.API_URL||"").replace(/\\/+$/,""),key=process.env.SERVICE_ROLE_KEY;
  const url=base+"/storage/v1/object/productos/"+name.split("/").map(encodeURIComponent).join("/");
  const r=await fetch(url,{headers:{apikey:key,Authorization:"Bearer "+key}});
  if(!r.ok) stop("STEP12_STORAGE_READBACK=FAIL; HTTP "+r.status);
  return Buffer.from(await r.arrayBuffer());
}
function labDdl() {
  const target=deleted.map(x=>"public."+x).join(", ");
  return [
    "CREATE SCHEMA IF NOT EXISTS bc_step12_lab",
    "CREATE TABLE IF NOT EXISTS bc_step12_lab.reset_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),status text NOT NULL DEFAULT 'OPEN',idempotency_key uuid,completed_at timestamptz)",
    "INSERT INTO bc_step12_lab.reset_state(singleton,status) VALUES(true,'OPEN') ON CONFLICT(singleton) DO NOTHING",
    "CREATE OR REPLACE FUNCTION bc_step12_lab.run_reset(p_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$ DECLARE v bc_step12_lab.reset_state; BEGIN PERFORM pg_advisory_xact_lock(20261102,12); SELECT * INTO v FROM bc_step12_lab.reset_state WHERE singleton=true FOR UPDATE; IF v.status='COMPLETED' AND v.idempotency_key=p_key THEN RETURN jsonb_build_object('result','IDEMPOTENT'); END IF; IF v.status='COMPLETED' THEN RETURN jsonb_build_object('result','RESET_ALREADY_COMPLETED'); END IF; UPDATE bc_step12_lab.reset_state SET status='RUNNING',idempotency_key=p_key WHERE singleton=true; TRUNCATE TABLE "+target+" RESTART IDENTITY; INSERT INTO public.auditoria_operaciones(tipo,usuario_nombre,descripcion,estado) VALUES('STEP12_RESET_REHEARSAL','SYSTEM_TEST','Isolated synthetic reset rehearsal; production was not modified.','PASS'); UPDATE bc_step12_lab.reset_state SET status='COMPLETED',completed_at=clock_timestamp() WHERE singleton=true; RETURN jsonb_build_object('result','RESET_STARTED'); END $fn$",
    "CREATE TABLE IF NOT EXISTS bc_step12_lab.bootstrap_gates(gate_name text PRIMARY KEY,attempts integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'OPEN',idempotency_key uuid,auth_user_id uuid)",
    "INSERT INTO bc_step12_lab.bootstrap_gates(gate_name) VALUES('rate'),('race'),('success') ON CONFLICT(gate_name) DO NOTHING",
    "CREATE OR REPLACE FUNCTION bc_step12_lab.bootstrap_try(p_gate text,p_key uuid,p_token_valid boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$ DECLARE v bc_step12_lab.bootstrap_gates; BEGIN PERFORM pg_advisory_xact_lock(hashtext(p_gate),20261102); SELECT * INTO v FROM bc_step12_lab.bootstrap_gates WHERE gate_name=p_gate FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_BOOTSTRAP_GATE'; END IF; IF v.status='LOCKED' THEN RETURN 'LOCKED'; END IF; IF v.status='CONSUMED' THEN IF v.idempotency_key=p_key THEN RETURN 'IDEMPOTENT'; END IF; RETURN 'CONSUMED'; END IF; IF v.status='RESERVED' THEN IF v.idempotency_key=p_key THEN RETURN 'RESERVED_IDEMPOTENT'; END IF; RETURN 'BUSY'; END IF; IF NOT p_token_valid THEN UPDATE bc_step12_lab.bootstrap_gates SET attempts=LEAST(attempts+1,5),status=CASE WHEN attempts+1>=5 THEN 'LOCKED' ELSE 'OPEN' END WHERE gate_name=p_gate; RETURN CASE WHEN v.attempts+1>=5 THEN 'LOCKED' ELSE 'INVALID_TOKEN' END; END IF; IF v.attempts>=5 THEN UPDATE bc_step12_lab.bootstrap_gates SET status='LOCKED' WHERE gate_name=p_gate; RETURN 'LOCKED'; END IF; UPDATE bc_step12_lab.bootstrap_gates SET status='RESERVED',idempotency_key=p_key WHERE gate_name=p_gate; RETURN 'RESERVED'; END $fn$",
    "CREATE OR REPLACE FUNCTION bc_step12_lab.bootstrap_complete(p_gate text,p_key uuid,p_user_id uuid,p_nombre text,p_role_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$ DECLARE v bc_step12_lab.bootstrap_gates; BEGIN PERFORM pg_advisory_xact_lock(hashtext(p_gate),20261102); SELECT * INTO v FROM bc_step12_lab.bootstrap_gates WHERE gate_name=p_gate FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_BOOTSTRAP_GATE'; END IF; IF v.status='CONSUMED' AND v.idempotency_key=p_key AND v.auth_user_id=p_user_id THEN RETURN 'IDEMPOTENT'; END IF; IF v.status<>'RESERVED' OR v.idempotency_key IS DISTINCT FROM p_key THEN RETURN 'REJECTED'; END IF; IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'AUTH_USER_NOT_FOUND'; END IF; INSERT INTO public.usuarios(id,nombre,role_id,activo) VALUES(p_user_id,p_nombre,p_role_id,true); UPDATE bc_step12_lab.bootstrap_gates SET status='CONSUMED',auth_user_id=p_user_id WHERE gate_name=p_gate; INSERT INTO public.auditoria_operaciones(tipo,usuario_nombre,descripcion,estado) VALUES('STEP12_BOOTSTRAP_REHEARSAL','SYSTEM_TEST','Synthetic first-owner bootstrap completed in isolated database.','PASS'); RETURN 'COMPLETED'; END $fn$",
    "CREATE OR REPLACE FUNCTION bc_step12_lab.bootstrap_abort(p_gate text,p_key uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$ DECLARE v bc_step12_lab.bootstrap_gates; BEGIN PERFORM pg_advisory_xact_lock(hashtext(p_gate),20261102); SELECT * INTO v FROM bc_step12_lab.bootstrap_gates WHERE gate_name=p_gate FOR UPDATE; IF FOUND AND v.status='RESERVED' AND v.idempotency_key=p_key THEN UPDATE bc_step12_lab.bootstrap_gates SET status='OPEN',idempotency_key=NULL,auth_user_id=NULL WHERE gate_name=p_gate; RETURN 'ABORTED'; END IF; RETURN 'NOOP'; END $fn$",
    "REVOKE ALL ON FUNCTION bc_step12_lab.run_reset(uuid) FROM PUBLIC,anon,authenticated",
    "REVOKE ALL ON FUNCTION bc_step12_lab.bootstrap_try(text,uuid,boolean) FROM PUBLIC,anon,authenticated",
    "REVOKE ALL ON FUNCTION bc_step12_lab.bootstrap_complete(text,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated",
    "REVOKE ALL ON FUNCTION bc_step12_lab.bootstrap_abort(text,uuid) FROM PUBLIC,anon,authenticated",
    "GRANT EXECUTE ON FUNCTION bc_step12_lab.run_reset(uuid) TO service_role",
    "GRANT EXECUTE ON FUNCTION bc_step12_lab.bootstrap_try(text,uuid,boolean) TO service_role",
    "GRANT EXECUTE ON FUNCTION bc_step12_lab.bootstrap_complete(text,uuid,uuid,text,uuid) TO service_role",
    "GRANT EXECUTE ON FUNCTION bc_step12_lab.bootstrap_abort(text,uuid) TO service_role"
  ].join(";\n")+";";
}
async function main() {
  guard();
  const source=JSON.parse(fs.readFileSync(sourceManifest,"utf8"));
  const before=snapshot();
  if(before.migration_count!==Number(source.supabase_migration_count) || before.migration_fingerprint!==source.supabase_migration_fingerprint) stop("STEP12_PRE_RESET_MIGRATION_HISTORY=FAIL");
  exact(before.public_rows,source.public_rows,"STEP12_PRE_RESET_PUBLIC_ROWS");
  if(before.auth_users!==Number(source.auth_users) || before.auth_identities!==Number(source.auth_identities) ||
     before.storage_buckets!==Number(source.storage_buckets) || before.storage_objects!==Number(source.storage_objects)) stop("STEP12_PRE_RESET_AUTH_STORAGE=FAIL");
  if(before.public_rows.roles!==3 || before.public_rows.permisos!==265 || before.public_rows.auditoria_operaciones<1 ||
     before.public_rls_disabled!==0 || before.bucket_products_exists!==1) stop("STEP12_PROTECTED_BASELINE=FAIL");

  const rollbackSql="DO $bc$ BEGIN BEGIN TRUNCATE TABLE "+deleted.map(x=>"public."+x).join(", ")+" RESTART IDENTITY; RAISE EXCEPTION 'BC_STEP12_INJECTED_FAILURE'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'BC_STEP12_INJECTED_FAILURE' THEN RAISE; END IF; END; END $bc$";
  psql(rollbackSql,"STEP12_INJECTED_ROLLBACK");
  const afterRollback=snapshot();
  exact(before.public_rows,afterRollback.public_rows,"STEP12_ROLLBACK_COUNTS");
  if(before.migration_fingerprint!==afterRollback.migration_fingerprint || before.audit_rows!==afterRollback.audit_rows) stop("STEP12_ROLLBACK=FAIL");

  psql(labDdl(),"STEP12_LAB_STATE_MACHINE");
  const keys=[crypto.randomUUID(),crypto.randomUUID()];
  const results=await Promise.all(keys.map((k,i)=>psqlAsync("SELECT bc_step12_lab.run_reset('"+k+"'::uuid)::text","STEP12_CONCURRENT_RESET_"+i)));
  const outcomes=results.map(x=>JSON.parse(x));
  if(outcomes.filter(x=>x.result==="RESET_STARTED").length!==1 || outcomes.filter(x=>x.result==="RESET_ALREADY_COMPLETED").length!==1) stop("STEP12_RESET_CONCURRENCY=FAIL");
  const winner=keys[outcomes.findIndex(x=>x.result==="RESET_STARTED")];
  const retry=JSON.parse(psql("SELECT bc_step12_lab.run_reset('"+winner+"'::uuid)::text","STEP12_RESET_IDEMPOTENCY"));
  if(retry.result!=="IDEMPOTENT") stop("STEP12_RESET_IDEMPOTENCY=FAIL");

  const afterDb=snapshot();
  if(deleted.some(t=>afterDb.public_rows[t]!==0)) stop("STEP12_RESET_PUBLIC=FAIL");
  if(afterDb.public_rows.roles!==before.public_rows.roles || afterDb.public_rows.permisos!==before.public_rows.permisos ||
     afterDb.audit_rows!==before.audit_rows+1 || afterDb.migration_count!==before.migration_count ||
     afterDb.migration_fingerprint!==before.migration_fingerprint) stop("STEP12_RESET_PRESERVATION=FAIL");
  if(Number(psql("SELECT count(*) FROM public.auditoria_operaciones WHERE tipo='STEP12_RESET_REHEARSAL'","STEP12_AUDIT_COUNT"))!==1) stop("STEP12_AUDIT_IDEMPOTENCY=FAIL");

  const users=await authUsers();
  let deletedAuth=0;
  for(const user of users){ if(!user.id) stop("STEP12_AUTH_DELETE=FAIL; Auth ID missing"); await removeAuth(user.id); deletedAuth++; }
  if((await authUsers()).length!==0 || Number(psql("SELECT count(*) FROM auth.users","STEP12_AUTH_COUNT"))!==0) stop("STEP12_AUTH_DELETE=FAIL");
  const sourceNames=(source.storage_files||[]).map(x=>x.name);
  const restoredObjects=await storageObjects();
  const restoredNames=restoredObjects.map(x=>x.name).filter(Boolean);
  if(restoredNames.length!==sourceNames.length || sourceNames.some(x=>!restoredNames.includes(x))) stop("STEP12_STORAGE_SOURCE=FAIL");
  await removeObjects(restoredNames);
  if((await storageObjects()).length!==0 || Number(psql("SELECT count(*) FROM storage.objects WHERE bucket_id='productos'","STEP12_STORAGE_COUNT"))!==0) stop("STEP12_STORAGE_DELETE=FAIL");
  const buckets=await api("/storage/v1/bucket");
  if(!Array.isArray(buckets) || !buckets.some(x=>x.name==="productos" && x.public===true)) stop("STEP12_BUCKET_PRESERVATION=FAIL");
  const objectName="step12-rehearsal/"+crypto.randomUUID()+".txt";
  const bytes=Buffer.from("BattleCruiser Step 12 isolated Storage sentinel\n","utf8");
  const digest=crypto.createHash("sha256").update(bytes).digest("hex");
  await uploadObject(objectName,bytes);
  const received=await downloadObject(objectName);
  if(crypto.createHash("sha256").update(received).digest("hex")!==digest) stop("STEP12_STORAGE_READBACK=FAIL");
  await removeObjects([objectName]);
  if((await storageObjects()).length!==0) stop("STEP12_STORAGE_CLEANUP=FAIL");

  const roleId=psql("SELECT id::text FROM public.roles WHERE lower(nombre)='dueño' AND activo=true LIMIT 1","STEP12_OWNER_ROLE").trim();
  if(!roleId) stop("STEP12_OWNER_ROLE=FAIL");
  const invalid=[];
  for(let i=0;i<5;i++) invalid.push(psql("SELECT bc_step12_lab.bootstrap_try('rate','"+crypto.randomUUID()+"'::uuid,false)","STEP12_BOOTSTRAP_RATE").trim());
  const sixth=psql("SELECT bc_step12_lab.bootstrap_try('rate','"+crypto.randomUUID()+"'::uuid,false)","STEP12_BOOTSTRAP_LOCK").trim();
  const attempts=Number(psql("SELECT attempts FROM bc_step12_lab.bootstrap_gates WHERE gate_name='rate'","STEP12_BOOTSTRAP_ATTEMPTS"));
  if(invalid.slice(0,4).some(x=>x!=="INVALID_TOKEN") || invalid[4]!=="LOCKED" || sixth!=="LOCKED" || attempts!==5) stop("STEP12_BOOTSTRAP_RATE_LIMIT=FAIL");

  const raceKeys=[crypto.randomUUID(),crypto.randomUUID()];
  const race=await Promise.all(raceKeys.map((k,i)=>psqlAsync("SELECT bc_step12_lab.bootstrap_try('race','"+k+"'::uuid,true)","STEP12_BOOTSTRAP_CONCURRENCY_"+i)));
  const raceStatus=race.map(x=>x.trim()).sort();
  if(raceStatus.join(",")!=="BUSY,RESERVED") stop("STEP12_BOOTSTRAP_CONCURRENCY=FAIL");

  const firstKey=crypto.randomUUID();
  if(psql("SELECT bc_step12_lab.bootstrap_try('success','"+firstKey+"'::uuid,true)","STEP12_BOOTSTRAP_RESERVE").trim()!=="RESERVED") stop("STEP12_BOOTSTRAP_RESERVE=FAIL");
  const badId=await addAuth("step12-fail-"+crypto.randomUUID()+"@example.invalid",crypto.randomBytes(32).toString("base64url"));
  const badRole="00000000-0000-4000-8000-000000000001";
  const bad=spawnSync("docker",dockerArgs(["psql","-X","-A","-t","-v","ON_ERROR_STOP=1","-c",
    "SELECT bc_step12_lab.bootstrap_complete('success','"+firstKey+"'::uuid,'"+badId+"'::uuid,'STEP12_FAIL_TEST','"+badRole+"'::uuid)"]),
    {encoding:"utf8",env:{...process.env,...pgEnv()}});
  if(bad.status===0) stop("STEP12_BOOTSTRAP_ATOMICITY=FAIL; invalid role unexpectedly accepted");
  if(Number(psql("SELECT count(*) FROM public.usuarios WHERE id='"+badId+"'::uuid","STEP12_BOOTSTRAP_PARTIAL_PROFILE"))!==0 ||
     psql("SELECT status FROM bc_step12_lab.bootstrap_gates WHERE gate_name='success'","STEP12_BOOTSTRAP_RESERVED").trim()!=="RESERVED") stop("STEP12_BOOTSTRAP_ATOMICITY=FAIL");
  await removeAuth(badId);
  if(psql("SELECT bc_step12_lab.bootstrap_abort('success','"+firstKey+"'::uuid)","STEP12_BOOTSTRAP_COMPENSATE").trim()!=="ABORTED" ||
     (await authUsers()).length!==0) stop("STEP12_BOOTSTRAP_COMPENSATION=FAIL");

  const finalKey=crypto.randomUUID();
  if(psql("SELECT bc_step12_lab.bootstrap_try('success','"+finalKey+"'::uuid,true)","STEP12_BOOTSTRAP_FINAL_RESERVE").trim()!=="RESERVED") stop("STEP12_BOOTSTRAP_FINAL_RESERVE=FAIL");
  const ownerId=await addAuth("step12-owner-"+crypto.randomUUID()+"@example.invalid",crypto.randomBytes(32).toString("base64url"));
  const ownerName="step12-owner-"+crypto.randomUUID().slice(0,8);
  const complete=psql("SELECT bc_step12_lab.bootstrap_complete('success','"+finalKey+"'::uuid,'"+ownerId+"'::uuid,"+q(ownerName)+",'"+roleId+"'::uuid)","STEP12_BOOTSTRAP_COMPLETE").trim();
  const repeated=psql("SELECT bc_step12_lab.bootstrap_complete('success','"+finalKey+"'::uuid,'"+ownerId+"'::uuid,"+q(ownerName)+",'"+roleId+"'::uuid)","STEP12_BOOTSTRAP_IDEMPOTENT").trim();
  const different=psql("SELECT bc_step12_lab.bootstrap_try('success','"+crypto.randomUUID()+"'::uuid,true)","STEP12_BOOTSTRAP_CONSUMED").trim();
  const profile=Number(psql("SELECT count(*) FROM public.usuarios WHERE id='"+ownerId+"'::uuid AND role_id='"+roleId+"'::uuid AND activo=true","STEP12_BOOTSTRAP_PROFILE"));
  const state=psql("SELECT status FROM bc_step12_lab.bootstrap_gates WHERE gate_name='success'","STEP12_BOOTSTRAP_STATE").trim();
  if(complete!=="COMPLETED" || repeated!=="IDEMPOTENT" || different!=="CONSUMED" || profile!==1 || state!=="CONSUMED") stop("STEP12_BOOTSTRAP_ONE_TIME=FAIL");
  const acl=psql("SELECT (NOT has_function_privilege('anon','bc_step12_lab.run_reset(uuid)','EXECUTE'))::text||'|'||(NOT has_function_privilege('authenticated','bc_step12_lab.run_reset(uuid)','EXECUTE'))::text||'|'||has_function_privilege('service_role','bc_step12_lab.run_reset(uuid)','EXECUTE')::text","STEP12_BOOTSTRAP_ACL");
  if(acl!=="true|true|true") stop("STEP12_FUNCTION_ACL=FAIL");

  const final=snapshot();
  if(final.public_rows.roles!==3 || final.public_rows.permisos!==265 || final.public_rls_disabled!==0 ||
     final.migration_count!==before.migration_count || final.migration_fingerprint!==before.migration_fingerprint ||
     final.storage_buckets!==1 || final.storage_objects!==0 || final.auth_users!==1 ||
     final.public_rows.usuarios!==1 || final.public_rows.auditoria_operaciones!==before.audit_rows+2) stop("STEP12_FINAL_RECONCILIATION=FAIL");
  const report={
    format:"battlecruiser-step12-reset-rehearsal-v1",status:"PASS",environment:"isolated-local-supabase-only",
    captured_at_utc:new Date().toISOString(),production_touched:false,
    reset_scope:{public_tables_deleted:58,public_tables_preserved:preserved,auth_users_deleted:deletedAuth,storage_objects_deleted:sourceNames.length},
    backup_restore:{public_table_count:Object.keys(source.public_rows||{}).length,auth_users:source.auth_users,storage_objects:source.storage_objects,
      migration_count:source.supabase_migration_count,migration_fingerprint_match:true},
    checks:{pre_reset_exact_reconciliation:true,injected_sql_failure_rolled_back:true,concurrent_reset_single_winner:true,
      reset_same_key_idempotent:true,reset_different_key_rejected:true,operational_tables_empty:true,roles_and_permissions_preserved:true,
      audit_table_preserved_and_written:true,migration_history_preserved:true,auth_users_deleted_via_admin_api:true,
      storage_objects_deleted_via_storage_api:true,products_bucket_preserved:true,storage_sha256_readback_and_cleanup:true,
      bootstrap_five_attempt_lockout:true,bootstrap_concurrent_reservation_serialized:true,bootstrap_profile_failure_rolled_back:true,
      bootstrap_auth_compensation_verified:true,bootstrap_owner_dueño_role_created:true,bootstrap_one_time_and_idempotent:true,
      service_role_only_function_acl:true,public_rls_all_enabled:true},
    counts:{before,after_database_reset:afterDb,final_after_synthetic_owner:final},
    reset_concurrency:outcomes.map(x=>x.result),bootstrap_rate_attempts:attempts,bootstrap_concurrency:raceStatus,
    bootstrap_synthetic_owner_created:true,production_edge_bootstrap_deployed:false,
    limitations:[
      "Only a fresh Supabase stack bound to loopback was modified; no production endpoint or database was called.",
      "Auth and Storage are APIs outside a PostgreSQL transaction. The tested design uses a one-use reservation, idempotency, compensation and the retained encrypted backup.",
      "This validates the isolated bootstrap state machine, not a deployed PWA/Edge endpoint. Step 14 must implement and verify that integration before production first-admin creation."
    ]
  };
  fs.writeFileSync(path.join(root,"step12-reset-rehearsal.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
  console.log("STEP12_RESET_REHEARSAL=PASS; 58 tables reset synthetically; RBAC/audit/migrations preserved; local Auth+Storage reset; rollback/concurrency/idempotency/bootstrap PASS");
}
main().catch(e=>{console.error(redact(e?.message||e));process.exitCode=1;});
