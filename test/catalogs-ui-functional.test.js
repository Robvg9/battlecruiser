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
const INDEX_SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"),
  "utf8"
);

function setup(t) {
  const dom = new JSDOM(
    "<!doctype html><html lang='es'><head></head><body>" +
    "<section>" +
      "<form id='form-categoria'><input id='cat-nombre'><button type='submit'>Agregar categoría</button></form>" +
      "<div id='lista-categorias'></div>" +
      "<div id='msg-config'></div>" +
      "<select id='prod-categoria' required><option value=''>Selecciona</option></select>" +
      "<div id='msg-config'></div>" +
    "</section></body></html>",
    { url: "https://battlecruiser-catalogs.test/", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  const tables = {
    categorias: [{ id: "cat-existing", nombre: "General", activo: true }],
    productos: []
  const inserts = [];
  const updates = [];
  let sequence = 0;
  let nextInsertError = null;
  let selectorRefreshes = 0;
  window.refrescarSelectorCategoriasProducto = async () => { selectorRefreshes += 1; };

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
        eq: async (column, value) => ({ data: (tables[table] || []).filter((row) => String(row[column]) === String(value)).map((row) => ({ ...row })), error: null }),
        order: async () => ({ data: (tables[table] || []).map((row) => ({ ...row })), error: null }),
        delete: () => ({ eq: async (column, value) => { tables[table] = (tables[table] || []).filter((row) => String(row[column]) !== String(value)); return { data: [], error: null }; } }),
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
  return { window, dom, tables, inserts, updates, getSelectorRefreshes: () => selectorRefreshes };
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
  assert.ok(c.getSelectorRefreshes() >= 1, "el selector de Productos se refresca al crear una categoría");
});

test("Paso 4: Administración no muestra catálogo de presentaciones y retail usa unidad base × 1", () => {
  const dom = new JSDOM(INDEX_SOURCE);
  try {
    const d = dom.window.document;
    assert.equal(d.getElementById("form-unidad"), null);
    assert.equal(d.getElementById("lista-unidades"), null);
    assert.equal(d.querySelectorAll(".presentaciones-panel").length, 0);
    for (const id of ["form-presentacion-nueva", "lista-presentaciones-catalogo", "pp-producto-select", "pp-lista-asociaciones", "form-pp-nueva"]) {
      assert.equal(d.querySelectorAll("#" + id).length, 0, id + " debe estar retirado");
    }
    const category = d.getElementById("prod-categoria");
    assert.ok(category && category.tagName === "SELECT" && category.required, "la categoría es un selector obligatorio");
    const base = d.getElementById("prod-unidad");
    assert.ok(base && base.getAttribute("list") === null, "la unidad base no depende de un catálogo de presentaciones");
    assert.doesNotMatch(SOURCE, /initCatalogoSimple\(\{\s*tabla:\s*["']unidades["']/);
  } finally { dom.window.close(); }
});

test("Paso 4 catálogos: nombre vacío no crea una categoría", async (t) => {
  const c = setup(t);
  c.window.document.getElementById("cat-nombre").value = "   ";
  submit(c.window, "form-categoria");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(c.inserts.filter((x) => x.table === "categorias").length, 0,
    "los campos vacíos no llegan al backend mock");
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


test("Paso 4 catálogos: editar categoría actualiza el mismo registro y conserva su identidad", async (t) => {
  const c = setup(t);
  await c.window._refrescarCatalogo_categorias();
  const edit = c.window.document.querySelector("#lista-categorias .catalogo-edit-btn");
  assert.ok(edit, "cada categoría debe ofrecer edición");
  edit.click();
  assert.equal(c.window.document.getElementById("cat-nombre").value, "General");
  assert.equal(c.window.document.querySelector("#form-categoria button[type=submit]").textContent, "Guardar cambios");
  c.window.document.getElementById("cat-nombre").value = "Bebidas";
  submit(c.window, "form-categoria");
  assert.ok(await waitFor(() => c.updates.some((x) => x.table === "categorias" && x.id === "cat-existing" && x.payload.nombre === "Bebidas")));
  assert.ok(await waitFor(() => c.window.document.getElementById("lista-categorias").textContent.includes("Bebidas")));
  assert.equal(c.tables.categorias.find((row) => row.id === "cat-existing").nombre, "Bebidas");
  assert.ok(c.window.document.getElementById("lista-categorias").textContent.includes("Bebidas"));
  assert.equal(c.window.document.querySelector("#form-categoria button[type=submit]").textContent, "Agregar categoría");
});


test("Paso 4 categorías: eliminar una categoría sin referencias y conservar las que tienen productos", async (t) => {
  const c = setup(t);
  c.tables.productos.push({ id: "product-linked", categoria_id: "cat-existing" });
  await c.window._refrescarCatalogo_categorias();
  const linkedDelete = c.window.document.querySelector("#lista-categorias .catalogo-delete-btn");
  assert.ok(linkedDelete, "las categorías deben mostrar la acción Eliminar");
  c.window.confirm = () => true;
  linkedDelete.click();
  assert.ok(await waitFor(() => /No se puede eliminar: hay productos asociados/.test(c.window.document.getElementById("msg-config").textContent)), "no debe borrar una categoría con productos asociados");
  assert.ok(c.tables.categorias.some((row) => row.id === "cat-existing"));
  c.tables.productos.length = 0;
  await c.window._refrescarCatalogo_categorias();
  const unlinkedDelete = c.window.document.querySelector("#lista-categorias .catalogo-delete-btn");
  assert.ok(unlinkedDelete);
  unlinkedDelete.click();
  assert.ok(await waitFor(() => !c.tables.categorias.some((row) => row.id === "cat-existing")), "debe borrar una categoría sin referencias");
  assert.ok(await waitFor(() => /Categoría eliminada\./.test(c.window.document.getElementById("msg-config").textContent)));
});