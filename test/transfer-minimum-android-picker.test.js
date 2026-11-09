"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=file=>fs.readFileSync(path.join(root,file),"utf8");
test("transfer can create destination stock first and defer its minimum",()=>{
 const sql=read("supabase/migrations/20261109150000_transfer_destination_minimum_optional.sql");
 assert.match(sql,/current_setting\('app\.bc_transfer_destination_write',true\) = 'on'/);
 assert.match(sql,/set_config\('app\.bc_transfer_destination_write','on',true\)/);
 assert.match(sql,/set_config\('app\.bc_transfer_destination_write','off',true\)/);
 assert.match(sql,/VALUES\(v_producto_id,p_destino_id,v_cantidad_final,0,now\(\)\)/);
 assert.match(sql,/private\.reclamar_idempotencia/);
 assert.doesNotMatch(sql,/DISABLE TRIGGER|DROP TRIGGER|session_replication_role/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.registrar_transferencia/);
});

test("transfer minimum fix keeps idempotency and permissions",()=>{
 const sql=read("supabase/migrations/20261109150000_transfer_destination_minimum_optional.sql");
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.registrar_transferencia/);
 assert.match(sql,/private\.reclamar_idempotencia/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.registrar_transferencia/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.registrar_transferencia/);
});
test("flavor allocation stays in one readable column in compact editor mode",()=>{
 const css=read("public/style.css");
 assert.match(css,/#form-producto\.bc-mixed-config-mode #prod-variantes-asignacion\{display:grid!important;grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(css,/bc-mixed-assignment-warehouse\{width:100%;min-width:0/);
});
test("Android picker tracks VisualViewport and Bajas focuses the visible dialog",()=>{
 const picker=read("public/js/product-select-search.js"),bajas=read("public/js/bajas-multiple.js"),css=read("public/style.css");
 assert.match(picker,/visualViewport\.addEventListener\('resize', syncViewport/);
 assert.match(picker,/visualViewport\.addEventListener\('scroll', syncViewport/);
 assert.match(css,/z-index:100800/);
 assert.match(css,/max-height:min\(calc\(var\(--bc-picker-viewport-height,100dvh\) - 28px\),720px\)/);
 assert.match(bajas,/dialog\.focus\(\{ preventScroll: true \}\)/);
});
