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

function setup(t) {
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
      id: "turno-cerrado", dias_turno: 1, almacen_id: "alm-1", almacen_nombre: "Principal",
      estado_maestro: "CERRADO", fecha_inicio: "2026-10-01", fecha_fin: "2026-10-02",
      sesiones_asignadas: 1, sesiones_total: 1
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
  window.BattleCruiserTurnoAPI = {
    actorIsAdmin: async () => true,
    labelEstado: (value) => ({
      EN_CURSO: "En curso",
      ACTIVO: "En curso",
      PROGRAMADO: "Programado",
      PLANIFICADO: "Programado",
      PENDIENTE_APROBACION: "Pendiente de aprobación",
      EN_VALIDACION: "Pendiente de aprobación"
    })[value] || String(value || "-"),
    listarTurnosMaestros: async () => turns.map((turno) => ({ ...turno }))
  };
  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, turns };
}

test("Paso 4: la vista visible M29 permite filtrar turnos por estado y almacén", async (t) => {
  assert.match(SOURCE, /var VERSION = '29\.12';/);
  assert.match(APP_SOURCE, /\["m29-turnos-organizacion\.js","29\.12"\]/);
  const { window } = setup(t);
  await window.__BC_M29__.renderHome();
  const root = window.document.getElementById("ciclos-m18-root");

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
  assert.ok(!Array.from(root.querySelectorAll(".m29-card")).some((card) => card.getAttribute("data-turno-id") === "turno-cerrado"),
    "la vista operativa conserva la regla de excluir turnos cerrados del resumen");

  const opened = [];
  window.__BC_M33 = { open: (id) => opened.push(id) };
  const visibleCard = root.querySelector('.m29-card[data-turno-id="turno-principal"]');
  visibleCard.click();
  assert.deepEqual(opened, ["turno-principal"], "las tarjetas siguen abriendo el detalle después de re-renderizar filtros");
});
