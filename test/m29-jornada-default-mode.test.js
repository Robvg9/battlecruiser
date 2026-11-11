"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const M29 = read("public/js/m29-turnos-organizacion.js");
const TURNOS_MASTER = read("public/js/turnos-maestro.js");
const BC7 = read("public/js/bc7-jornada-ui.js");
const PERMISSIONS = read("public/js/permisos-navegacion.js");
const NAVIGATION = read("public/js/navegacion.js");
const LEGACY_HISTORY = read("public/js/bc7-legacy-history.js");

test("M29/M33 remains a read-only history surface and cannot create parallel turns", () => {
  assert.match(M29, /var VERSION = '29\.22';/);
  assert.match(M29, /LEGACY_CREATION_ENABLED = false/);
  assert.match(M29, /var btnHtml = ''/);
  assert.match(M29, /if \(!state\.isAdmin \|\| !LEGACY_CREATION_ENABLED\) return false/);
  assert.match(M29, /Historial y expedientes heredados/);
  assert.match(M29, /m29-btn-historial/);
  assert.match(M29, /m29-filtro-estado/);
  assert.match(M29, /m29-filtro-almacen/);
  assert.match(M29, /readOnly:\s*true/);
  assert.doesNotMatch(M29, /id="m29-btn-crear"/);
});

test("BC7 is the only creator and enforces the two-day complete-Jornada model", () => {
  assert.match(BC7, /id="bc7-admin-details"/);
  assert.match(BC7, /Crear y organizar jornadas/);
  assert.match(BC7, /id="bc7-days-count" type="number" min="2" max="31"/);
  assert.match(BC7, /function scheduleDayCount\(\)/);
  assert.match(BC7, /Math\.max\(2,Math\.min\(31,Number\.isFinite\(raw\)\?raw:7\)\)/);
  assert.match(BC7, /async function previewPattern/);
  assert.match(BC7, /async function createSchedule/);
  assert.match(BC7, /rpc\('bc5_previsualizar_jornada'/);
  assert.match(BC7, /rpc\('bc5_crear_jornada_unica'/);
  assert.match(BC7, /Elegir responsables día por día/);
  assert.match(BC7, /07:00/);
  assert.match(BC7, /23:00/);
  assert.match(BC7, /America\/Havana/);
});

test("Jornada is the only navigation destination and contains the nested legacy archive", () => {
  assert.match(PERMISSIONS, /turnos:\s*true[\s\S]*ciclos:\s*true/);
  assert.match(NAVIGATION, /tab === "turnos" \|\| tab === "ciclos"[\s\S]*tab = "jornada"/);
  assert.match(LEGACY_HISTORY, /Historial y expedientes anteriores/);
  assert.match(LEGACY_HISTORY, /const ROOT_ID = 'ciclos-m18-root'/);
  assert.match(LEGACY_HISTORY, /host\.appendChild\(legacyRoot\)/);
});

test("the older fallback form remains disabled and cannot create split MANANA/TARDE sessions", () => {
  const start = TURNOS_MASTER.indexOf("async function confirmCreate(");
  const end = TURNOS_MASTER.indexOf("// DETALLE TURNO", start);
  assert.ok(start >= 0 && end > start, "the legacy fallback handler must still be inspectable");
  const handler = TURNOS_MASTER.slice(start, end);
  assert.match(handler, /creación desde el formulario antiguo está deshabilitada/i);
  assert.doesNotMatch(handler, /crearTurno\s*\(/);
});
