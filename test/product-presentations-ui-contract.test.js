"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

test("product image picker crops, scales, previews and uploads a prepared square", () => {
  const html = read("public/index.html");
  const products = read("public/js/productos.js");
  const styles = read("public/js/m75-productos-ui-compacto.js");

  assert.ok(html.includes('id="prod-imagen-elegir"'));
  assert.ok(html.includes('aria-label="Seleccionar imagen del producto"'));
  assert.ok(html.includes('<svg viewBox="0 0 24 24"'));
  assert.ok(html.includes('id="prod-imagen-preview"'));
  assert.ok(products.includes("const PROD_IMAGEN_LADO_MAX = 512;"));
  assert.ok(products.includes("Math.min(cropSide, PROD_IMAGEN_LADO_MAX)"));
  assert.ok(products.includes("context.drawImage(image, left, top, cropSide, cropSide, 0, 0, outputSide, outputSide)"));
  assert.ok(products.includes('}, "image/jpeg", 0.84);'));
  assert.ok(products.includes("_productoImagenProcesada || (archivoImagenInput.files"));
  const catalogSave = read("public/js/hotfix-pulido-20260903b.js");
  assert.ok(catalogSave.includes("var imageFile=window.__BC_PRODUCT_IMAGE_FILE__||null"));
  assert.ok(catalogSave.includes("window.subirImagenProducto(savedProductId,imageFile)"));
  assert.ok(styles.includes("prod-imagen-preview{width:88px!important;height:88px!important"));
});

test("minorista and mayorista are independent optional label/factor pairs", () => {
  const ui = read("public/js/hotfix-pulido-20260903.js");
  const saver = read("public/js/hotfix-pulido-20260903b.js");
  const salesLines = read("public/js/m27-6-ventas-presentaciones.js");
  const catalogRpcMigration = read("supabase/migrations/20261103090000_product_presentations_by_warehouse.sql");

  for (const id of [
    "bc-pres-normal-name", "bc-pres-normal-factor",
    "bc-pres-wholesale-name", "bc-pres-wholesale-factor"
  ]) assert.ok(ui.includes(id), "missing compact field " + id);

  assert.ok(ui.includes("function selectedPres(which)"));
  assert.ok(ui.includes("return{name:name||null,factor:raw===''?null:Number(raw),id:null};"));
  assert.ok(ui.includes("normal=rows.find(function(r){return !wholesaleId||String(r.presentacion_id)!==wholesaleId;})"));
  assert.ok(ui.includes("wholesale=wholesaleId?rows.find(function(r){return String(r.presentacion_id)===wholesaleId;})"));
  assert.ok(saver.includes("return (!hasName&&!hasFactor)||(hasName&&hasFactor)"));
  assert.ok(saver.includes("Las etiquetas minorista y mayorista deben ser distintas"));
  assert.ok(salesLines.includes("baseQuantity=packageQuantity*factor"));
  assert.ok(salesLines.includes("line.presentacion_id=p.presentacion_id"));
  assert.ok(salesLines.includes("line.cantidad_presentacion=Number(line.cantidad||0)/factor"));
  assert.ok(salesLines.includes("function buildPLineasFromCart(lineas)"));
  assert.ok(catalogRpcMigration.includes("(v_norm_name is null) <> (p_factor_normal is null)"));
  assert.ok(catalogRpcMigration.includes("(v_wh_name is null) <> (p_factor_mayorista is null)"));
});

test("warehouse channel is checked independently from the selected price type", () => {
  const sales = read("public/js/m27-5-ventas-precio-politica.js");
  const migration = read("supabase/migrations/20261103090000_product_presentations_by_warehouse.sql");

  assert.ok(sales.includes("if(isSellType(t)&&!channelAvailable(p,t))"));
  assert.ok(sales.includes("from('producto_presentaciones')"));
  assert.ok(sales.includes("window.__BC_M275_getProductPresentation"));
  const saleLines = read("public/js/m27-6-ventas-presentaciones.js");
  assert.ok(saleLines.includes("function getCartLines()"));
  assert.ok(saleLines.includes("line.presentacion_id=p.presentacion_id"));
  assert.ok(saleLines.includes("buildPLineasFromCart(lines)"));
  assert.ok(migration.includes("v_presentacion_producto is null or v_presentacion_id is distinct from v_presentacion_producto"));
  assert.ok(migration.includes("v_presentacion_producto is not null and v_presentacion_id=v_presentacion_producto"));
  assert.ok(migration.includes("v_tipo_almacen='mayorista'"));
  assert.ok(migration.includes("v_tipo_precio_linea:=coalesce"));
  assert.ok(!migration.includes("La presentación mayorista indicada no coincide con la presentación definida del producto"));
});
