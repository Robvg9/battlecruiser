"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const index = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const permissionsSource = fs.readFileSync(path.join(root, "public/js/permisos-navegacion.js"), "utf8");
const legacyVisibilitySource = fs.readFileSync(path.join(root, "public/js/hotfix-secciones-visibles-20260903.js"), "utf8");
const b7Source = fs.readFileSync(path.join(root, "public/js/operacion-humana.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261030123000_step4_effective_permission_scope_b7.sql"), "utf8");

function fixture({ role = "Dueño", permissions = {}, ready = true } = {}) {
  const dom = new JSDOM(index, { runScripts: "outside-only", url: "https://battlecruiser-permissions.test/" });
  const { window } = dom;
  const { document } = window;
  const shell = document.getElementById("app-shell");
  shell.classList.add("visible");
  window._usuarioActual = ready ? { id: "u-test", rol: role } : null;
  window._permisosCargaExitosa = ready;
  window._permisosEfectivos = permissions;
  window.irATab = function (tab) {
    const btn = document.querySelector('#tabs .tab-btn[data-tab="' + tab + '"]');
    if (!btn || btn.getAttribute("data-bc-permiso") !== "1") return;
    document.querySelectorAll("#tabs .tab-btn.active").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel.visible").forEach((item) => item.classList.remove("visible"));
    btn.classList.add("active");
    const panel = document.getElementById("tab-" + tab);
    if (panel) panel.classList.add("visible");
  };
  window.eval(permissionsSource);
  return { dom, window, document };
}

test("el menú queda cerrado hasta tener usuario autenticado y carga de permisos confirmada", () => {
  const { dom, document } = fixture({ ready: false });
  try {
    const nav = document.getElementById("tabs");
    assert.equal(nav.getAttribute("data-bc-permissions-ready"), "0");
    for (const btn of document.querySelectorAll("#tabs .tab-btn[data-tab]")) {
      assert.equal(btn.getAttribute("data-bc-permiso"), "0", btn.dataset.tab + " debe permanecer bloqueada durante la carga");
      assert.ok(btn.classList.contains("hidden"), btn.dataset.tab + " no debe mostrarse antes del permiso");
    }
    assert.equal(document.querySelector("#tabs .tab-btn.active"), null, "no debe quedar una ruta activa sin permisos");
  } finally {
    dom.window.close();
  }
});

test("Dependienta ve solo módulos concedidos; crear no sustituye ver y Operación separa incidencias de responsabilidades", () => {
  const { dom, document } = fixture({
    role: "Dependienta",
    permissions: {
      turnos: { ver: true },
      comunicacion: { ver: true },
      incidencias: { ver: true, crear: true },
      ventas: { ver: true, crear: true },
      productos: { crear: true },
      almacenes: { crear: true },
      transferencias: { ver: true, crear: true },
      reportes: { ver: false },
      responsabilidades: { crear: true }
    }
  });
  try {
    const visible = (tab) => document.querySelector('#tabs [data-tab="' + tab + '"]').getAttribute("data-bc-permiso") === "1";
    assert.equal(visible("jornada"), true);
    assert.equal(visible("ciclos"), true);
    assert.equal(visible("comunicacion"), true);
    assert.equal(visible("operacion"), true);
    assert.equal(visible("pendientes"), true, "Pendientes es la cola personal filtrada por usuario");
    assert.equal(visible("conectividad"), true);
    assert.equal(visible("preferencias"), true);
    assert.equal(visible("ventas"), false, "el POS sigue fuera de la ruta ordinaria de Dependienta");
    assert.equal(visible("productos"), false, "productos.crear no concede productos.ver");
    assert.equal(visible("almacenes"), false, "almacenes.crear no concede almacenes.ver");
    assert.equal(visible("reportes"), false);
    assert.equal(visible("transferencias"), false, "ruta retirada, aunque exista permiso");
    assert.equal(visible("vales"), false);
    assert.equal(visible("turnos"), false, "la ruta antigua sigue redirigida a Ciclos");
    assert.equal(document.getElementById("operacion-responsabilidades-section").classList.contains("hidden"), true);
    assert.equal(document.getElementById("operacion-incidencias-section").classList.contains("hidden"), false);
    assert.equal(document.getElementById("form-incidencia").classList.contains("hidden"), false);
    assert.equal(document.getElementById("form-responsabilidad").classList.contains("hidden"), true);
  } finally {
    dom.window.close();
  }
});

test("Administración compuesta solo muestra las secciones con su permiso ver propio", () => {
  const { dom, document } = fixture({
    permissions: { categorias: { ver: true, crear: true } }
  });
  try {
    const visible = (tab) => document.querySelector('#tabs [data-tab="' + tab + '"]').getAttribute("data-bc-permiso") === "1";
    assert.equal(visible("config"), true);
    assert.equal(document.getElementById("config-roles-section").classList.contains("hidden"), true);
    assert.equal(document.getElementById("config-categorias-section").classList.contains("hidden"), false);
    assert.equal(document.getElementById("config-unidades-section").classList.contains("hidden"), true);
    assert.equal(document.getElementById("form-categoria").classList.contains("hidden"), false);
    assert.equal(document.getElementById("form-nuevo-rol").classList.contains("hidden"), true);
    assert.equal(document.getElementById("form-unidad").classList.contains("hidden"), true);
  } finally {
    dom.window.close();
  }
});

test("el hotfix de visibilidad antiguo no puede reabrir una pestaña denegada", () => {
  const { dom, window, document } = fixture({
    permissions: { ventas: { ver: true }, reportes: { ver: true } }
  });
  try {
    window.eval(legacyVisibilitySource);
    const productos = document.querySelector('#tabs [data-tab="productos"]');
    const resumen = document.querySelector('#tabs [data-tab="resumen"]');
    assert.equal(productos.getAttribute("data-bc-permiso"), "0");
    assert.ok(productos.classList.contains("hidden"));
    assert.equal(resumen.getAttribute("data-bc-permiso"), "1");
    assert.doesNotMatch(legacyVisibilitySource, /KEEP_HIDDEN|style\.setProperty\(["']display["'],\s*["'](?:flex|block)["']/);
    assert.match(legacyVisibilitySource, /aplicarPermisosAInterfaz/);
  } finally {
    dom.window.close();
  }
});

test("las listas B7 y sus operaciones usan permisos específicos de responsabilidades e incidencias", () => {
  assert.match(b7Source, /async function refrescarListaResponsabilidades\(\)[\s\S]{0,220}tienePermiso\(["']responsabilidades["'],\s*["']ver["']\)/);
  assert.match(b7Source, /async function refrescarListaIncidencias\(\)[\s\S]{0,220}tienePermiso\(["']incidencias["'],\s*["']ver["']\)/);
  assert.match(b7Source, /tienePermiso\(["']responsabilidades["'],\s*["']crear["']\)/);
  assert.match(b7Source, /tienePermiso\(["']incidencias["'],\s*["']crear["']\)/);
  assert.match(b7Source, /tienePermiso\(["']responsabilidades["'],\s*["']editar["']\)/);
  assert.match(b7Source, /tienePermiso\(["']incidencias["'],\s*["']editar_any["']\)/);
});

test("las RPC B7 SECURITY DEFINER exigen el permiso propio y conservan el alcance por usuario", () => {
  const required = [
    ["crear_responsabilidad", "responsabilidades", "crear"],
    ["actualizar_responsabilidad", "responsabilidades", "editar"],
    ["crear_incidencia", "incidencias", "crear"],
    ["resolver_incidencia", "incidencias", "editar_any"],
    ["listar_turnos", "turnos", "ver"],
    ["listar_cuadres", "turnos", "ver"],
    ["listar_responsabilidades", "responsabilidades", "ver"],
    ["listar_incidencias", "incidencias", "ver"],
    ["turno_actual_usuario", "turnos", "ver"]
  ];
  for (const [fn, section, action] of required) {
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION public." + fn + "(");
    assert.ok(start >= 0, "falta reemplazo de la RPC " + fn);
    const end = migration.indexOf("$$;", start);
    assert.ok(end > start, "función SQL incompleta: " + fn);
    const definition = migration.slice(start, end + 3);
    assert.match(definition, new RegExp("public\\._validar_usuario_operacion\\('" + section + "',\\s*'" + action + "'\\)"),
      fn + " debe exigir " + section + "." + action);
    assert.match(definition, /SECURITY DEFINER[\s\S]*SET search_path = public, pg_temp/);
  }
  assert.match(migration, /WHERE \(v_es_admin OR r\.usuario_id = v_uid OR r\.creador_id = v_uid\)/);
  assert.match(migration, /WHERE \(v_es_admin OR i\.usuario_id = v_uid\)/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.calcular_dinero_esperado_turno/,
    "no debe reemplazar la función que ya tiene endurecimiento de propiedad");
  assert.doesNotMatch(migration, /\bGRANT\s+EXECUTE|\bREVOKE\s+EXECUTE/i,
    "no se deben reabrir privilegios EXECUTE");
});
