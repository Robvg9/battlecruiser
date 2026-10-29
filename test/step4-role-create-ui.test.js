"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SOURCE = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "usuarios-permisos-rest.js"),
  "utf8"
);

function setup() {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<form id='form-nuevo-rol'><input id='rol-nombre' type='text' required>" +
      "<button type='submit'>Crear rol</button></form>" +
      "<p id='msg-roles'></p><div id='lista-roles'></div>" +
    "</body></html>",
    { url: "https://battlecruiser-role-step4.test/", runScripts: "outside-only" }
  );
  const { window } = dom;
  const calls = [];
  window.client = {
    rpc: async (name, params = {}) => {
      calls.push({ name, params });
      if (name === "crear_rol") return { data: "role-fixture", error: null };
      if (name === "listar_roles_admin") return { data: [], error: null };
      return { data: [], error: null };
    }
  };
  window.safeInit = (name, fn) => {
    if (name === "admin-roles") fn();
  };
  window.tienePermiso = () => true;
  window.setMsg = (id, message, ok) => {
    const el = window.document.getElementById(id);
    if (el) {
      el.textContent = String(message || "");
      el.className = ok ? "msg ok" : "msg err";
    }
  };
  window.setEmpty = (id, message) => {
    const el = window.document.getElementById(id);
    if (el) el.textContent = String(message || "");
  };
  window.setLoading = () => {};
  window.showLoading = () => {};
  window.hideLoading = () => {};
  window.escHtml = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  window.eval(SOURCE);
  return { dom, window, calls };
}

test("Paso 4 RWHT 111/112: el nombre vacío no crea un rol; el válido se recorta y confirma", async () => {
  const { dom, window, calls } = setup();
  try {
    const form = window.document.getElementById("form-nuevo-rol");
    const nombre = window.document.getElementById("rol-nombre");
    assert.ok(form && nombre, "debe existir el formulario de rol real");

    nombre.value = "   ";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls.some((call) => call.name === "crear_rol"), false,
      "el nombre vacío debe cortarse antes del RPC");

    nombre.value = "  Encargado de almacén  ";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const call = calls.find((item) => item.name === "crear_rol");
    assert.ok(call, "el formulario válido debe invocar crear_rol");
    assert.deepEqual(call.params, { p_nombre: "Encargado de almacén" });
    assert.match(window.document.getElementById("msg-roles").textContent, /Rol creado/i);
    assert.equal(nombre.value, "", "el formulario se limpia después del éxito simulado");
    assert.ok(calls.some((item) => item.name === "listar_roles_admin"),
      "la lista de roles se actualiza tras la operación simulada");
  } finally {
    dom.window.close();
  }
});
