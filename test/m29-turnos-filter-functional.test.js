"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "m29-turnos-organizacion.js"),
  "utf8"
);
const APP_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "app.js"),
  "utf8"
);
const LEGACY_HISTORY_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "bc7-legacy-history.js"),
  "utf8"
);


async function waitFor(predicate, timeout = 1000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function setup(t) {
  let listCalls = 0;
  const turns = [
    {
      id: "turno-principal", dias_turno: 7, almacen_id: "alm-1", almacen_nombre: "Principal",
      estado_maestro: "EN_CURSO", fecha_inicio: "2026-10-23", fecha_fin: "2026-10-30",
      sesiones_asignadas: 1, sesiones_total: 1
    },
    {
      id: "turno-reserva-programado", dias_turno: 5, almacen_id: "alm-2", almacen_nombre: "Reserva",
      estado_maestro: "PROGRAMADO", fecha_inicio: "2026-10-25", fecha_fin: "2026-10-30",
      sesiones_asignadas: 2, sesiones_total: 5
    },
    {
      id: "turno-reserva-validacion", dias_turno: 3, almacen_id: "alm-2", almacen_nombre: "Reserva",
      estado_maestro: "EN_VALIDACION", fecha_inicio: "2026-10-20", fecha_fin: "2026-10-23",
      sesiones_asignadas: 1, sesiones_total: 3
    },
    {
      id: "turno-closed-history", dias_turno: 1, almacen_id: "alm-1", almacen_nombre: "Principal",
      estado_maestro: "CERRADO", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-02",
      sesiones_asignadas: 1, sesiones_total: 1
    },
    {
      id: "turno-validated-history", dias_turno: 2, almacen_id: "alm-2", almacen_nombre: "Reserva",
      estado_maestro: "VALIDADO", fecha_inicio: "2026-09-20", fecha_fin: "2026-09-21",
      sesiones_asignadas: 2, sesiones_total: 2
    }
  ];

  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<div id='tabs'><button class='tab-btn' data-tab='turnos'>Turnos</button>" +
      "<button class='tab-btn' data-tab='ciclos'>Ciclos Operativos</button></div>" +
      "<section id='tab-turnos' class='tab-panel'></section>" +
      "<section id='tab-ciclos' class='tab-panel'><div id='ciclos-m18-root'></div></section>" +
    "</body></html>",
    { url: "https://battlecruiser-m29.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", { value: "complete", configurable: true });
  window._cache = {
    almacenes: [
      { id: "alm-1", nombre: "Principal", activo: true },
      { id: "alm-2", nombre: "Reserva", activo: true },
      { id: "alm-inactive", nombre: "Inactivo", activo: false }
    ]
  };
  window.__bcUser = { rol: "dueño" };
  window.tienePermiso = () => true;
  const masterListCalls = [];
  const legacyListCalls = [];
  window.BattleCruiserTurnoAPI = {
    actorIsAdmin: async () => true,
    // The archive must not query this legacy-session listing endpoint.
    listarTurnos: async (options = {}) => { legacyListCalls.push({ ...options }); return []; },
    labelEstado: (value) => ({
      EN_CURSO: "En curso",
      ACTIVO: "En curso",
      PROGRAMADO: "Programado",
      PLANIFICADO: "Programado",
      PENDIENTE_APROBACION: "Pendiente de aprobación",
      EN_VALIDACION: "Pendiente de aprobación",
      CERRADO: "Cerrado",
      VALIDADO: "Validado"
    })[value] || String(value || "-"),
    listarTurnosMaestros: async (options = {}) => {
      listCalls += 1;
      masterListCalls.push({ ...options });
      const offset = Number(options.offset || 0);
      const limit = Number(options.limit || 100);
      return turns.slice(offset, offset + limit).map((turno) => ({ ...turno }));
    }
  };
  window.__m29ClosedListCalls = legacyListCalls;
  window.__m29MasterListCalls = masterListCalls;
  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, turns, getListCalls: () => listCalls, getMasterListCalls: () => listCalls };
}

test("Paso 4: el historial M29 consulta turnos maestros cerrados y los abre en solo lectura", async (t) => {
  const { window, getMasterListCalls } = setup(t);
  const opened = [];
  const openedOptions = [];
  window.__BC_M33 = {
    open: (id, options) => {
      opened.push(id);
      openedOptions.push(options || null);
    }
  };
  await window.__BC_M29__.renderHome();
  const root = window.document.getElementById("ciclos-m18-root");
  const historyButton = root.querySelector("#m29-btn-historial");
  assert.ok(historyButton, "Turnos debe ofrecer acceso al historial cerrado");
  const callsBeforeHistory = getMasterListCalls();
  historyButton.click();
  assert.ok(await waitFor(() => root.querySelector('[data-m29-closed-open="turno-closed-history"]')),
    "el historial debe cargar el turno cerrado por lectura");
  assert.match(root.textContent, /Historial de turnos/);
  assert.match(root.textContent, /Principal/);
  assert.ok(root.querySelector('[data-m29-closed-open="turno-validated-history"]'),
    "el historial también debe incluir turnos maestros validados");
  assert.ok(getMasterListCalls() > callsBeforeHistory, "el archivo debe releer la RPC de turnos maestros");
  const archiveCalls = window.__m29MasterListCalls.slice(callsBeforeHistory);
  assert.ok(archiveCalls.some((call) => call.limit === 100 && call.offset === 0),
    "el archivo debe paginar la lista de turnos maestros");
  assert.equal(window.__m29ClosedListCalls.length, 0,
    "el historial no debe consultar listar_turnos, que mezcla expedientes legacy");
  root.querySelector('[data-m29-closed-open="turno-closed-history"]').click();
  assert.deepEqual(opened, ["turno-closed-history"], "abrir el expediente reutiliza el turno maestro existente");
  assert.equal(openedOptions.length, 1, "el historial debe abrir exactamente una vez");
  assert.equal(openedOptions[0]?.readOnly, true, "el historial debe abrir en modo solo lectura");
  assert.deepEqual(Object.keys(openedOptions[0] || {}).sort(), ["readOnly"], "el historial no debe pasar opciones editables adicionales");
});

test("Paso 4: el archivo M29 se inicializa dentro de Jornada y solo expone expedientes cerrados", async (t) => {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
      "<div id='tabs'><button class='tab-btn' data-tab='resumen'>Resumen</button>" +
      "<button class='tab-btn' data-tab='jornada'>Jornada e inventario</button>" +
      "<button class='tab-btn' data-tab='ciclos'>Ciclos Operativos</button></div>" +
      "<section id='tab-resumen' class='tab-panel'></section>" +
      "<section id='tab-jornada' class='tab-panel visible'><div class='bc7-wrap'><section id='bc7-workspace'></section><section id='bc7-calendar-section'></section></div></section>" +
      "<section id='tab-ciclos' class='tab-panel'><div id='ciclos-m18-root'></div></section>" +
    "</body></html>",
    { url: "https://battlecruiser-jornada-archive.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", { value: "complete", configurable: true });
  window._cache = { almacenes: [{ id: "alm-1", nombre: "Principal", activo: true }] };
  window.__bcUser = { rol: "dueño" };
  window.tienePermiso = () => true;
  const turns = [
    { id:"active",almacen_id:"alm-1",almacen_nombre:"Principal",estado_maestro:"EN_CURSO",fecha_inicio:"2026-11-09" },
    { id:"scheduled",almacen_id:"alm-1",almacen_nombre:"Principal",estado_maestro:"PROGRAMADO",fecha_inicio:"2026-11-12" },
    { id:"pending",almacen_id:"alm-1",almacen_nombre:"Principal",estado_maestro:"PENDIENTE_APROBACION",fecha_inicio:"2026-11-08" },
    { id:"closed",almacen_id:"alm-1",almacen_nombre:"Principal",estado_maestro:"CERRADO",fecha_inicio:"2026-11-01",fecha_fin:"2026-11-02" },
    { id:"validated",almacen_id:"alm-1",almacen_nombre:"Principal",estado_maestro:"VALIDADO",fecha_inicio:"2026-10-20",fecha_fin:"2026-10-21" }
  ];
  window.BattleCruiserTurnoAPI = {
    actorIsAdmin: async () => true,
    listarTurnosMaestros: async () => turns.map(row => ({...row})),
    labelEstado: value => String(value || "")
  };
  const opened = [];
  window.__BC_M33 = { open:(id,options)=>opened.push({id,options}) };
  window.eval(SOURCE);
  assert.ok(window.__BC_M29__, "the M29 module must expose its API before the archive wrapper loads");
  window.eval(LEGACY_HISTORY_SOURCE);

  const root=window.document.getElementById("ciclos-m18-root");
  const details=window.document.getElementById("bc7-legacy-history");
  assert.ok(details && details.contains(root), "the existing M29 root must be moved under the canonical Jornada archive");
  assert.equal(details.hidden,false,"the archive wrapper must remain available in the canonical Jornada route");
  assert.equal(root.dataset.bc7ArchiveInitialized,"1","the legacy history is actively initialized");
  assert.equal(window.__BC7_LEGACY_ARCHIVE_ONLY__,true);
  const loaded=await waitFor(() =>
    root.querySelector('[data-m29-closed-open="closed"]') &&
    root.querySelector('[data-m29-closed-open="validated"]')
  );
  assert.ok(loaded,"mounting the legacy helper must actively initialize M29's archive");
  assert.equal(root.querySelectorAll(".m29-card").length,0,"active/programmed journeys must not appear beside BC7");
  assert.equal(root.querySelectorAll("[data-m29-closed-open]").length,2,"only closed and validated records are shown");
  assert.equal(root.querySelector("#m29-btn-crear"),null,"the historical archive has no parallel creator");
  root.querySelector('[data-m29-closed-open="closed"]').click();
  assert.deepEqual(opened,[{id:"closed",options:{readOnly:true}}],"historical expedientes open read-only");
  details.open=true;
  assert.equal(details.open,true,"the owner can expand the historical archive");
  assert.match(root.querySelector("#m29-btn-history-back").textContent,/Cerrar historial/);
  root.querySelector("#m29-btn-history-back").click();
  assert.equal(details.open,false,"Cerrar historial collapses the archive instead of opening a second operational list");
  t.after(()=>window.close());
});

test("Paso 4: el archivo M29 filtra expedientes y no permite crear turnos paralelos", async (t) => {
  assert.match(SOURCE, /var VERSION = '29\.22';/);
  assert.match(SOURCE, /LEGACY_CREATION_ENABLED = false/);
  assert.match(APP_SOURCE, /\["m29-turnos-organizacion\.js","29\.22"\]/);
  const { window, getListCalls } = setup(t);
  await window.__BC_M29__.renderHome();
  const root = window.document.getElementById("ciclos-m18-root");

  assert.equal(root.querySelector("#m29-btn-crear"), null, "M29 debe conservar consulta e historial, no crear jornadas nuevas");
  assert.ok(root.querySelector("#m29-btn-refrescar"), "el archivo heredado debe tener un botón de refresco");
  assert.ok(root.querySelector("#m29-filtro-estado"), "el filtro de estado debe estar en la vista visible Turnos");
  assert.ok(root.querySelector("#m29-filtro-almacen"), "el filtro de almacén debe estar en la vista visible Turnos");
  assert.equal(root.querySelectorAll(".m29-card").length, 3, "se muestran los turnos activos, programados o pendientes de aprobación");

  const estado = root.querySelector("#m29-filtro-estado");
  estado.value = "EN_CURSO";
  estado.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(root.querySelectorAll(".m29-card").length, 1);
  assert.equal(root.querySelector(".m29-card").getAttribute("data-turno-id"), "turno-principal");

  const almacen = root.querySelector("#m29-filtro-almacen");
  almacen.value = "alm-2";
  almacen.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(root.querySelectorAll(".m29-card").length, 0);
  assert.match(root.querySelector("#m29-list").textContent, /No hay turnos que coincidan con los filtros/);

  estado.value = "";
  estado.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(root.querySelectorAll(".m29-card").length, 2);
  assert.ok(Array.from(root.querySelectorAll(".m29-card")).every((card) => card.textContent.includes("Reserva")));

  almacen.value = "";
  almacen.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(root.querySelectorAll(".m29-card").length, 3, "limpiar ambos selectores restaura todas las tarjetas visibles");
  assert.ok(!Array.from(root.querySelectorAll(".m29-card")).some((card) => card.getAttribute("data-turno-id") === "turno-closed-history"),
    "la vista operativa conserva la regla de excluir turnos cerrados del resumen");

  almacen.value = "alm-2";
  almacen.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(root.querySelectorAll(".m29-card").length, 2);
  const callsBeforeRefresh = getListCalls();
  root.querySelector("#m29-btn-refrescar").click();
  assert.ok(await waitFor(() => getListCalls() > callsBeforeRefresh && root.querySelectorAll(".m29-card").length === 2),
    "Refrescar vuelve a consultar los datos y mantiene el filtro seleccionado");
  assert.equal(root.querySelector("#m29-filtro-almacen").value, "alm-2");
  assert.ok(Array.from(root.querySelectorAll(".m29-card")).every((card) => card.textContent.includes("Reserva")));

  const opened = [];
  window.__BC_M33 = { open: (id) => opened.push(id) };
  const visibleCard = root.querySelector('.m29-card[data-turno-id="turno-reserva-programado"]');
  visibleCard.click();
  assert.deepEqual(opened, ["turno-reserva-programado"], "las tarjetas siguen abriendo el detalle después de refrescar y filtrar");
});
