"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const ADMIN=read("public/js/aprobaciones-admin.js");
const QUEUE=read("supabase/migrations/20261112141000_bc7_jornada_final_cash_admin_queue.sql");
const DAILY_ONLY=read("supabase/migrations/20261123193000_jornada_daily_cash_without_final_declaration.sql");
const PHASE=read("supabase/migrations/20261113160000_jornada_owner_checklist_cash_reorder.sql");
const MOVEMENTS=read("supabase/migrations/20261112140000_bc7_linked_jornada_movements.sql");
const JOURNEY=read("public/js/bc7-jornada-ui.js");
const CSS=read("public/style.css");
const INDEX=read("public/index.html");
const contentHeaderOrder=/header-right[\s\S]*id="mi-cuenta-btn"[\s\S]*id="logout-btn"/.test(INDEX);

test("Centro de Control includes pending final-cash declarations for JORNADA sessions",()=>{
  assert.ok(QUEUE.includes("'declaracion_jornada'::text"));
  assert.ok(QUEUE.includes("s.bloque='JORNADA'"));
  assert.ok(QUEUE.includes("d.estado_aprobacion IN ('PENDIENTE','ESPERANDO_APROBACION')"));
  assert.ok(QUEUE.includes("d.monto_contado IS NULL"));
  assert.ok(QUEUE.includes("s.estado::text"));
});

test("Final cash declaration is counted once from the administrative approval modal",()=>{
  const FIX=read("supabase/migrations/20261119160000_jornada_retroactive_cut_single_cash_count.sql");
  assert.ok(ADMIN.includes("x.tipo==='declaracion_jornada'"));
  assert.ok(ADMIN.includes("Confirmar conteo físico"));
  assert.ok(ADMIN.includes("rpc('bc5_contar_dinero_entregado'"));
  assert.ok(!ADMIN.includes("Aprobar declaración"));
  assert.ok(ADMIN.includes("rpc('bc7_resolver_declaracion_jornada'"),"rejection remains available for corrections");
  assert.ok(ADMIN.includes("Registra aquí el efectivo contado físicamente"));
  assert.ok(FIX.includes("La declaración final debe confirmarse con el conteo físico en una sola acción."));
  assert.ok(FIX.includes("NOT IN ('PENDIENTE','ESPERANDO_APROBACION','DECLARACION_APROBADA')"));
  assert.ok(PHASE.includes("IF v_s.estado<>'COMPLETADA' THEN"),"the server still blocks count until the handover is complete");
  assert.ok(PHASE.includes("lista_para_conteo"),"physical count still requires the employee checklist");
  assert.ok(QUEUE.includes("s.estado::text"),"the queue retains the real session state while exposing pending declarations");
});

test("Journey movement archive includes exact-session finance and cash records",()=>{
  assert.ok(MOVEMENTS.includes("FROM public.gastos g"));
  assert.ok(MOVEMENTS.includes("FROM public.reinversiones r"));
  assert.ok(MOVEMENTS.includes("FROM public.turno_jornada_entregas_diarias e"));
  assert.ok(MOVEMENTS.includes("FROM public.turno_declaraciones d"));
  assert.ok(MOVEMENTS.includes("dinero_contado_final"));
  assert.ok(JOURNEY.includes("<th>Valor</th>"));
  assert.ok(JOURNEY.includes("Efectivo diario pendiente"));
});

test("Jornada operation forms and mobile header are constrained to the viewport",()=>{
  assert.ok(CSS.includes("#tab-jornada .bc7-panel-stack{display:grid;gap:10px"));
  assert.ok(CSS.includes("#app-shell.visible > header.app-header.app-header > .header-left"));
  assert.ok(CSS.includes("#app-shell.visible > header.app-header.app-header > .header-right"));
  assert.ok(CSS.includes("display:flex!important") || CSS.includes("display:flex"));
  assert.ok(contentHeaderOrder, "Mi Cuenta y Cerrar sesión deben permanecer juntos al extremo derecho");
  assert.ok(CSS.includes("#app-shell.visible > .app-header #user-email"));
  assert.ok(CSS.includes("min-width:0;max-width:100%"));
});


test("Expense and reinvestment approvals are concise and actionable directly from the queue",()=>{
  assert.ok(ADMIN.includes("ha registrado un gasto:"));
  assert.ok(ADMIN.includes("ha registrado una reinversión:"));
  assert.ok(ADMIN.includes("resolverOperativaDirecta(x,'APROBAR')"));
  assert.ok(ADMIN.includes("resolverOperativaDirecta(x,'RECHAZAR')"));
  assert.ok(ADMIN.includes("p_tipo:item.tipo,p_id:item.id,p_decision:decision"));
});


test("final cash label follows the actual handover phase, not a generic pending state",()=>{
  const start=JOURNEY.indexOf("function cashDeclarationHtml(detail){");
  const end=JOURNEY.indexOf("function renderDailyCash",start);
  assert.ok(start>=0&&end>start);
  const block=JOURNEY.slice(start,end);
  assert.match(block,/sessionState==='COMPLETADA'/);
  assert.match(block,/sessionState==='EN_CURSO'/);
  assert.match(block,/approvalState==='PENDIENTE'\|\|approvalState==='ESPERANDO_APROBACION'/);
  assert.match(block,/\?'Esperando aprobación'/);
  assert.match(block,/sessionState==='EN_CURSO'\?'Esperando entrega'/);
});

test("Separate cash panel is now only an exception inbox for counted differences",()=>{
  const CASH_UI=read("public/js/turno-cash-handover-ui.js");
  assert.ok(CASH_UI.includes("estado_aprobacion || '').toUpperCase() === 'CON_DIFERENCIA'"));
  assert.ok(CASH_UI.includes("DIFERENCIAS DE EFECTIVO"));
});

test("Owner review shows declared final cash separately from physical cash counted",()=>{
  const OWNER_REVIEW=read("public/js/jornada-owner-review.js");
  assert.ok(OWNER_REVIEW.includes("s.efectivo?.declarado"));
  assert.ok(OWNER_REVIEW.includes("Declaración final"));
  assert.ok(OWNER_REVIEW.includes("No se suma al efectivo total recogido"));
  assert.ok(OWNER_REVIEW.includes("Conteo final de caja"));
});

test("cash exception inbox cache key is refreshed with the new UI contract",()=>{
  const APP=read("public/app.js");
  const SW=read("public/service-worker.js");
  assert.ok(APP.includes('"turno-cash-handover-ui.js","1.2"'));
  assert.ok(SW.includes("turno-cash-handover-ui.js?v=1.2"));
});


test("retail approvals use daily cash rows, not a second legacy final declaration",()=>{
  assert.match(DAILY_ONLY,/coalesce\(a\.tipo,''\)<>'minorista'/);
  assert.match(DAILY_ONLY,/listar_aprobaciones_admin\(\)/);
  assert.match(DAILY_ONLY,/turno_jornada_conteos_caja/);
  assert.match(DAILY_ONLY,/bc7_contar_efectivo_dueno_jornada/);
  assert.match(DAILY_ONLY,/No se reconoce el filtro de declaración histórica/);
  assert.match(DAILY_ONLY,/Keep legacy turno_declaraciones rows intact/);
  assert.match(ADMIN,/x\.tipo==='entrega_diaria'/);
  assert.match(ADMIN,/resolverOperativaDirecta\(x,'APROBAR'\)/);
});


test("Owner review uses the new independent physical count for retail and hides legacy final totals",()=>{
  assert.match(OWNER_REVIEW,/const isRetail=s\.es_minorista===true/);
  assert.match(OWNER_REVIEW,/if\(!isRetail&&s\.efectivo\?\.declarado!=null\)/);
  assert.match(OWNER_REVIEW,/const ownerPhysicalCash=isRetail\?l\.dinero_final_contado:s\.efectivo\?\.contado/);
  assert.match(OWNER_REVIEW,/El registro legado de declaración final no participa ni se suma/);
  assert.match(DAILY_ONLY,/es_minorista/);
});
