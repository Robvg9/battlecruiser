// Step 4/15 — offline read cache: server → IndexedDB → offline fallback → fresh reconnect.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");

test("withCache persists read-only server data, serves cache offline and replaces it after recovery", async (t) => {
  const oldWindow = global.window;
  const oldDocument = global.document;
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    throw error;
  });

  const dom = new JSDOM(
    '<!doctype html><html><head></head><body>' +
      '<div id="conn-status"><span id="conn-text"></span></div>' +
      '<div id="conn-status-app"><span id="conn-text-app"></span></div>' +
      '<span id="cola-pendientes-badge" class="hidden"></span>' +
    '</body></html>',
    { runScripts: "dangerously", url: "https://battlecruiser.test/", virtualConsole }
  );
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  Object.defineProperty(window, "indexedDB", { value: new IDBFactory(), configurable: true });
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true, writable: true });

  const prelude = [
    'let _usuarioActualId = "u-test";',
    'function usuarioIdParaCola() { return _usuarioActualId; }',
    'let _cache = { productos: [], almacenes: [], presentaciones: [] };',
    'let appShell = { classList: { contains: () => false } };',
    'function safeInit(_name, fn) { try { fn(); } catch (_) {} }',
    'function setTestUser(id) { _usuarioActualId = id; }',
    'function actualizarContadorColaPendiente() {}',
    'function setMsg() {}',
    'function refrescarCentroControl() {}',
    'function refrescarPanelPendientes() {}',
    'function refrescarStockYSelects() {}',
    'function refrescarProductos() {}',
    'function refrescarTransferencias() {}',
    'function refrescarVales() {}',
    'function refrescarVentas() {}',
    'function registrarAuditoria() {}',
    'function usuarioPuedeOperar() { return true; }',
    'function sincronizarUsuarioIdParaOperaciones() {}',
    'function factorPresentacionConocido() { return 1; }',
    'function escHtml(v) { return String(v ?? ""); }',
    'function fechaCorta(v) { return new Date(v).toISOString().slice(0, 10); }',
    'function money(v) { return Number(v || 0).toFixed(2); }'
  ].join("\n");
  const preludeEl = window.document.createElement("script");
  preludeEl.textContent = prelude;
  window.document.body.appendChild(preludeEl);

  const offlineSource = fs.readFileSync(
    path.join(__dirname, "..", "public", "js", "offline.js"),
    "utf8"
  );
  const script = window.document.createElement("script");
  script.textContent = offlineSource;
  window.document.body.appendChild(script);

  t.after(() => {
    dom.window.close();
    if (oldWindow === undefined) delete global.window;
    else global.window = oldWindow;
    if (oldDocument === undefined) delete global.document;
    else global.document = oldDocument;
  });

  assert.equal(typeof window.withCache, "function", "offline.js should expose withCache");
  assert.equal(typeof window.leerDeCache, "function", "offline.js should expose its read-cache path");

  let calls = 0;
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true, writable: true });
  const first = await window.withCache("productos", async () => {
    calls++;
    return { data: [{ id: "p1", nombre: "Server v1" }], error: null };
  });
  assert.deepEqual(JSON.parse(JSON.stringify(first)), [{ id: "p1", nombre: "Server v1" }]);
  assert.equal(calls, 1, "online mode queries the server");
  assert.equal(window.estaBackendInaccesible(), false);

  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true, writable: true });
  const offline = await window.withCache("productos", async () => {
    calls++;
    throw new Error("must not query server while offline");
  });
  assert.deepEqual(JSON.parse(JSON.stringify(offline)), [{ id: "p1", nombre: "Server v1" }]);
  assert.equal(calls, 1, "offline mode must not call the query function");

  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true, writable: true });
  const networkError = await window.withCache("productos", async () => {
    calls++;
    return { data: null, error: { message: "Failed to fetch" } };
  });
  assert.deepEqual(JSON.parse(JSON.stringify(networkError)), [{ id: "p1", nombre: "Server v1" }]);
  assert.equal(calls, 2, "a failed online request falls back to the last saved read");
  assert.equal(window.estaBackendInaccesible(), true, "network failure must not masquerade as connected backend");

  const recovered = await window.withCache("productos", async () => {
    calls++;
    return { data: [{ id: "p1", nombre: "Server v2" }, { id: "p2", nombre: "Fresh after reconnect" }], error: null };
  });
  assert.deepEqual(JSON.parse(JSON.stringify(recovered)), [
    { id: "p1", nombre: "Server v2" },
    { id: "p2", nombre: "Fresh after reconnect" },
  ]);
  assert.equal(calls, 3);
  assert.equal(window.estaBackendInaccesible(), false, "a successful server response restores backend reachability");

  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true, writable: true });
  const freshOffline = await window.withCache("productos", async () => {
    calls++;
    throw new Error("must not query while offline");
  });
  assert.deepEqual(JSON.parse(JSON.stringify(freshOffline)), [
    { id: "p1", nombre: "Server v2" },
    { id: "p2", nombre: "Fresh after reconnect" },
  ], "successful reconnect must replace the prior cache");

  window.setTestUser("other-user");
  const isolatedUserCache = await window.withCache("productos", async () => {
    calls++;
    throw new Error("must not query while offline");
  });
  assert.deepEqual(JSON.parse(JSON.stringify(isolatedUserCache)), [],
    "cached read data must be scoped to the authenticated user");
  assert.equal(calls, 3, "no server call is allowed in offline probes");
});
