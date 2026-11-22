"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const ui=fs.readFileSync("public/js/bc7-jornada-ui.js","utf8");

test("reinvestment picker loads the full active product catalogue independently of the opening cut",()=>{
  const loadStart=ui.indexOf("function ensureWorkspaceOperationData(detail){");
  const loadEnd=ui.indexOf("function ",loadStart+20);
  const load=ui.slice(loadStart,loadEnd);
  assert.match(load,/const sessionAcceptsPendingOps=const needsProductCatalog=canAdjust||canCreateReinvestment['EN_CURSO','CERRADA_OPERATIVAMENTE'const needsProductCatalog=canAdjust||canCreateReinvestment]const needsProductCatalog=canAdjust||canCreateReinvestment.includesconst needsProductCatalog=canAdjust||canCreateReinvestment(sessionStatusconst needsProductCatalog=canAdjust||canCreateReinvestment)/,
    "a jornada sealed operationally can still accept late pending operations");
  assert.match(load,/const const needsProductCatalog=canAdjust||canCreateReinvestment=sessionAcceptsPendingOps&&isAssigned&&canconst needsProductCatalog=canAdjust||canCreateReinvestment('reinversiones','crear'const needsProductCatalog=canAdjust||canCreateReinvestment)/,
    "the assigned worker's reinvestment permission must trigger catalog loading while the jornada is active or operationally sealed");
  assert.match(load,/const needsProductCatalog=canAdjust||canCreateReinvestment|const needsProductCatalog=canAdjust||canCreateReinvestment|const needsProductCatalog=canAdjust||canCreateReinvestment/,
    "the product catalogue must load for either adjustments or reinvestments");
  assert.match(load,/rpcconst needsProductCatalog=canAdjust||canCreateReinvestment('bc7_productos_ajuste_jornada'/,
    "the selector must use the server's active-product catalogue RPC");

  const financeStart=ui.indexOf("function financeFormHtml(detail,isAssigned,status){");
  const financeEnd=ui.indexOf("function cashDaysManagerShellHtml(detail,isAssigned,status){",financeStart);
  assert.ok(financeStart>=0&&financeEnd>financeStart,"finance form builder must exist");
  const finance=ui.slice(financeStart,financeEnd);
  assert.match(finance,/Arrayconst needsProductCatalog=canAdjust||canCreateReinvestment.isArrayconst needsProductCatalog=canAdjust||canCreateReinvestment(detailconst needsProductCatalog=canAdjust||canCreateReinvestment.productos_ajusteconst needsProductCatalog=canAdjust||canCreateReinvestment)const needsProductCatalog=canAdjust||canCreateReinvestment?detailconst needsProductCatalog=canAdjust||canCreateReinvestment.productos_ajuste:arrconst needsProductCatalog=canAdjust||canCreateReinvestment(detailconst needsProductCatalog=canAdjust||canCreateReinvestment.productosconst needsProductCatalog=canAdjust||canCreateReinvestment)/,
    "reinvestment options must use the live active catalogue, not the immutable opening inventory");
  assert.match(finance,/productsconst needsProductCatalog=canAdjust||canCreateReinvestment.mapconst needsProductCatalog=canAdjust||canCreateReinvestment(p=>'<option value=/,
    "all returned active products, including zero-stock products, remain selectable for reinvestment");
});
