"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=file=>fs.readFileSync(path.join(root,file),"utf8");
test("Bajas use one multi-item form and require authenticated session",()=>{
 const module=read("public/js/bajas-multiple.js"),admin=read("public/js/aprobaciones-admin.js"),finance=read("public/js/operaciones-financieras.js");
 assert.match(module,/id="bc-bajas-multiple-form"/);assert.match(module,/id="bc-baja-add"/);assert.match(module,/crear_bajas_multiple/);
 assert.doesNotMatch(module,/async function hasSession/);assert.match(module,/p_idempotency_key: requestIdempotencyKey/);
 assert.match(module,/motivo_general: String\(line\.motivo_general \|\| ''\)/);assert.match(module,/motivo_general: generalReason/);
 assert.match(module,/bc-bajas-default-reason/);assert.match(module,/bc-baja-line-reason-toggle/);
 assert.match(module,/customReason \? row\.querySelector\('\.bc-baja-reason'\)\.value : defaultReason/);
 assert.doesNotMatch(module,/auth\.getSession\(\)/);
 assert.doesNotMatch(module,/!await hasSession\(\)/);
 assert.match(module,/function ensureModal\(\)/);
 assert.match(module,/window\.abrirBajasMultiple = async function/);
 assert.match(module,/dialog\.focus\(\{ preventScroll: true \}\)/);
 assert.doesNotMatch(module,/if \(warehouse\) warehouse\.focus/);
 assert.match(module,/modal\.hidden = false/);
 assert.match(module,/bc-bajas-modal-open/);
 assert.match(module,/api\.auth\.refreshSession\(\)/);
 assert.match(module,/tokenRejected/);
 assert.match(module,/const requestIdempotencyKey = pendingKey/);
 assert.match(module,/persistentRequestKey\(warehouse, lines\)/);
 assert.match(module,/PENDING_REQUEST_PREFIX/);
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
 assert.match(module,/catalogLoadPromise/);
 assert.match(module,/refreshPicker\(host\)/);
 assert.match(css,/bc-baja-line-product\{grid-column:1\/-1/);
 assert.match(css,/bc-baja-line-qty\{grid-column:1\/3/);
 assert.match(css,/bc-bajas-context-fields/);
 assert.match(css,/bc-bajas-list-heading/);
 assert.match(css,/max-height:none;overflow:visible/);
 assert.match(css,/overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch/);
 assert.match(css,/bc-pwa-update-notice/);
 assert.match(hub,/await window\.abrirBajasMultiple\(\)/);
});

test("batch RPC returns one parent request with all Baja child lines",()=>{
 const sql=read("supabase/migrations/20261109210500_baja_approval_requests_and_modal.sql");
 assert.match(sql,/INSERT INTO public\.bajas_solicitudes/);
 assert.match(sql,/UPDATE public\.bajas[\s\S]*SET solicitud_id=v_solicitud_id/);
 assert.match(sql,/jsonb_build_object\([\s\S]*'solicitud_id',v_solicitud_id/);
 assert.match(sql,/md5\(auth\.uid\(\)::text/);
 assert.match(sql,/payload_hash/);
 assert.match(sql,/obtener_detalle_solicitud_baja_admin/);
 assert.match(sql,/resolver_solicitud_bajas_admin/);
});
