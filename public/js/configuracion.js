// ==== Battlecruiser · js/configuracion.js ====
// Misión 9.3 T8 — Configuración / administración operativa.
// NO reimplementa usuarios/roles (usuarios-permisos.js) ni catálogos (catalogos.js).
// Solo panel de mantenimiento con datos reales y acciones ya existentes.

function _cfgEnsurePanel() {
  const tab = document.getElementById("tab-conectividad");
  if (!tab || document.getElementById("cfg-mantenimiento")) return;

  const block = document.createElement("div");
  block.className = "cc-bloque";
  block.id = "cfg-mantenimiento";
  block.innerHTML =
    "<h3>Conectividad y mantenimiento</h3>" +
    '<p class="muted">Estado de las rutas Auth y Data API, reintentos y mantenimiento. Un timeout aislado no demuestra una caída total.</p>' +
    '<div id="cfg-diag-grid" class="rep-grid"></div>' +
    '<div class="btn-row" style="margin-top:12px;flex-wrap:wrap;gap:8px">' +
    '<button type="button" id="cfg-ir-pendientes" class="cc-accion">Ir a Pendientes</button>' +
    '<button type="button" id="cfg-ir-mando" class="cc-accion">Centro de Mando / Auditoría</button>' +
    '<button type="button" id="cfg-actualizar-app" class="cc-accion">Actualizar app / borrar caché</button>' +
    '<button type="button" id="cfg-refrescar-diag" class="cc-accion">Refrescar diagnóstico</button>' +
    "</div>" +
    '<p class="msg" id="msg-config-diag"></p>' +
    '<p class="muted" id="cfg-backend-probe-note"></p>' +
    '<p class="muted" id="cfg-backup-nota"></p>';

  tab.insertBefore(block, tab.firstChild);
}

function _cfgVersiónShell() {
  try { if (navigator.serviceWorker && navigator.serviceWorker.controller) {} } catch (e) {}
  const foot = document.querySelector(".app-footer-version");
  return foot ? foot.textContent.trim() : "BattleCruiser";
}

function _cfgContarPendientes() {
  try {
    if (typeof _operacionesPendientesCache !== "undefined" && Array.isArray(_operacionesPendientesCache)) return _operacionesPendientesCache.length;
  } catch (e) {}
  return null;
}

function renderDiagnosticoConfig() {
  _cfgEnsurePanel();
  const grid = document.getElementById("cfg-diag-grid");
  if (!grid) return;
  const online = typeof estaRealmenteDesconectado === "function" ? !estaRealmenteDesconectado() : navigator.onLine;
  const pend = _cfgContarPendientes();
  const user = typeof _usuarioActual !== "undefined" && _usuarioActual ? ((_usuarioActual.nombre || "—") + (_usuarioActual.rol ? " · " + _usuarioActual.rol : "")) : "—";
  const b3 = typeof contextoB3Disponible === "function" && contextoB3Disponible();
  function card(valor, etiqueta) { return '<div class="resumen-card"><div class="valor">' + valor + '</div><div class="etiqueta">' + etiqueta + "</div></div>"; }
  const probe = window.__BC_BACKEND_PROBE__ || null;
  const probeLabel = !probe ? "Sin prueba"
    : probe.status === "online" ? "Respuesta recibida"
    : probe.status === "degraded" && probe.reason === "timeout" ? "Conexión intermitente"
    : probe.status === "degraded" ? "Sondeo degradado"
    : probe.reason === "timeout" ? "Tiempo agotado"
    : probe.reason === "network_error" ? "Error de red"
    : probe.reason === "device_offline" ? "Dispositivo offline"
    : probe.reason === "server_http_error" ? "Respuesta HTTP no válida"
    : probe.reason === "probe_config_missing" ? "Sondeo sin configuración"
    : probe.reason === "probe_error" ? "Error de sondeo"
    : "Sin respuesta";
  grid.innerHTML = card(online ? "🟢 Online" : "⚪ Offline", "Conexión") + card(_cfgVersiónShell(), "Versión UI") + card(pend == null ? "—" : String(pend), "Ops. pendientes (memoria)") + card(b3 ? "OK" : "Degradado", "Contexto roles/permisos") + card(typeof escHtml === "function" ? escHtml(user) : user, "Usuario actual") + card(probeLabel, "Último sondeo backend");
  const probeNote = document.getElementById("cfg-backend-probe-note");
  if (probeNote) {
    const watcherNote = " Vigilancia: consulta Auth y Data API, sondea cada 30 s en primer plano y reintenta en 3–30 s; al volver a la app comprueba de inmediato. Un fallo aislado se tolera; Android puede pausar la PWA en segundo plano.";
    if (!probe) probeNote.textContent = "Sondeo real de backend pendiente. Se revisan Auth y Data API sin registrar credenciales ni tokens." + watcherNote;
    else {
      const time = new Date(probe.checkedAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const httpStatus = typeof probe.httpStatus === "number" ? " · HTTP " + probe.httpStatus : "";
      const service = probe.service ? " · ruta " + probe.service : "";
      const failures = typeof probe.consecutiveFailures === "number" ? " · fallos seguidos " + probe.consecutiveFailures : "";
      probeNote.textContent = "Último sondeo: " + probe.reason + service + httpStatus + " · " + probe.durationMs + " ms · " + time + failures + ". Diagnóstico sanitizado; no incluye credenciales ni tokens." + watcherNote;
    }
  }
  const nota = document.getElementById("cfg-backup-nota");
  if (nota) nota.textContent = "Respaldo/restauración de datos: no implementado en el cliente. Requiere política y herramientas de Supabase.";
  const btnMando = document.getElementById("cfg-ir-mando");
  if (btnMando) btnMando.classList.toggle("hidden", !(typeof tienePermiso === "function" && tienePermiso("auditoria", "ver")));
}

async function refrescarConfiguracion() {
  if (!document.getElementById("tab-conectividad")) return;
  renderDiagnosticoConfig();
}

safeInit("config-mantenimiento", function () {
  _cfgEnsurePanel(); renderDiagnosticoConfig();
  var btnPend = document.getElementById("cfg-ir-pendientes");
  if (btnPend) btnPend.addEventListener("click", function () { if (typeof irATab === "function") irATab("pendientes"); else { var b = document.querySelector('.tab-btn[data-tab="pendientes"]'); if (b) b.click(); } });
  var btnMando = document.getElementById("cfg-ir-mando");
  if (btnMando) btnMando.addEventListener("click", function () { if (typeof tienePermiso === "function" && !tienePermiso("auditoria", "ver")) { setMsg("msg-config-diag", "No tenés permiso de auditoría.", false); return; } if (typeof irATab === "function") irATab("mando"); else { var b = document.querySelector('.tab-btn[data-tab="mando"]'); if (b) b.click(); } });
  var btnUp = document.getElementById("cfg-actualizar-app");
  if (btnUp) btnUp.addEventListener("click", function () { var existente = document.getElementById("update-app-btn"); if (existente) { existente.click(); return; } if (typeof actualizarApp === "function") actualizarApp(btnUp); else setMsg("msg-config-diag", "No se encontró la función de actualizar app.", false); });
  var btnRef = document.getElementById("cfg-refrescar-diag");
  if (btnRef) btnRef.addEventListener("click", async function () {
    var respondio = false;
    if (typeof sondearBackend === "function") {
      try { respondio = await sondearBackend(); } catch (e) { respondio = false; }
    }
    renderDiagnosticoConfig();
    setMsg("msg-config-diag", respondio ? "El backend respondió al sondeo." : "El backend no respondió al sondeo. Revisa el último resultado.", respondio);
  });
});

// Carga de la capa de UX sin alterar la arquitectura ni duplicar módulos de negocio.
(function cargarRevisionUI() {
  function load() {
    if (document.getElementById("bc-ui-revision-script")) return;
    var s = document.createElement("script"); s.id = "bc-ui-revision-script"; s.src = "js/ui-revision-2026-08.js"; s.defer = true; document.head.appendChild(s);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true }); else load();
})();

(function cargarAjustesMigradosConfiguracion() {
  function load() {
    if (document.getElementById("bc-config-ajustes-migrados-script")) return;
    var s = document.createElement("script");
    s.id = "bc-config-ajustes-migrados-script";
    s.src = "js/configuracion-ajustes-migrados-20260903.js?v=4";
    s.defer = true;
    document.head.appendChild(s);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true }); else load();
})();
