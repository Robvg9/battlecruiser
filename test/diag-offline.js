const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  let html = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  html = html.replace(/<script[^>]*src="https:\/\/cdn[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="app\.js"[^>]*><\/script>/g, "");
  html = html.replace(/<script[^>]*src="js\/[^"]*\.js"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://app.test/" });
  const { window } = dom;
  global.window = window; global.document = window.document; global.navigator = window.navigator; global.crypto = window.crypto;
  Object.defineProperty(window, "indexedDB", { value: new IDBFactory(), configurable: true });
  Object.defineProperty(window, "caches", { value: { keys: async () => [], delete: async () => true }, configurable: true });
  Object.defineProperty(window, "serviceWorker", { value: { getRegistrations: async () => [], register: async () => ({ unregister: async () => true }) }, configurable: true });
  const calls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u-test", email: "test@app.test" } } } }),
      onAuthStateChange: () => {}, signInWithPassword: async () => ({ error: null }), signOut: async () => ({ error: null }), updateUser: async () => ({ data: { user: {} }, error: null }),
    },
    rpc: async (nombre, params) => { calls.push({ nombre, params }); return client.__rpcResult; },
    from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
    __rpcResult: { data: "ok", error: null }, __rpcCalls: calls,
  };
  window.supabase = { createClient: () => client };
  const source = require("./_leer-app-js").leerAppJsConcatenado(__dirname);
  const script = window.document.createElement("script"); script.textContent = source; window.document.body.appendChild(script);
  const snap = (label) => console.log("[B23 DIAG]", label, {
    uid: window._usuarioActualId,
    userId: window._usuarioActual && window._usuarioActual.id,
    active: window._usuarioActual && window._usuarioActual.activo,
    exec: typeof window.ejecutarOperacion,
    save: typeof window.guardarOperacionPendiente,
    pending: typeof window.obtenerOperacionesPorEstado === "function" && window._usuarioActualId ? undefined : "uid-missing",
  });
  snap("after-script");
  await wait(0); snap("after-0ms");
  await wait(30); snap("after-30ms");
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const result = await window.ejecutarOperacion("compra", { p_producto_id: "p1", p_almacen_id: "a1", p_cantidad: 10 });
  console.log("[B23 DIAG] execute-result", result);
  console.log("[B23 DIAG] queue", window._usuarioActualId ? await window.obtenerOperacionesPorEstado("PENDIENTE") : "uid-missing-after-execute");
})();
