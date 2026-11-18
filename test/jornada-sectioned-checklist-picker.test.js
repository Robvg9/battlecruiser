"use strict";
const { assertPwaReleaseAligned } = require("./helpers/pwa-release-contract");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("new multi-product Baja rows reinitialize the searchable picker after cloning", () => {
  const ui = read("public/js/bc7-jornada-ui.js");
  assert.match(ui, /cloneNode\(true\)/);
  assert.match(ui, /closest\('\.bc-product-picker-field'\)/);
  assert.match(ui, /delete select\.dataset\[key\]/);
  assert.match(ui, /__BC_PRODUCT_PICKER_REFRESH__\(select\)/);
  assert.match(ui, /data-bc7-adjustment-add/);
});

test("each attendant checklist item opens its own operational section", () => {
  const ui = read("public/js/bc7-jornada-ui.js");
  for (const section of ["gastos", "reinversiones", "bajas"]) assert.ok(ui.includes("key:'"+section+"'"), "missing checklist item: " + section);
  assert.ok(ui.includes("data-bc7-checklist-open=\"'+item.key+'\">"));
  assert.match(ui, /data-bc7-checklist-open="inventario_final"/);
  assert.match(ui, /function openChecklistSection\(key\)/);
  assert.match(ui, /data-bc7-finance-form="gasto"/);
  assert.match(ui, /data-bc7-finance-form="reinversion"/);
  assert.match(ui, /data-bc7-adjust-form/);
  assert.match(ui, /function checklistConfirmButtonHtml\(detail,key,isAssigned\)/);
  assert.match(ui, /checklistConfirmButtonHtml\(detail,'gastos',isAssigned\)/);
  assert.match(ui, /checklistConfirmButtonHtml\(detail,'reinversiones',isAssigned\)/);
  assert.match(ui, /checklistConfirmButtonHtml\(detail,'bajas',isAssigned\)/);
  assert.doesNotMatch(ui, /data-bc7-checklist-toggle="'\+item\.key\+'/);
  const openStart=ui.indexOf("function openChecklistSection(key)");
  const openEnd=ui.indexOf("document.addEventListener('keydown'",openStart);
  const modalOpen=openStart>=0&&openEnd>openStart?ui.slice(openStart,openEnd):"";
  assert.match(modalOpen, /bc7-checklist-modal/);
  assert.match(modalOpen, /data-bc7-checklist-modal-action/);
  assert.match(modalOpen, /Enviar evidencia a Administración/);
  assert.match(modalOpen, /form\.requestSubmit\(\)/);
  assert.doesNotMatch(modalOpen, /scrollIntoView/);
  assert.match(ui, /bc7-checklist-section-source" hidden/);
  assert.match(ui, /Cerrar jornada y enviar a Administración/);
});

test("final cash declaration can be approved while the Jornada is open; physical count stays post-handover", () => {
  const admin = read("public/js/aprobaciones-admin.js");
  const migration = read("supabase/migrations/20261117001442_jornada_cash_declaration_approval_decoupled.sql");
  assert.match(admin, /Aprobar declaración/);
  assert.match(admin, /rpc\('bc7_resolver_declaracion_jornada'/);
  assert.ok(admin.includes("acceptButton.disabled=false;"));
  assert.doesNotMatch(admin, /rpc\('bc5_contar_dinero_entregado'/,
    "approval UI must not perform the later physical cash count");

  const queueStart = migration.indexOf("'declaracion_jornada'::text");
  const queueEnd = migration.indexOf("'recepcion_inventario_jornada'::text", queueStart);
  assert.ok(queueStart >= 0 && queueEnd > queueStart, "pending declaration queue must be defined");
  const queue = migration.slice(queueStart, queueEnd);
  assert.match(queue, /d\.estado_aprobacion IN \('PENDIENTE','ESPERANDO_APROBACION'\)/);
  assert.match(queue, /d\.monto_contado IS NULL/);
  assert.doesNotMatch(queue, /AND s\.estado='COMPLETADA'/,
    "declaration review must remain visible before handover");

  const countStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.bc5_contar_dinero_entregado");
  const approvalStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.bc7_resolver_declaracion_jornada");
  assert.ok(countStart >= 0 && approvalStart > countStart);
  const countGate = migration.slice(countStart, approvalStart);
  assert.match(countGate, /IF v_s\.estado<>'COMPLETADA' THEN/);
  assert.match(countGate, /lista_para_conteo/);
  assert.match(countGate, /IF coalesce\(v_d\.estado_aprobacion,''\)<>'DECLARACION_APROBADA' THEN/);
  const approval = migration.slice(approvalStart);
  assert.match(approval, /DECLARACION_APROBADA/);
  assert.match(approval, /public\.tiene_permiso/);
});

test("PWA release versions stay aligned after the jornada UX update", () => {
  const app = read("public/app.js");
  const sw = read("public/service-worker.js");
  const html = read("public/index.html");
  assertPwaReleaseAligned(assert,{app,serviceWorker:sw,index:html});
  assert.match(app, /bc7-jornada-ui\.js","7\.42"/);
  assert.match(sw, /bc7-jornada-ui\.js\?v=7\.42/);
  assert.match(app, /aprobaciones-admin\.js","20261116\.1"/);
  assert.match(sw, /aprobaciones-admin\.js\?v=20261116\.1/);
});
