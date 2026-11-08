"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Baja approval migration auto-approves only creators with global approval authority", () => {
  const sql = read("supabase/migrations/20261107223000_baja_owner_autoapproval_and_admin_queue.sql");
  assert.match(sql, /tiene_permiso\('bajas','editar_any'\)/);
  assert.match(sql, /tiene_permiso\('auditoria','editar_any'\)/);
  assert.match(sql, /_aplicar_salida_aprobada\(p_almacen_id, p_producto_id, p_cantidad\)/);
  assert.match(sql, /VALUES\([\s\S]*'PENDIENTE', p_idempotency_key\s*\)/);
  assert.match(sql, /UPDATE public\.bajas[\s\S]*SET estado = 'APROBADA'/);
  assert.match(sql, /revisado_por = auth\.uid\(\)/);
  assert.match(sql, /fecha_revision = now\(\)/);
  assert.match(sql, /p_idempotency_key/);
  assert.ok(sql.indexOf('INSERT INTO public.bajas(') < sql.indexOf('PERFORM public._aplicar_salida_aprobada('));
  assert.ok(sql.indexOf('PERFORM public._aplicar_salida_aprobada(') < sql.indexOf("SET estado = 'APROBADA'"));
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS bajas_creador_idempotency_key_uidx/);
  assert.match(sql, /ON CONFLICT \(creado_por, idempotency_key\)/);
  assert.match(sql, /WHERE idempotency_key IS NOT NULL/);
});

test("admin approval RPC returns pending Bajas only to users authorized to approve them", () => {
  const sql = read("supabase/migrations/20261107223000_baja_owner_autoapproval_and_admin_queue.sql");
  assert.match(sql, /SELECT 'baja'::text,b\.id/);
  assert.match(sql, /FROM public\.bajas b/);
  assert.match(sql, /WHERE b\.estado='PENDIENTE'/);
  assert.match(sql, /public\.tiene_permiso\('bajas','editar_any'\)/);
});

test("approval UI renders Bajas and updates the control-center badge from the same queue", () => {
  const ui = read("public/js/aprobaciones-admin.js");
  const center = read("public/js/centro-control.js");
  assert.match(ui, /listar_aprobaciones_admin/);
  assert.match(ui, /p_tipo:x\.tipo/);
  assert.match(ui, /Baja pendiente/);
  assert.match(ui, /Registrar y aprobar Baja/);
  assert.match(ui, /Baja autoaprobada\. El stock y FIFO ya fueron actualizados/);
  assert.match(ui, /Las bajas se aprueban automáticamente/);
  assert.match(ui, /bcActualizarBadgeAprobacionesAdmin/);
  assert.match(center, /_bcAprobacionesAdminPendientes/);
  assert.match(center, /criticosNoVistos \+ _bcAprobacionesAdminPendientes/);
});

test("inventory detail has a direct route into the flavor and per-warehouse minimum wizard", () => {
  const detail = read("public/js/inventario-detalle.js");
  const products = read("public/js/productos.js");
  const css = read("public/style.css");
  assert.match(detail, /data-bc-configure-flavors/);
  assert.match(detail, /bcAbrirConfiguracionSabores/);
  assert.match(products, /window\.bcAbrirConfiguracionSabores = async function/);
  assert.match(products, /cargarSnapshotAsignacionMixtaProducto\(producto\.id\)/);
  assert.match(products, /mínimo de cada sabor en cada almacén/);
  assert.match(products, /no se inventará ninguna cantidad/i);
  assert.match(css, /\.bc-inv-flavors-setup/);
  assert.match(css, /white-space: normal/);
});

test("PWA release and cache manifest are aligned at 9.5.81", () => {
  const app = read("public/app.js");
  const index = read("public/index.html");
  const sw = read("public/service-worker.js");
  assert.match(app, /VERSION="9\.5\.81"/);
  assert.match(index, /app\.js\?v=9\.5\.81/);
  assert.match(index, /style\.css\?v=9\.5\.81/);
  assert.match(sw, /BC_SW_VERSION = "9\.5\.81"/);
  assert.match(sw, /inventario-detalle\.js\?v=71/);
  assert.match(sw, /aprobaciones-admin\.js\?v=20261107\.3/);
  assert.match(sw, /productos\.js\?v=20261108\.1/);
});
