"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Transfer WhatsApp report uses the exact stored delivery data and requested field order", () => {
  const source = read("public/js/transferencias.js");
  const sandbox = {
    safeInit: () => {},
    window: {
      numberFmt: (value) => String(value),
      addEventListener: () => {},
    },
    document: {},
    navigator: {},
    console,
    Intl,
    Date,
    Number,
    String,
    Array,
    JSON,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, sandbox, { filename: "transferencias.js" });
  const build = sandbox.window.__BC_FORMAT_TRANSFER_SHARE__;
  assert.equal(typeof build, "function", "share formatter is exposed for the detail view");

  const message = build({
    almacen: "Cafetería La Cueva",
    fecha: "2026-11-20T12:34:00.000Z",
    responsable: "Dahiana",
    productos: [
      { nombre: "Cerveza Bucanero", cantidad: 24, unidad: "unidades" },
      { nombre: "Agua", cantidad: 6, unidad: "botellas" },
    ],
  });

  const fields = [
    "ALMACÉN: Cafetería La Cueva",
    "FECHA: ",
    "FECHA Y HORA DE LA ENTREGA: ",
    "RESPONSABLE QUE RECIBIÓ: Dahiana",
    "PRODUCTOS ENTREGADOS:",
    "1. Cerveza Bucanero — 24 unidades",
    "2. Agua — 6 botellas",
  ];
  let lastIndex = -1;
  for (const field of fields) {
    const index = message.indexOf(field);
    assert.ok(index > lastIndex, "expected ordered WhatsApp field: " + field);
    lastIndex = index;
  }
  assert.equal((message.match(/Cerveza Bucanero/g) || []).length, 1);
  assert.match(message, /07:34/, "transfer time must be formatted in the Havana business timezone");
  assert.doesNotMatch(message, /undefined|null|transferencia_id|producto_id/i);
});

test("Share formatter rejects a report without a receiving person or product lines", () => {
  const source = read("public/js/transferencias.js");
  const sandbox = {
    safeInit: () => {},
    window: { numberFmt: (value) => String(value), addEventListener: () => {} },
    document: {},
    navigator: {},
    console,
    Intl,
    Date,
    Number,
    String,
    Array,
    JSON,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, sandbox, { filename: "transferencias.js" });
  const build = sandbox.window.__BC_FORMAT_TRANSFER_SHARE__;
  assert.throws(() => build({
    almacen: "Cafetería La Cueva",
    fecha: "2026-11-20T12:34:00Z",
    responsable: "",
    productos: [{ nombre: "Agua", cantidad: 2, unidad: "botellas" }],
  }), /incompleto/i);
  assert.throws(() => build({
    almacen: "Cafetería La Cueva",
    fecha: "2026-11-20T12:34:00Z",
    responsable: "Dahiana",
    productos: [],
  }), /incompleto/i);
});

test("Retail destinations require a receiver-aware RPC and preserve it in the offline queue", () => {
  const transfer = read("public/js/transferencias.js");
  const offline = read("public/js/offline.js");
  const migration = read("supabase/migrations/20261121100000_auditoria_inventario_almacenamiento_y_transfer_share.sql");
  assert.match(transfer, /almacen\.tipo === "minorista"/);
  assert.match(transfer, /p_responsable_receptor_id = responsableReceptorId/);
  assert.match(transfer, /ejecutarOperacion\([\s\S]{0,180}"transferencia_receptor"/);
  assert.match(offline, /transferencia_receptor:\s*"registrar_transferencia_con_receptor"/);
  assert.match(offline, /case "transferencia_receptor"/);
  assert.match(migration, /responsable_receptor_id uuid REFERENCES public\.usuarios\(id\)/);
  assert.match(migration, /responsable_receptor_nombre text/);
  assert.match(migration, /responsable_receptor_nombre = coalesce\(responsable_receptor_nombre,v_nombre_receptor\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.registrar_transferencia_con_receptor/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.registrar_transferencia\(/);
  assert.match(migration, /coalesce\(v_destino_minorista,false\) AND NOT v_receiver_gate/);
  assert.match(migration, /set_config\('app\.bc_transfer_receiver_write','on',true\)/);
  assert.match(migration, /p_responsable_receptor_id/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.bc_mensaje_transferencia/);
});

test("Physical count creation and database write guard exclude retail stores", () => {
  const moduleSource = read("public/js/auditoria-inventario.js");
  const migration = read("supabase/migrations/20261121100000_auditoria_inventario_almacenamiento_y_transfer_share.sql");
  assert.match(moduleSource, /bc_listar_almacenes_auditoria_inventario/);
  assert.match(migration, /WHERE a\.tipo = 'almacenamiento'/);
  assert.match(migration, /IF v_tipo <> 'almacenamiento'/);
  assert.match(migration, /No se puede mover stock: el almacén tiene un conteo físico abierto/);
  assert.match(migration, /CREATE TRIGGER bc_stock_inventory_audit_guard/);
  assert.match(migration, /FOR UPDATE OF ai/);
  assert.match(migration, /vence_en > now\(\)/);
  assert.match(migration, /interval '4 hours'/);
  assert.match(migration, /bc_registrar_baja_auditoria_inventario/);
  assert.match(moduleSource, /El stock no fue modificado/);
});

test("Physical audit module is mounted separately from Jornada and excludes minorista inventory in its selector", () => {
  const index = read("public/index.html");
  const app = read("public/app.js");
  const worker = read("public/service-worker.js");
  assert.match(index, /id="mando-auditoria-inventario"/);
  assert.match(index, /Conteo físico de inventario/);
  assert.match(index, /id="trf-responsable-receptor"/);
  assert.match(app, /\["auditoria-inventario\.js","1\.0"\]/);
  assert.match(worker, /auditoria-inventario\.js\?v=1\.0/);
  assert.match(worker, /BC_SW_VERSION = "9\.5\.138"/);
});


test("Multi-product retail transfers also require and persist the receiving person", () => {
  const multi = read("public/js/movimiento-multiple.js");
  assert.match(multi, /mov-transfer-receiver-wrap/);
  assert.match(multi, /bc_listar_responsables_transferencia/);
  assert.match(multi, /selectors\.receiver\.value/);
  assert.match(multi, /transferPayload\.p_responsable_receptor_id = receiverId/);
  assert.match(multi, /'transferencia_receptor'/);
  assert.match(multi, /movimiento-multiple\.js/);
});
