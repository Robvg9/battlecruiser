"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync("supabase/migrations/20261121124129_transfer_whatsapp_inventory_count_audit.sql", "utf8");
const inventoryUi = fs.readFileSync("public/js/inventario-auditoria.js", "utf8");
const transferUi = fs.readFileSync("public/js/movimiento-multiple.js", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");
const sw = fs.readFileSync("public/service-worker.js", "utf8");
const index = fs.readFileSync("public/index.html", "utf8");
const mando = fs.readFileSync("public/js/mando.js", "utf8");
const styles = fs.readFileSync("public/style.css", "utf8");

test("physical audit is limited server-side to storage warehouses", () => {
  assert.match(migration, /v_almacen\.tipo\s*<>\s*'almacenamiento'/i);
  assert.match(migration, /auditoria_inventario_activa_id/);
  assert.match(migration, /before insert or update or delete on public\.stock/i);
  assert.match(migration, /for share/i);
  assert.match(inventoryUi, /w\.tipo === 'almacenamiento'/);
  assert.match(migration, /v_auditoria\.creado_por <> auth\.uid\(\)/);
  assert.match(migration, /public\.tiene_permiso\('auditoria','crear'\)/);
  const saveCounts = migration.match(/create or replace function public\.inventario_auditoria_guardar_conteos\([\s\S]*?\$function\$;/i)?.[0] || "";
  assert.match(saveCounts, /auth\.uid\(\) is null or not \([\s\S]*?public\.bc_actor_is_admin\(\)[\s\S]*?public\.tiene_permiso\('auditoria','crear'\)[\s\S]*?public\.tiene_permiso\('auditoria','editar_any'\)/i);
  assert.match(saveCounts, /v_auditoria\.creado_por <> auth\.uid\(\)[\s\S]*?not public\.bc_actor_is_admin\(\)[\s\S]*?not public\.tiene_permiso\('auditoria','editar_any'\)/i);
  assert.match(migration, /inventario_auditoria_cancelar\(\s*p_auditoria_id uuid,\s*p_motivo text/s);
  assert.match(inventoryUi, /id="inv-audit-cancel"/);
  assert.match(inventoryUi, /rpc\('inventario_auditoria_cancelar'/);
});

test("physical audit snapshots zero stock and distinguishes not-counted from zero", () => {
  assert.match(migration, /left join public\.stock/i);
  assert.match(migration, /coalesce\(s\.cantidad,\s*0\)/i);
  assert.match(migration, /cantidad_fisica numeric check \(cantidad_fisica >= 0\)/i);
  assert.match(migration, /cantidad_fisica is null/i);
  assert.match(inventoryUi, /placeholder="Sin contar"/);
  assert.match(inventoryUi, /type="number" min="0"/);
});

test("physical audit never performs stock adjustments automatically", () => {
  const auditFunctions = migration.match(/create or replace function public\.inventario_auditoria_[\s\S]*?\$function\$;/gi) || [];
  assert.equal(auditFunctions.length, 6, "the physical-audit API should expose six narrowly scoped RPC functions");
  for (const fn of auditFunctions) {
    assert.doesNotMatch(fn, /update\s+public\.stock/i);
    assert.doesNotMatch(fn, /insert\s+into\s+public\.stock/i);
    assert.doesNotMatch(fn, /delete\s+from\s+public\.stock/i);
  }
  assert.match(migration, /Debes explicar cada diferencia/i);
  assert.match(inventoryUi, /no se aplicaron ajustes autom[aá]ticos/i);
  assert.match(inventoryUi, /no se modific[oó] el stock/i);
});

test("transfer receiver is persisted through a backward-compatible atomic RPC extension", () => {
  assert.match(migration, /add column if not exists recibido_por uuid references public\.usuarios/i);
  assert.match(migration, /registrar_transferencia\(\s*p_origen_id uuid,\s*p_destino_id uuid,\s*p_lineas jsonb,\s*p_idempotency_key uuid,\s*p_recibido_por uuid/s);
  assert.match(migration, /public\.registrar_transferencia\(\s*p_origen_id,\s*p_destino_id,\s*v_lineas,\s*p_idempotency_key\s*\)/s);
  assert.match(transferUi, /if \(receiver\) payload\.p_recibido_por = receiver/);
  assert.match(transferUi, /listar_receptores_transferencia/);
});

test("WhatsApp share uses the compact recipient template only after successful online persistence", () => {
  assert.match(transferUi, /📜 Entradas · /);
  assert.match(transferUi, /Fecha: \*/);
  assert.match(transferUi, /Recibe: \*@/);
  assert.match(transferUi, /data\.lineas\.map/);
  assert.match(transferUi, /lastShareText = lines\.join\('\\n'\)/);
  assert.match(transferUi, /function formatQtyForShare\(value\)/);
  assert.match(transferUi, /formatQtyForShare\(item\.cantidad\)/);
  assert.match(transferUi, /navigator\.share/);
  assert.match(transferUi, /web\.whatsapp\.com\/send\?text=/);
  assert.match(transferUi, /if \(!result\.offline && result\.data\)/);
  assert.match(transferUi, /const estaDesconectado = !navigator\.onLine/);
  assert.match(transferUi, /if \(receiver\) payload\.p_recibido_por = receiver/);
  assert.match(transferUi, /no tendr[aá] comprobante de WhatsApp/i);
  assert.match(transferUi, /obtener_transferencia_compartir/);
});

test("audit log hides idempotency keys and exposes a separate physical-count view", () => {
  assert.doesNotMatch(mando, /idemp \+ /);
  assert.match(index, /mando-auditoria-vista-fisica/);
  assert.match(index, /mando-auditoria-fisica/);
  assert.match(app, /\["inventario-auditoria\.js","1\.1"\]/);
  assert.match(sw, /inventario-auditoria\.js\?v=1\.1/);
});


test("audit history uses readable activity cards instead of raw operation codes", () => {
  assert.match(mando, /function presentarRegistroAuditoria\(fila\)/);
  assert.match(mando, /bc-audit-entry__category/);
  assert.match(mando, /bc-audit-entry__actor-label/);
  assert.match(mando, /bc-audit-entry__status/);
  assert.match(mando, /Actualizaciones de producto/);
  assert.match(mando, /Requiere revisión/);
  assert.match(mando, /Referencia #/);
  assert.match(mando, /Lote #/);
  assert.doesNotMatch(mando, /escHtml\(f\.tipo \|\| ""\)/);
  assert.match(styles, /\.bc-audit-entry__title/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*?\.bc-audit-entry__meta/);
});

test("physical count selector is high-contrast and missing LIVE RPC is explained", () => {
  assert.match(inventoryUi, /\.inv-audit-start select\{background:linear-gradient/);
  assert.match(inventoryUi, /color:#211605!important/);
  assert.match(inventoryUi, /select option,\.inv-audit-start select optgroup/);
  assert.match(inventoryUi, /El conteo físico aún no está habilitado en Supabase LIVE/);
  assert.match(inventoryUi, /PGRST202/);
});
