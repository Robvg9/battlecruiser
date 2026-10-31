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

async function waitFor(predicate, timeout = 1200) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      "<nav id='tabs'><button class='tab-btn' data-tab='ciclos'>Turnos</button></nav>" +
      "<section id='tab-ciclos' class='tab-panel visible'><div id='ciclos-m18-root'></div></section>" +
    "</body></html>",
    { url: "https://battlecruiser-m29-jornada.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", { value: "complete", configurable: true });
  window.setInterval = () => 0;
  window.confirm = () => true;
  window.__bcUser = { rol: "Dueño" };
  window.tienePermiso = () => true;
  window._cache = {
    almacenes: [{ id: "alm-1", nombre: "La Cueva", activo: true }],
    usuarios: [
      { id: "dep-1", nombre: "Dependienta 1", rol: "Dependienta", activo: true },
      { id: "dep-2", nombre: "Dependienta 2", rol: "Dependienta", activo: true }
    ]
  };
  const createdLegacy = [];
  const jornadaCalls = [];
  const staffCalls = [];
  window.BattleCruiserTurnoAPI = {
    actorIsAdmin: async () => true,
    crearTurno: async (payload) => { createdLegacy.push(payload); return { id: "legacy-turn" }; },
    listarTurnosMaestros: async () => [],
    labelEstado: (value) => String(value || "—")
  };
  window.client = {
    rpc: async (name, payload) => {
      if (name === "listar_usuarios_admin") {
        staffCalls.push({ name, payload });
        return { data: [
          { id: "dep-1", nombre: "Dependienta 1", rol: "Dependienta", activo: true, archivado: false },
          { id: "dep-2", nombre: "Dependienta 2", rol: "Dependienta", activo: true, archivado: false }
        ], error: null };
      }
      jornadaCalls.push({ name, payload });
      return { data: { turno_id: "jornada-turn", estado: "PROGRAMADO" }, error: null };
    }
  };
  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, createdLegacy, jornadaCalls, staffCalls };
}

test("M29 creates complete-day JORNADA by default with one named responsible per working day", async (t) => {
  const { window, createdLegacy, jornadaCalls } = setup(t);
  await window.__BC_M29__.renderHome();
  const root = window.document.getElementById("ciclos-m18-root");
  assert.ok(await waitFor(() => root && root.querySelector("#m29-btn-crear")), "M29 boot completes and renders the owner create action");
  root.querySelector("#m29-btn-crear").click();

  const modal = window.document.getElementById("m29-crear-overlay");
  assert.ok(modal, "Crear Turno opens the modal");
  assert.ok(await waitFor(() => modal.querySelectorAll("[data-m29-day]").length === 7),
    "the default day grid appears after the canonical staff catalog is loaded");
  const days = modal.querySelector("#m29-create-days");
  assert.equal(days.dataset.mode, "jornada", "Jornada completa is the default model");
  assert.match(modal.querySelector("#m29-mode-label").textContent, /Jornada completa/);
  assert.equal(modal.querySelectorAll("[data-m29-day]").length, 7);

  const count = modal.querySelector("#m29-dias");
  count.value = "2";
  count.dispatchEvent(new window.Event("change", { bubbles: true }));
  const rows = modal.querySelectorAll("[data-m29-day]");
  assert.equal(rows.length, 2);
  rows[0].querySelector("[data-m29-person]").value = "dep-1";
  rows[1].querySelector("[data-m29-works]").click();
  assert.equal(rows[1].querySelector("[data-m29-person]").disabled, true);

  modal.querySelector("#m29-confirm-crear").click();
  assert.ok(await waitFor(() => jornadaCalls.length === 1), "the canonical Jornada RPC is called");
  assert.equal(jornadaCalls[0].name, "bc5_crear_jornada_unica");
  assert.equal(jornadaCalls[0].payload.p_almacen_id, "alm-1");
  assert.equal(jornadaCalls[0].payload.p_dias, 2);
  const expectedProgramacion = [
    { numero_dia: 1, trabaja: true, responsable_id: "dep-1" },
    { numero_dia: 2, trabaja: false, responsable_id: null }
  ];
  const actualProgramacion = JSON.parse(JSON.stringify(jornadaCalls[0].payload.p_programacion));
  assert.deepEqual(
    actualProgramacion,
    expectedProgramacion,
    "Jornada programming must contain the expected day/responsible assignments"
  );
  assert.equal(createdLegacy.length, 0, "the default model never creates MANANA/TARDE sessions");
});

test("M29 Plan B explicitly creates independent MANANA/TARDE assignments through the legacy contract", async (t) => {
  const { window, createdLegacy, jornadaCalls } = setup(t);
  await window.__BC_M29__.renderHome();
  const root = window.document.getElementById("ciclos-m18-root");
  assert.ok(await waitFor(() => root && root.querySelector("#m29-btn-crear")), "M29 boot completes and renders the owner create action");
  root.querySelector("#m29-btn-crear").click();

  const modal = window.document.getElementById("m29-crear-overlay");
  assert.ok(await waitFor(() => modal.querySelectorAll("[data-m29-day]").length === 7),
    "the default day grid appears after the canonical staff catalog is loaded");
  modal.querySelector("#m29-toggle-plan-b").click();
  const days = modal.querySelector("#m29-create-days");
  assert.equal(days.dataset.mode, "legacy");
  assert.match(modal.querySelector("#m29-mode-label").textContent, /sesiones independientes por bloque/);

  const count = modal.querySelector("#m29-dias");
  count.value = "2";
  count.dispatchEvent(new window.Event("change", { bubbles: true }));
  const rows = modal.querySelectorAll("[data-m29-day]");
  rows[0].querySelector("[data-m29-manana]").value = "dep-1";
  rows[0].querySelector("[data-m29-tarde]").value = "dep-2";
  rows[1].querySelector("[data-m29-tarde]").value = "dep-1";

  modal.querySelector("#m29-confirm-crear").click();
  assert.ok(await waitFor(() => createdLegacy.length === 1), "the legacy creation API is called");
  const expectedLegacyPayload = {
    almacenId: "alm-1",
    inicioPlan: createdLegacy[0].inicioPlan,
    cantidadDias: 2,
    asignaciones: [
      { numero_dia: 1, bloque: "MANANA", usuario_id: "dep-1" },
      { numero_dia: 1, bloque: "TARDE", usuario_id: "dep-2" },
      { numero_dia: 2, bloque: "TARDE", usuario_id: "dep-1" }
    ]
  };
  const actualLegacyPayload = JSON.parse(JSON.stringify(createdLegacy[0]));
  assert.deepEqual(
    actualLegacyPayload,
    expectedLegacyPayload,
    "Plan B must preserve the legacy payload contract"
  );
  assert.match(createdLegacy[0].inicioPlan, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(jornadaCalls.length, 0, "Plan B never creates JORNADA rows in parallel");
});


test("M29 loads active eligible responsables when the shared cache is empty", async (t) => {
  const { window } = setup(t);
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  window._cache.usuarios = [];
  const users = [
    { id: "dep-3", nombre: "Dependienta 3", rol: "Dependienta", activo: true },
    { id: "owner-2", nombre: "Dueño 2", rol: "Dueño", activo: true },
    { id: "inactive", nombre: "Inactiva", rol: "Dependienta", activo: false },
    { id: "other", nombre: "Almacén", rol: "Almacenero", activo: true }
  ];
  const staffRpcCalls = [];
  window.client.rpc = async (name) => {
    staffRpcCalls.push(name);
    if (name === "listar_usuarios_admin") return { data: users, error: null };
    throw new Error("RPC inesperada: " + name);
  };
  await window.__BC_M29__.renderHome();
  const root = window.document.getElementById("ciclos-m18-root");
  assert.ok(await waitFor(() => root && root.querySelector("#m29-btn-crear")));
  root.querySelector("#m29-btn-crear").click();
  const modal = window.document.getElementById("m29-crear-overlay");
  assert.ok(modal);
  const catalogLoaded = await waitFor(() => {
    const selects = Array.from(modal.querySelectorAll("[data-m29-person]"));
    return selects.length === 7 && selects.every((select) => select.options.length === 3);
  }, 5000);
  assert.ok(catalogLoaded,
    "each of the seven day selectors must contain the three expected options; status=" +
    (modal.querySelector("#m29-staff-status")?.textContent || "missing") +
    "; rpc=" + staffRpcCalls.join(",") + "; online=" + window.navigator.onLine);
  const expectedOptions = ["", "dep-3", "owner-2"];
  const allSelections = Array.from(modal.querySelectorAll("[data-m29-person]"));
  for (const select of allSelections) {
    assert.deepEqual(Array.from(select.options).map((option) => option.value), expectedOptions);
  }
  assert.match(modal.querySelector("#m29-staff-status").textContent, /2 responsables activos disponibles/);
  const checkbox = modal.querySelector("[data-m29-works]");
  assert.equal(checkbox.type, "checkbox");
  assert.match(SOURCE, /width:16px!important;height:16px!important/);
  assert.match(SOURCE, /grid-template-columns:minmax\(100px,.7fr\) auto minmax\(190px,1.3fr\)/);
});


test("M29 refreshes the canonical responsible catalog even when stale cached roles look eligible", async (t) => {
  const { window } = setup(t);
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  window._cache.usuarios = [
    { id: "dep-cache", nombre: "Dependienta en caché", activo: true },
    { id: "owner-cache", nombre: "Dueño en caché", activo: true },
    { id: "archived-cache", nombre: "Dependienta archivada en caché", rol: "Dependienta", activo: true }
  ];
  const authoritative = [
    { id: "dep-cache", nombre: "Dependienta recuperada", rol: "Dependienta", activo: true, archivado: false },
    { id: "owner-cache", nombre: "Dueño recuperado", rol: "Dueño", activo: true, archivado: false },
    { id: "inactive", nombre: "Inactiva", rol: "Dependienta", activo: false, archivado: false },
    { id: "warehouse", nombre: "Almacenero", rol: "Almacenero", activo: true, archivado: false }
  ];
  const calls = [];
  window.client.rpc = async (name, payload) => {
    calls.push({ name, payload });
    if (name === "listar_usuarios_admin") return { data: authoritative, error: null };
    if (name === "bc5_crear_jornada_unica") return { data: { turno_id: "turno-test" }, error: null };
    throw new Error("RPC inesperada: " + name);
  };
  await window.__BC_M29__.renderHome();
  const root = window.document.getElementById("ciclos-m18-root");
  assert.ok(await waitFor(() => root && root.querySelector("#m29-btn-crear")));
  root.querySelector("#m29-btn-crear").click();
  const modal = window.document.getElementById("m29-crear-overlay");
  assert.ok(modal);
  const ready = await waitFor(() => {
    const select = modal.querySelector("[data-m29-person]");
    return select && select.options.length === 3;
  }, 4000);
  assert.ok(ready, "the selector must be hydrated from the role-authoritative RPC even if the shared cache has no role fields");
  const select = modal.querySelector("[data-m29-person]");
  assert.deepEqual(Array.from(select.options).map((option) => option.value), ["", "dep-cache", "owner-cache"]);
  assert.equal(select.options[1].textContent, "Dependienta recuperada");
  assert.ok(!Array.from(select.options).some((option) => option.value === "archived-cache"),
    "a stale locally cached user missing from the canonical unarchived server catalog must not be resurrected");
  assert.equal(window.__BC_M29_STAFF_CACHE_LOADED__, true);
  assert.equal(calls[0].name, "listar_usuarios_admin");
  assert.equal(calls[0].payload.p_incluir_archivados, false);
  assert.deepEqual(Object.keys(calls[0].payload), ["p_incluir_archivados"]);
  assert.equal(calls.filter((call) => call.name === "listar_usuarios_admin").length, 1,
    "opening the create modal must refresh the canonical catalog exactly once");
  assert.match(modal.querySelector("#m29-create-summary").textContent, /responsables asignados|pendientes/);
  const compactCss = window.document.getElementById("bc-m29-compact-modal-css");
  assert.ok(compactCss, "the create modal must load the compact layout overrides");
  assert.match(compactCss.textContent, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
