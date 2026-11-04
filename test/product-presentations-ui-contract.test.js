"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relative) {
  return fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
}

test("product image picker is icon-only and the prepared upload is square and capped", () => {
  const html = read("public/index.html");
  const products = read("public/js/productos.js");
  const styles = read("public/js/m75-productos-ui-compacto.js");

  assert.match(html, /id="prod-imagen-elegir"[^>]*aria-label="Seleccionar imagen del producto"/);
  assert.match(html, /<svg viewBox="0 0 24 24"/);
  assert.match(html, /id="prod-imagen-preview" class="prod-imagen-preview"/);
  assert.match(products, /const PROD_IMAGEN_LADO_MAX = 512/);
  assert.match(products, /Math.min(cropSide, PROD_IMAGEN_LADO_MAX)/);
  assert.match(products, /context.drawImage(image, left, top, cropSide, cropSide, 0, 0, outputSide, outputSide)/);
  assert.match(products, /canvas.toBlob([sS]*?"image/jpeg", 0.84)/);
  assert.match(products, /_productoImagenProcesada || (archivoImagenInput.files/);
  assert.match(styles, /prod-imagen-preview{width:88px!important;height:88px!important;max-width:88px!important;aspect-ratio:1\/1/);
});

test("minorista and mayorista are independent compact optional label/factor pairs", () => {
  const ui = read("public/js/hotfix-pulido-20260903.js");
  const saver = read("public/js/hotfix-pulido-20260903b.js");
  const catalogRpcMigration = read("supabase/migrations/20261103090000_product_presentations_by_warehouse.sql");

  for (const id of [
    "bc-pres-normal-name", "bc-pres-normal-factor",
    "bc-pres-wholesale-name", "bc-pres-wholesale-factor"
  ]) assert.ok(ui.includes(id), "missing compact field " + id);

  assert.match(ui, /function selectedPres(which)/);
  assert.match(ui, /return{s*name:name||null,s*factor:raw===''\?null:Number(raw),s*id:nulls*}/);
  assert.match(ui, /normal=rows.find(function(r){return !wholesaleId||String(r.presentacion_id)!==wholesaleId;})/);
  assert.match(ui, /wholesale=wholesaleId?rows.find(function(r){return String(r.presentacion_id)===wholesaleId;})/);
  assert.match(saver, /return (!hasName&&!hasFactor)||(hasName&&hasFactor)/);
  assert.match(saver, /Las etiquetas minorista y mayorista deben ser distintas/);
  assert.match(catalogRpcMigration, /\(v_norm_name is null\) <> \(p_factor_normal is null\)/);
  assert.match(catalogRpcMigration, /\(v_wh_name is null\) <> \(p_factor_mayorista is null\)/);
});

test("warehouse channel is checked independently from the selected price type", () => {
  const sales = read("public/js/m27-5-ventas-precio-politica.js");
  const migration = read("supabase/migrations/20261103090000_product_presentations_by_warehouse.sql");

  assert.match(sales, /if\(!channelAvailable\(p,t\)\)/);
  assert.match(sales, /producto_presentaciones/);
  assert.match(migration, /v_presentacion_producto is null or v_presentacion_id is distinct from v_presentacion_producto/);
  assert.match(migration, /v_presentacion_producto is not null and v_presentacion_id=v_presentacion_producto/);
  assert.match(migration, /v_tipo_almacen='mayorista'/);
  assert.match(migration, /v_tipo_precio_linea:=coalesce/);
});
