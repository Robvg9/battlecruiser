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
  assert.ok(products.includes("async function subirImagenProducto"));
  const catalogSave = read("public/js/hotfix-pulido-20260903b.js");
  assert.ok(catalogSave.includes("var imageFile=window.__BC_PRODUCT_IMAGE_FILE__||null"));
  assert.ok(catalogSave.includes("window.subirImagenProducto(savedProductId,imageFile)"));
  assert.ok(styles.includes("prod-imagen-preview{width:88px!important;height:88px!important"));
});

test("minorista usa siempre unidad base × 1 y solo mayorista ofrece etiqueta/factor opcionales", () => {
  const ui = read("public/js/hotfix-pulido-20260903.js");
  const saver = read("public/js/hotfix-pulido-20260903b.js");
  const salesLines = read("public/js/m27-6-ventas-presentaciones.js");
  const catalogRpcMigration = read("supabase/migrations/20261103090000_product_presentations_by_warehouse.sql");

  assert.ok(ui.includes("if(!isWholesale){var unit=(document.getElementById('prod-unidad')?.value||'').trim()||'unidad';return{name:unit,factor:1,id:null};"),
    "retail presentation is always derived from the product base unit with factor one");
  assert.ok(ui.includes('<strong class="bc-pres-row-title">Formato mayorista</strong>'));
  assert.ok(ui.includes('id="bc-pres-wholesale-name"'));
  assert.ok(ui.includes('id="bc-pres-wholesale-factor"'));
  assert.doesNotMatch(ui, /id="bc-pres-normal-name"|id="bc-pres-normal-factor"/);

  assert.ok(saver.includes("var normal={name:baseUnit,factor:1,id:null},wholesale=readWholesale();"));
  assert.ok(saver.includes("p_presentacion_normal:normal.name,p_factor_normal:normal.factor"));
  assert.ok(saver.includes("p_presentacion_mayorista:wholesale.name,p_factor_mayorista:wholesale.factor"));

  assert.ok(salesLines.includes("baseQuantity=packageQuantity*factor"));
  assert.ok(salesLines.includes("__bcQuantityIsBase:true"));
  assert.ok(salesLines.includes("line.presentacion_id=p.presentacion_id"));
  assert.ok(salesLines.includes("line.cantidad_presentacion=Number(line.cantidad||0)/factor"));
  assert.ok(salesLines.includes("function buildPLineasFromCart(lineas)"));
  assert.ok(salesLines.includes("input.value=String(qty)"));
  assert.ok(salesLines.includes("packages*factor"));
  assert.ok(salesLines.includes("event.stopImmediatePropagation()"));
  assert.ok(catalogRpcMigration.includes("(v_norm_name is null) <> (p_factor_normal is null)"));
  assert.ok(catalogRpcMigration.includes("(v_wh_name is null) <> (p_factor_mayorista is null)"));
});
test("warehouse channel is checked independently from the selected price type", () => {
  const sales = read("public/js/m27-5-ventas-precio-politica.js");
  const migration = read("supabase/migrations/20261103090000_product_presentations_by_warehouse.sql");

  assert.ok(sales.includes("if(isSellType(t)&&!channelAvailable(p,t))"));
  assert.ok(sales.includes("opts&&opts.__bcQuantityIsBase?Number(cantidad):Number(cantidad)*factor"));
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

test("product registration has one commercial-options owner and no legacy duplicate selector/save path", () => {
  const catalogos = read("public/js/catalogos.js");
  const productModal = read("public/js/m26-ui-integridad.js");
  const presentationUi = read("public/js/hotfix-pulido-20260903.js");
  const presentationSave = read("public/js/hotfix-pulido-20260903b.js");
  const legacyProductSave = read("public/js/hotfix-17-2-productos-save-20260903.js");

  assert.doesNotMatch(
    catalogos,
    /prod-presentaciones-config|prod-pres-min|prod-pres-may-habilitado|crearProductoConPresentaciones|instalarValidacionCreacionProducto/,
    "catalogos.js must not inject the old mandatory presentation form or intercept product creation"
  );
  assert.match(productModal, /bc-product-commercial-toggle/);
  assert.match(productModal, /bc-product-commercial-panel/);
  assert.match(productModal, /fieldBlock\(categoria, 'Categoría'/);
  assert.match(productModal, /fieldBlock\(mayorista, 'Precio mayorista \(opcional\)'/);
  assert.match(productModal, /window\.__BCM26_setCommercialOptionsExpanded/);

  assert.ok(presentationUi.includes("window.__BCM26_ensureCommercialOptions()"));
  assert.ok(presentationUi.includes("document.getElementById('bc-product-commercial-panel')"));
  assert.ok(presentationUi.includes("host.appendChild(box)"));
  assert.ok(presentationUi.includes("var legacy=document.getElementById('prod-presentaciones-config');if(legacy)legacy.remove();"));
  assert.doesNotMatch(presentationUi, /id="bc-pres-normal-name"|id="bc-pres-normal-factor"/,
    "retail label/factor inputs no longer exist");
  assert.equal((presentationUi.match(/id="bc-pres-wholesale-name"/g) || []).length, 1);
  assert.equal((presentationUi.match(/id="bc-pres-wholesale-factor"/g) || []).length, 1);

  assert.ok(presentationSave.includes("p_precio_mayorista:pm"));
  assert.ok(presentationSave.includes("p_presentacion_normal:normal.name"));
  assert.ok(presentationSave.includes("p_presentacion_mayorista:wholesale.name"));
  assert.ok(presentationUi.includes("No se guardó el producto ni se creó parcialmente."),
    "offline save must not silently discard configured presentation pairs");
  assert.ok(presentationUi.includes("if(!form||!modal||!modal.contains(form))return false;"),
    "the single product saver must bind to the native M26 modal, not a retired second overlay");
  assert.ok(!presentationUi.includes("if(!document.getElementById('bc171-overlay'))return false;"),
    "the retired M17 overlay must not disable the current product saver");
  assert.ok(presentationUi.includes("document.getElementById('prod-submit-btn')||document.getElementById('bc171-save')"),
    "the native save button must be disabled during a save attempt");
  assert.doesNotMatch(legacyProductSave, /addEventListener\(['"]submit['"]/,
    "the retired M17.2 module must not register a second product submit handler");
  assert.ok(legacyProductSave.includes("normal.required=true"));
  assert.ok(legacyProductSave.includes("normal.min='0.01'"));
  assert.ok(legacyProductSave.includes("wholesale.required=false"));
  assert.ok(legacyProductSave.includes("normalPriceRequired:"));
  assert.ok(legacyProductSave.includes("wholesalePriceOptional:"));
  assert.ok(legacyProductSave.includes("legacySubmitHandler:false"));
  assert.ok(presentationUi.includes("pn===null||!Number.isFinite(pn)||pn<0.01"),
    "the unified saver must enforce the same required retail price as the native form");
  assert.ok(presentationUi.includes("form.addEventListener('submit',saveCatalogoProduct,true)"),
    "the unified Pulido saver must be the only product-specific submit handler");
});
