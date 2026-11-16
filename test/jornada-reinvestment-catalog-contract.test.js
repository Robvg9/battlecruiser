"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const ui=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");

test("reinvestment picker loads the full active product catalogue independently of the opening cut",()=>{
  const loadStart=ui.indexOf("function ensureWorkspaceOperationData(detail){");
  const loadEnd=ui.indexOf("function ",loadStart+20);
  const load=ui.slice(loadStart,loadEnd);
  assert.match(load,/const canCreateReinvestment=sessionIsOpen&&isAssigned&&can\('reinversiones','crear'\)/,
    "the assigned worker's reinvestment permission must trigger catalog loading");
  assert.match(load,/const needsProductCatalog=canAdjust\|\|canCreateReinvestment/,
    "the product catalogue must load for either adjustments or reinvestments");
  assert.match(load,/rpc\('bc7_productos_ajuste_jornada'/,
    "the selector must use the server's active-product catalogue RPC");

  const financeStart=ui.indexOf("function financeFormHtml(detail,isAssigned,status){");
  const financeEnd=ui.indexOf("function cashDaysManagerShellHtml(detail,isAssigned,status){",financeStart);
  assert.ok(financeStart>=0&&financeEnd>financeStart,"finance form builder must exist");
  const finance=ui.slice(financeStart,financeEnd);
  assert.match(finance,/Array\.isArray\(detail\.productos_ajuste\)\?detail\.productos_ajuste:arr\(detail\.productos\)/,
    "reinvestment options must use the live active catalogue, not the immutable opening inventory");
  assert.match(finance,/products\.map\(p=>'<option value=/,
    "all returned active products, including zero-stock products, remain selectable for reinvestment");
});
