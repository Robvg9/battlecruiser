"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "catalogos.js"),
  "utf8"
);

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
    "<section>" +
      "<form id='form-categoria'><input id='cat-nombre'><button type='submit'>Agregar categoría</button></form>" +
      "<div id='lista-categorias'></div>" +
      "<form id='form-unidad'><input id='uni-nombre'><button type='submit'>Agregar unidad</button></form>" +
      "<div id='lista-unidades'></div>" +
      "<div id='msg-config'></div>" +
    "</section></body></html>",
    { url: "https://battlecruiser-catalogs.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  const tables = {
    categorias: [{ id: "cat-existing", nombre: "General", activo: true }],
    unidades: [{ id: "uni-existing", nombre: "unidad", activo: true }]
  };
  const inserts = [];
  const updates = [];
  let sequence = 0;
  let nextInsertError = null;

  window.safeInit = (_name, fn) => fn();
  window.setLoading = (id, message) => {
    const el = window.document.getElementById(id);
    if (el) el.textContent = message;
  };
  window.setEmpty = (id, message) => {
    const el = window.document.getElementById(id);
    if (el) el.textContent = message;
  };
  window.mensajeListaVacia = (_table, fallback) => fallback;
  window.escHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  window.explicarError = (error, action) => error?.message || ("error al " + action);
  window.setMsg = (id, message, ok) => {
    const el = window.document.getElementById(id);
    if (el) {
      el.textContent = message;
      el.dataset.ok = String(Boolean(ok));
    }
  };
  window.withCache = async (_table, loader) => {
    const result = await loader();
    return result?.data || result || [];
  };

  window.client = {
    from(table) {
      return {
        select() { return this; },
        order: async () => ({ data: (tables[table] || []).map((row) => ({ ...row })), error: null }),
        insert: async (payload) => {
          inserts.push({ table, payload: { ...payload } });
          if (nextInsertError) {
            const error = nextInsertError;
            nextInsertError = null;
            return { data: null, error };
          }
          sequence += 1;
          const row = { id: table.slice(0, 3) + "-created-" + sequence, ...payload, activo: true };
          (tables[table] ||= []).push(row);
          return { data: row, error: null };
        },
        update: (payload) => ({
          eq: async (_column, id) => {
            updates.push({ table, payload: { ...payload }, id });
            const row = (tables[table] || []).find((r) => String(r.id) === String(id));
            if (row) Object.assign(row, payload);
            return { data: row || null, error: null };
          }
        })
      };
    }
  };

  window.__setNextInsertError = (error) => { nextInsertError = error; };
  window.__catalogFixtureTables = tables;
  window.__catalogFixtureInserts = inserts;
  window.__catalogFixtureUpdates = updates;

  window.eval(SOURCE);
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
  t.after(() => window.close());
  return { window, dom, tables, inserts, updates };
}

async function waitFor(predicate, timeout = 1200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(predicate());
}

function submit(window, formId) {
  const form = window.document.getElementById(formId);
  assert.ok(form, "debe existir " + formId);
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

test("Paso 4 catálogos: categoría válida inserta una fila fixture, confirma y limpia formulario", async (t) => {
  const c = setup(t);
  c.window.document.getElementById("cat-nombre").value = "Bebidas fixture";
  submit(c.window, "form-categoria");
  assert.ok(await waitFor(() => c.inserts.some((x) => x.table === "categorias" && x.payload.nombre === "Bebidas fixture")),
    "categoría válida debe llamar el insert mock");
  assert.ok(await waitFor(() => /Categoría creada\./i.test(c.window.document.getElementById("msg-config").textContent)),
    "debe mostrar confirmación de creación");
  assert.equal(c.window.document.getElementById("cat-nombre").value, "");
  assert.ok(c.window.document.getElementById("lista-categorias").textContent.includes("Bebidas fixture"),
    "lista debe refrescar y mostrar el registro fixture creado");
});

test("Paso 4 catálogos: unidad válida inserta una fila fixture y confirma el resultado", async (t) => {
  const c = setup(t);
  c.window.document.getElementById("uni-nombre").value = "paquete fixture";
  submit(c.window, "form-unidad");
  assert.ok(await waitFor(() => c.inserts.some((x) => x.table === "unidades" && x.payload.nombre === "paquete fixture")),
    "unidad válida debe llamar el insert mock");
  assert.ok(await waitFor(() => /Unidad creada\./i.test(c.window.document.getElementById("msg-config").textContent)),
    "debe mostrar confirmación de creación");
  assert.equal(c.window.document.getElementById("uni-nombre").value, "");
  assert.ok(c.window.document.getElementById("lista-unidades").textContent.includes("paquete fixture"));
});

test("Paso 4 catálogos: nombre vacío no crea categoría ni unidad", async (t) => {
  const c = setup(t);
  c.window.document.getElementById("cat-nombre").value = "   ";
  c.window.document.getElementById("uni-nombre").value = "";
  submit(c.window, "form-categoria");
  submit(c.window, "form-unidad");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(c.inserts.filter((x) => x.table === "categorias" || x.table === "unidades").length, 0,
    "campos vacíos no llegan al backend mock");
});

test("Paso 4 catálogos: error de duplicado se muestra sin limpiar ni ocultar el motivo", async (t) => {
  const c = setup(t);
  c.window.__setNextInsertError({ code: "23505", message: "duplicate key" });
  c.window.document.getElementById("cat-nombre").value = "General";
  submit(c.window, "form-categoria");
  assert.ok(await waitFor(() => /Ya existe un valor con ese nombre/i.test(c.window.document.getElementById("msg-config").textContent)),
    "el error de duplicado debe traducirse a un mensaje usable");
  assert.equal(c.window.document.getElementById("cat-nombre").value, "General",
    "el valor se conserva para corregirlo");
});

test("Paso 4 catálogos: activar/desactivar un elemento actualizado llama update con el id correcto", async (t) => {
  const c = setup(t);
  assert.equal(typeof c.window._refrescarCatalogo_categorias, "function",
    "el módulo debe exponer el refresco de categorías que invoca la pantalla de Configuración");
  await c.window._refrescarCatalogo_categorias();
  assert.ok(await waitFor(() => c.window.document.querySelector("#lista-categorias .catalogo-toggle-btn")),
    "debe renderizar botón de estado");
  const button = c.window.document.querySelector("#lista-categorias .catalogo-toggle-btn");
  assert.equal(button.dataset.id, "cat-existing");
  button.click();
  assert.ok(await waitFor(() => c.updates.some((x) => x.table === "categorias" && x.id === "cat-existing")),
    "el cambio de estado llama el update mock para el ID correcto");
  const updated = c.tables.categorias.find((row) => row.id === "cat-existing");
  assert.equal(updated.activo, false);
});
