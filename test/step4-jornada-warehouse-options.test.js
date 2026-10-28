"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "bc7-jornada-ui.js"),
  "utf8"
);

function esperarHasta(predicate, timeoutMs = 3000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - start >= timeoutMs) return resolve(false);
      setTimeout(tick, 15);
    };
    tick();
  });
}

function createContext(t, { failCatalog = false } = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<nav><button class="tab-btn" data-tab="turnos" type="button">Turnos</button></nav>' +
      '<section id="tab-turnos" class="tab-panel"></section>' +
      "</body></html>",
    { url: "https://battlecruiser-jornada-warehouse.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  Object.defineProperty(window.document, "readyState", { configurable: true, value: "complete" });
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  window.eval("const _cache = { almacenes: [], usuarios: [] };");
  assert.equal(window._cache, undefined, "el fixture debe reproducir la caché léxica real de core.js");
  window._usuarioActual = { id: "owner-fixture", rol: "Dueño" };
  window.tienePermiso = () => true;
  window.confirm = () => false;

  const calls = [];
  window.client = {
    rpc: async (name) => {
      calls.push(name);
      if (name === "listar_almacenes_para_turnos") {
        if (failCatalog) return { data: null, error: { message: "catalog unavailable in fixture" } };
        return {
          data: [
            { id: "warehouse-active-fixture", nombre: "Almacén fixture disponible", tipo: "almacenamiento", activo: true },
            { id: "warehouse-inactive-fixture", nombre: "Almacén fixture inactivo", tipo: "minorista", activo: false }
          ],
          error: null
        };
      }
      if (name === "bc_actor_is_admin") return { data: true, error: null };
      if (name === "bc5_mis_jornadas") return { data: [], error: null };
      return { data: [], error: null };
    }
  };

  window.eval(SOURCE);
  t.after(() => window.close());
  return { window, calls };
}

test("Paso 4: Jornada carga almacenes autorizados aunque la caché inicial esté vacía", async (t) => {
  const c = createContext(t);
  const ready = await esperarHasta(() => {
    const select = c.window.document.getElementById("bc7-warehouse");
    return select && Array.from(select.options).some((option) => option.value === "warehouse-active-fixture");
  });
  assert.equal(ready, true, "la carga del catálogo debe añadir el almacén activo al selector");
  const select = c.window.document.getElementById("bc7-warehouse");
  assert.equal(select.disabled, false, "el selector se habilita cuando existen almacenes");
  assert.equal(select.querySelector('option[value="warehouse-active-fixture"]').textContent, "Almacén fixture disponible");
  assert.equal(select.querySelector('option[value="warehouse-inactive-fixture"]'), null,
    "los almacenes inactivos no deben ofrecerse como opción");
  assert.ok(c.calls.includes("listar_almacenes_para_turnos"),
    "la UI debe consultar el RPC de catálogo seguro si la caché empieza vacía");
});

test("Paso 4: fallo al cargar almacenes se comunica y ofrece reintento", async (t) => {
  const c = createContext(t, { failCatalog: true });
  const ready = await esperarHasta(() => {
    const msg = c.window.document.getElementById("bc7-warehouse-msg");
    const retry = c.window.document.getElementById("bc7-warehouse-retry");
    return msg && retry && retry.hidden === false && /No se pudieron cargar los almacenes/i.test(msg.textContent);
  });
  assert.equal(ready, true, "el error de catálogo debe ser visible y recuperable");
  assert.equal(c.window.document.getElementById("bc7-warehouse").disabled, true,
    "no se debe permitir continuar con un catálogo no cargado");
});
