"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=file=>fs.readFileSync(path.join(root,file),"utf8");
test("Bajas use one multi-item form and require authenticated session",()=>{
 const module=read("public/js/bajas-multiple.js"),admin=read("public/js/aprobaciones-admin.js"),finance=read("public/js/operaciones-financieras.js");
 assert.match(module,/id="bc-bajas-multiple-form"/);assert.match(module,/id="bc-baja-add"/);assert.match(module,/crear_bajas_multiple/);
 assert.match(module,/hasSession/);assert.match(module,/p_idempotency_key: pendingKey/);
 assert.match(module,/function ensureModal\(\)/);
 assert.match(module,/window\.abrirBajasMultiple = async function/);
 assert.match(module,/modal\.hidden = false/);
 assert.match(module,/bc-bajas-modal-open/);
 assert.match(module,/api\.auth\.refreshSession\(\)/);
 assert.match(module,/const params = \{ p_lineas: lines, p_idempotency_key: pendingKey \}/);
 assert.doesNotMatch(admin,/id='adm-baja-form'/);assert.doesNotMatch(finance,/form-salida-producto/);
 assert.doesNotMatch(finance,/setInterval\(\(\)=>\{start\(\)\},10000\)/);
});
test("batch RPC is auth-gated, permission-gated, idempotent and stock-atomic",()=>{
 const sql=read("supabase/migrations/20261108180000_bajas_multiple_atomic_request.sql");
 assert.match(sql,/auth\.uid\(\) IS NULL/);assert.match(sql,/tiene_permiso\('bajas','crear'\)/);
 assert.match(sql,/sum\(x\.cantidad\) AS cantidad_total/);assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/md5\(auth\.uid\(\)::text/);assert.match(sql,/public\.crear_baja\(/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.crear_bajas_multiple\(jsonb, uuid\) FROM PUBLIC, anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.crear_bajas_multiple\(jsonb, uuid\) TO authenticated, service_role/);
});

test("Baja list opens in a single responsive modal, not as a hidden Operations block",()=>{
 const module=read("public/js/bajas-multiple.js"),css=read("public/style.css"),hub=read("public/js/ui-operaciones-hub.js");
 assert.match(module,/bc-bajas-multiple-modal/);
 assert.match(module,/bc-bajas-modal-dialog/);
 assert.match(module,/data-bc-bajas-close/);
 assert.match(css,/\.bc-bajas-multiple-modal\[hidden\]/);
 assert.match(css,/\.bc-bajas-modal-dialog/);
 assert.match(hub,/await window\.abrirBajasMultiple\(\)/);
});
