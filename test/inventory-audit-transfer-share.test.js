"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync("supabase/migrations/20261121120000_transfer_whatsapp_inventory_count_audit.sql", "utf8");
const inventoryUi = fs.readFileSync("public/js/inventario-auditoria.js", "utf8");
const transferUi = fs.readFileSync("public/js/movimiento-multiple.js", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");
const sw = fs.readFileSync("public/service-worker.js", "utf8");
const index = fs.readFileSync("public/index.html", "utf8");
const mando = fs.readFileSync("public/js/mando.js", "utf8");

test("physical audit is limited server-side to storage warehouses", () => {
  assert.match(migration, /v_almacen\.tipo\s*<>\s*'almacenamiento'/i);
  assert.match(migration, /auditoria_inventario_activa_id/);
  assert.match(migration, /before insert or update or delete on public\.stock/i);
  assert.match(migration, /for share/i);
  assert.match(inventoryUi, /w\.tipo === 'almacenamiento'/);
  assert.match(migration, /v_auditoria\.creado_por <> auth\.uid\(\)/);
  assert.match(migration, /public\.tiene_permiso\('auditoria','crear'\)/);
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
  assert.equal(auditFunctions.length, 5, "the physical-audit API should expose five narrowly scoped RPC functions");
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
  assert.match(app, /\["inventario-auditoria\.js","1\.0"\]/);
  assert.match(sw, /inventario-auditoria\.js\?v=1\.0/);
});
