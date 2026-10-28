"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const visibility = fs.readFileSync(
  path.join(ROOT, "public", "js", "hotfix-secciones-visibles-20260903.js"),
  "utf8"
);
const movements = fs.readFileSync(
  path.join(ROOT, "public", "js", "hotfix-16-5-movimientos-operaciones-flotantes-20260902.js"),
  "utf8"
);
const multiplePurchase = fs.readFileSync(
  path.join(ROOT, "public", "js", "compra-multiple.js"),
  "utf8"
);

test("Paso 4: Productos ya no ofrece un segundo formulario visible para registrar compras", () => {
  assert.match(index, /<section id="productos-compra-legacy" hidden aria-hidden="true">[\s\S]*?<form id="form-compra"/,
    "se conserva el formulario oculto para que el código de compatibilidad no falle");
  assert.match(index, /id="productos-compra-canonica"/);
  assert.match(index, /id="btn-productos-ir-compras-movimientos"/);
  assert.match(index, /Todas las compras se registran desde <strong>Movimientos → Nueva compra<\/strong>/);
});

test("Paso 4: el menú lateral no vuelve a mostrar la ruta duplicada Compras", () => {
  assert.match(visibility, /var KEEP_HIDDEN = \{[^}]*compras:true/);
  assert.match(visibility, /if \(KEEP_HIDDEN\[tab\]\) \{[\s\S]*?btn\.classList\.add\('hidden'\)[\s\S]*?setImportantStyle\(btn,'display','none'\)/,
    "el normalizador debe imponer hidden, no quitar la clase a la ruta consolidada");
  assert.match(multiplePurchase, /tab\.dataset\.tab = 'compras'/,
    "el test reconoce que el módulo heredado sigue generando la ruta y verifica que se oculta");
});

test("Paso 4: el acceso canónico desde Productos abre el formulario de compra dentro de Movimientos", () => {
  assert.match(movements, /function bindCanonicalPurchaseRoute\(\)/);
  assert.match(movements, /#btn-productos-ir-compras-movimientos/);
  assert.match(movements, /movButton\.click\(\)/);
  assert.match(movements, /window\.__BC165_open\('compras'\)/);
});
