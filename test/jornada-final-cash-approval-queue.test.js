"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const ADMIN=read("public/js/aprobaciones-admin.js");
const QUEUE=read("supabase/migrations/20261112141000_bc7_jornada_final_cash_admin_queue.sql");
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

test("Final cash declaration approval is independent from the later physical count",()=>{
  assert.ok(ADMIN.includes("x.tipo==='declaracion_jornada'"));
  assert.ok(ADMIN.includes("Aprobar declaración"));
  assert.ok(ADMIN.includes("rpc('bc7_resolver_declaracion_jornada'"));
  assert.ok(ADMIN.includes("Esta decisión aprueba la declaración del importe, no certifica un conteo físico"));
  assert.ok(!ADMIN.includes("acceptButton.disabled=isFinalCash&&!finalCashReady"));
  assert.ok(!ADMIN.includes("rejectButton.hidden=isFinalCash"));
  assert.ok(ADMIN.includes("rpc('bc5_contar_dinero_entregado'")===false,
    "the admin declaration modal must not perform the physical count");
  assert.ok(PHASE.includes("IF v_s.estado<>'COMPLETADA' THEN"),"the server still blocks physical count until handover");
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

test("Approved final cash declarations become countable by the Owner only after handover",()=>{
  const CASH_QUEUE=read("supabase/migrations/20261117220000_jornada_cash_owner_pending_count.sql");
  const CASH_UI=read("public/js/turno-cash-handover-ui.js");
  assert.ok(CASH_QUEUE.includes("'DECLARACION_APROBADA'"));
  assert.ok(CASH_QUEUE.includes("s.estado='COMPLETADA'"));
  assert.ok(CASH_UI.includes("status === 'DECLARACION_APROBADA' && row.monto_contado == null"));
  assert.ok(CASH_UI.includes("if (approvedForCount && completed)"));
  assert.ok(CASH_UI.includes("rpc('bc5_contar_dinero_entregado'"));
});

test("Owner review shows declared final cash separately from physical cash counted",()=>{
  const OWNER_REVIEW=read("public/js/jornada-owner-review.js");
  assert.ok(OWNER_REVIEW.includes("s.efectivo?.declarado"));
  assert.ok(OWNER_REVIEW.includes("Declaración final"));
  assert.ok(OWNER_REVIEW.includes("No se suma al efectivo total recogido"));
  assert.ok(OWNER_REVIEW.includes("Conteo final de caja"));
});

test("cash count module cache key is refreshed with the new UI contract",()=>{
  const APP=read("public/app.js");
  const SW=read("public/service-worker.js");
  assert.ok(APP.includes('"turno-cash-handover-ui.js","1.1"'));
  assert.ok(SW.includes("turno-cash-handover-ui.js?v=1.1"));
});
