"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ui = fs.readFileSync(path.join(__dirname, "../public/js/bc7-jornada-ui.js"), "utf8");

test("reinvestment picker loads the full active product catalogue independently of the opening cut", () => {
  const loadStart = ui.indexOf("function ensureWorkspaceOperationData(detail){");
  const loadEnd = ui.indexOf("function activateWorkspaceTab(", loadStart);
  assert.ok(loadStart >= 0 && loadEnd > loadStart, "workspace operation loader must exist");
  const load = ui.slice(loadStart, loadEnd);

  assert.match(load, /rpc\('bc7_entregas_diarias_jornada'/,
    "retail responsible access must be verified by the server");
  assert.match(load, /detail\.server_responsible_access=!!accessResult\.ok/,
    "the server result determines access without depending on the local people catalogue");
  assert.match(load, /const assigned=retail\?\(!!state\.admin\|\|detail\.server_responsible_access\):localAssignment/,
    "retail operations use server-verified responsibility");
  assert.match(load, /const sessionAcceptsPendingOps=\['EN_CURSO','CERRADA_OPERATIVAMENTE'\]\.includes\(sessionStatus\)/,
    "operationally sealed jornadas still accept permitted late operations");
  assert.match(load, /const canCreateReinvestment=sessionAcceptsPendingOps&&assigned&&can\('reinversiones','crear'\)/,
    "the assigned worker's reinvestment permission triggers catalogue loading");
  assert.match(load, /const needsProductCatalog=canAdjust\|\|canCreateReinvestment/,
    "the catalogue loads for either adjustments or reinvestments");
  assert.match(load, /rpc\('bc7_productos_ajuste_jornada'/,
    "the selector uses the server's active-product catalogue RPC");

  const financeStart = ui.indexOf("function financeFormHtml(detail,isAssigned,status){");
  const financeEnd = ui.indexOf("function cashDaysManagerShellHtml(detail,isAssigned,status){", financeStart);
  assert.ok(financeStart >= 0 && financeEnd > financeStart, "finance form builder must exist");
  const finance = ui.slice(financeStart, financeEnd);
  assert.match(finance, /Array\.isArray\(detail\.productos_ajuste\)\?detail\.productos_ajuste:arr\(detail\.productos\)/,
    "reinvestment options use the live active catalogue, not the immutable opening inventory");
  assert.match(finance, /products\.map\(p=>'<option value=/,
    "all returned active products, including zero-stock products, remain selectable");
});
