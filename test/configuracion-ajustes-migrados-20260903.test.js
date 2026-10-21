"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("personal preferences belong to their own section, not Configuration or the removed header drawer", () => {
  const index = read("public/index.html");
  const app = read("public/app.js");
  const loader = read("public/js/configuracion.js");
  const src = read("public/js/configuracion-ajustes-migrados-20260903.js");

  assert.match(index, /id="tab-conectividad"/);
  assert.match(index, /id="tab-preferencias"/);
  assert.match(index, /id="tab-config"/);
  assert.doesNotMatch(index, /id="ajustes-btn"|id="ajustes-menu"|id="change-pass-btn"|id="update-app-btn"/);
  assert.doesNotMatch(app, /ui-ajustes-panel\.js/);
  assert.match(loader, /getElementById\("tab-conectividad"\)/);
  assert.match(loader, /configuracion-ajustes-migrados-20260903\.js\?v=4/);
  assert.match(src, /getElementById\("tab-preferencias"\)/);

  for (const token of [
    "Preferencias personales", "Modo oscuro", "Modo claro",
    "Actualización automática", "Sincronización automática",
    "Sincronizar al abrir app", "Sincronizar solo en Wi‑Fi",
    "Notificaciones", "Modo compacto", "Restaurar preferencias",
    "bc-ui-preferences-v2"
  ]) assert.ok(src.includes(token), `falta preferencia esperada: ${token}`);

  assert.doesNotMatch(src, /Ajustes básicos|Región \/ Conexión|Cambiar contraseña|Administrador de datos|Cerrar sesión|Actualizar app \/ borrar caché/);
  assert.doesNotMatch(src, /update-app-btn|change-pass-btn|logout-btn/);
});

test("maintenance actions are wired only to Conectividad and not moved into Preferences", () => {
  const loader = read("public/js/configuracion.js");
  const index = read("public/index.html");
  assert.match(loader, /getElementById\("tab-conectividad"\)/);
  assert.match(loader, /cfg-actualizar-app/);
  assert.match(loader, /cfg-refrescar-diag/);
  assert.match(index, /id="mi-cuenta-btn"/);
  assert.match(index, /id="logout-btn"/);
});
