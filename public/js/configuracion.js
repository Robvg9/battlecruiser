// ==== Battlecruiser · js/configuracion.js ====
// Misión 9.3 T8 — Configuración / administración operativa.
// NO reimplementa usuarios/roles (usuarios-permisos.js) ni catálogos (catalogos.js).
// Solo panel de mantenimiento con datos reales y acciones ya existentes.

function _cfgEnsurePanel() {
  const tab = document.getElementById("tab-config");
  if (!tab || document.getElementById("cfg-mantenimiento")) return;

  const block = document.createElement("div");
  block.className = "cc-bloque";
  block.id = "cfg-mantenimiento";
  block.innerHTML =
    "<h3>Mantenimiento y diagnóstico</h3>" +
    '<p class="muted">Herramientas administrativas sobre la infraestructura existente. No hay respaldo/restauración de base de datos en el cliente.</p>' +
    '<div id="cfg-diag-grid" class="rep-grid"></div>' +
    '<div class="btn-row" style="margin-top:12px;flex-wrap:wrap;gap:8px">' +
    '<button type="button" id="cfg-ir-pendientes" class="cc-accion">Ir a Pendientes</button>' +
    '<button type="button" id="cfg-ir-mando" class="cc-accion">Centro de Mando / Auditoría</button>' +
    '<button type="button" id="cfg-actualizar-app" class="cc-accion">Actualizar app / borrar caché</button>' +
    '<button type="button" id="cfg-refrescar-diag" class="cc-accion">Refrescar diagnóstico</button>' +
    "</div>" +
    '<p class="msg" id="msg-config-diag"></p>' +
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
  grid.innerHTML = card(online ? "🟢 Online" : "⚪ Offline", "Conexión") + card(_cfgVersiónShell(), "Versión UI") + card(pend == null ? "—" : String(pend), "Ops. pendientes (memoria)") + card(b3 ? "OK" : "Degradado", "Contexto roles/permisos") + card(escHtml(user), "Usuario actual");
  const nota = document.getElementById("cfg-backup-nota");
  if (nota) nota.textContent = "Respaldo/restauración de datos: no implementado en el cliente. Requiere política y herramientas de Supabase (export/import) fuera de esta PWA.";
  const btnMando = document.getElementById("cfg-ir-mando");
  if (btnMando) btnMando.classList.toggle("hidden", !(typeof tienePermiso === "function" && tienePermiso("auditoria", "ver")));
}

async function refrescarConfiguracion() {
  if (!document.getElementById("tab-config")) return;
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
  if (btnRef) btnRef.addEventListener("click", function () { renderDiagnosticoConfig(); setMsg("msg-config-diag", "Diagnóstico actualizado.", true); });
});

// Carga de la capa de UX sin alterar la arquitectura ni duplicar módulos de negocio.
(function cargarRevisionUI() {
  function load() {
    if (document.getElementById("bc-ui-revision-script")) return;
    var s = document.createElement("script"); s.id = "bc-ui-revision-script"; s.src = "js/ui-revision-2026-08.js"; s.defer = true; document.head.appendChild(s);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true }); else load();
})();
