"use strict";
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

test("cash declaration is visible before handover but cannot be approved or counted early", () => {
  const admin = read("public/js/aprobaciones-admin.js");
  const migration = read("supabase/migrations/20261113180000_admin_show_pending_jornada_cash_declarations.sql");
  assert.match(admin, /ESPERANDO_ENTREGA/);
  assert.match(admin, /disabled=!!b\.disabled/);
  assert.match(migration, /ESPERANDO_ENTREGA/);
  assert.match(migration, /monto_contado IS NULL/);
  assert.doesNotMatch(migration, /AND s\.estado='COMPLETADA'/);
  assert.match(migration, /tiene_permiso/);
});

test("PWA release versions stay aligned after the jornada UX update", () => {
  const app = read("public/app.js");
  const sw = read("public/service-worker.js");
  const html = read("public/index.html");
  assert.match(app, /const VERSION="9\.5\.107"/);
  assert.match(sw, /BC_SW_VERSION = "9\.5\.107"/);
  assert.match(html, /app\.js\?v=9\.5\.107/);
  assert.match(app, /bc7-jornada-ui\.js","7\.29"/);
  assert.match(sw, /bc7-jornada-ui\.js\?v=7\.29/);
  assert.match(app, /aprobaciones-admin\.js","20261113\.4"/);
  assert.match(sw, /aprobaciones-admin\.js\?v=20261113\.4/);
});
