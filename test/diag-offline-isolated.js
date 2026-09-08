"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");

(async () => {
  const html = "<!doctype html><html><body><span id=\"cola-pendientes-badge\" class=\"hidden\"></span></body></html>";
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => console.warn("[B23 ISO] jsdom:", error.message));

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://app.test/",
    virtualConsole,
  });
  const { window } = dom;

  global.window = window;
  global.document = window.document;
  // Node 24 exposes globalThis.navigator as a read-only accessor. The production
  // code only needs window.navigator, so do not assign/override the global one.

  Object.defineProperty(window, "indexedDB", { value: new IDBFactory(), configurable: true });
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true, writable: true });

  const rpcCalls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u-test" } }, error: null }) },
    rpc: async (nombre, params) => {
      rpcCalls.push({ nombre, params });
      return { data: "ok", error: null };
    },
  };
  window.client = client;

  const prelude = `
    let _usuarioActualId = "u-test";
    let _usuarioActual = { id: "u-test", nombre: "Test", activo: true };
    let appShell = { classList: { contains: () => true } };
    let _cache = { productos: [], almacenes: [], presentaciones: [] };
    function safeInit(_nombre, fn){ try { fn(); } catch (_) {} }
    function usuarioPuedeOperar(){ return true; }
    function sincronizarUsuarioIdParaOperaciones(){ _usuarioActualId = "u-test"; }
    function actualizarIndicadorConexion(){}
    function factorPresentacionConocido(){ return 1; }
    function registrarAuditoria(){}
    function setMsg(){}
    function escHtml(v){ return String(v ?? ""); }
    function fechaCorta(v){ return new Date(v).toISOString().slice(0,10); }
    function fechaHoraCompleta(v){ return new Date(v).toISOString(); }
    function fechaHora(v){ return new Date(v).toISOString(); }
    function money(v){ return Number(v || 0).toFixed(2); }
    function refrescarCentroControl(){}
    function refrescarPanelPendientes(){}
    function refrescarStockYSelects(){}
    function refrescarProductos(){}
    function refrescarTransferencias(){}
    function refrescarVales(){}
    function refrescarVentas(){}
  `;

  const preludeEl = window.document.createElement("script");
  preludeEl.textContent = prelude;
  window.document.body.appendChild(preludeEl);

  const offlineSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "offline.js"), "utf8");
  const script = window.document.createElement("script");
  script.textContent = offlineSource;
  window.document.body.appendChild(script);

  if (typeof window.crearOperacionPendiente !== "function" || typeof window.ejecutarOperacion !== "function") {
    throw new Error("offline.js no expuso las funciones requeridas en el harness aislado");
  }

  const resultado = await window.ejecutarOperacion("compra", {
    p_producto_id: "p1",
    p_almacen_id: "a1",
    p_cantidad: 10,
  });

  const queue = await window.obtenerOperacionesPorEstado("PENDIENTE");
  console.log("[B23 ISO] offline-result", resultado);
  console.log("[B23 ISO] queue-count", queue.length);
  console.log("[B23 ISO] queue-item", queue[0] && {
    id: queue[0].id,
    tipo: queue[0].tipo,
    usuario_id: queue[0].usuario_id,
    estado: queue[0].estado,
    idempotency_key: queue[0].idempotency_key,
  });

  await window.refrescarOperacionesPendientesCache();
  const proyeccion = window.ajustePendiente("p1", "a1");
  console.log("[B23 ISO] projection", proyeccion);

  if (!resultado || resultado.ok !== true || resultado.offline !== true) {
    throw new Error("ejecutarOperacion offline no devolvió {ok:true, offline:true}");
  }
  if (!Array.isArray(queue) || queue.length !== 1) {
    throw new Error("la operación offline no persistió exactamente una entrada en IndexedDB");
  }
  if (queue[0].usuario_id !== "u-test" || queue[0].estado !== "PENDIENTE") {
    throw new Error("la operación persistida tiene identidad o estado incorrectos");
  }
  if (proyeccion.ajuste !== 10) {
    throw new Error(`proyección incorrecta: se esperaba 10 y llegó ${proyeccion.ajuste}`);
  }
  if (rpcCalls.length !== 0) {
    throw new Error(`se llamó al RPC estando offline: ${rpcCalls.length} llamada(s)`);
  }
  console.log("[B23 ISO] PASS");
})().catch((error) => {
  console.error("[B23 ISO] FAIL", error);
  process.exitCode = 1;
});
