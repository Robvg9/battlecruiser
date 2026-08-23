// ==== Battlecruiser · js/navegacion.js ====
// Navegación por tabs y menú lateral desplegable.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

function irATab(tab) {
  if (!tab) return;
  // M18/M26: la pestaña visible "Turnos" usa data-tab="ciclos"; el legado "turnos" está oculto.
  if (tab === "turnos") {
    var ciclosBtn = document.querySelector('.tab-btn[data-tab="ciclos"]');
    if (ciclosBtn) tab = "ciclos";
  }
  // Defensa: no navegar sin permiso ver (resumen/pendientes = home/cola sin sección backend)
  if (tab !== "resumen" && tab !== "pendientes") {
    var seccion = (typeof TAB_A_SECCION !== "undefined" && TAB_A_SECCION) ? TAB_A_SECCION[tab] : null;
    if (!seccion || typeof tienePermiso !== "function" || !tienePermiso(seccion, "ver")) {
      console.warn("[BattleCruiser] irATab bloqueado sin permiso ver:", tab);
      return;
    }
  }
  const btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  if (!btn || btn.classList.contains("hidden") || btn.style.display === "none") return;
  btn.click();
}

safeInit("tabs", () => {
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    // No activar tabs ocultos / sin permiso
    if (btn.classList.contains("hidden") || btn.style.display === "none") {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const tab = btn.dataset.tab;
    if (tab && tab !== "resumen" && tab !== "pendientes") {
      const seccion = (typeof TAB_A_SECCION !== "undefined" && TAB_A_SECCION) ? TAB_A_SECCION[tab] : null;
      if (!seccion || typeof tienePermiso !== "function" || !tienePermiso(seccion, "ver")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("visible"));
    btn.classList.add("active");
    const panel = document.getElementById("tab-" + btn.dataset.tab);
    if (panel) panel.classList.add("visible");
    if (btn.dataset.tab === "pendientes") {
      refrescarPanelPendientes();
    } else if (btn.dataset.tab === "resumen") {
      if (typeof refrescarCentroControl === "function") refrescarCentroControl();
    } else if (btn.dataset.tab === "productos") {
      if (typeof renderProductosLista === "function" && typeof _cache !== "undefined" && (_cache.productos || []).length) renderProductosLista();
      else if (typeof refrescarProductos === "function") refrescarProductos();
    } else if (btn.dataset.tab === "reportes") {
      if (typeof refrescarReportes === "function") refrescarReportes();
    } else if (btn.dataset.tab === "inventario") {
      if (typeof refrescarInventario === "function") refrescarInventario();
    } else if (btn.dataset.tab === "movimientos") {
      if (typeof refrescarMovimientos === "function") refrescarMovimientos();
    } else if (btn.dataset.tab === "turnos") {
      if (typeof refrescarTurnos === "function") refrescarTurnos();
    } else if (btn.dataset.tab === "ciclos") {
      if (typeof refrescarCiclos === "function") refrescarCiclos();
    } else if (btn.dataset.tab === "operacion") {
      if (typeof refrescarOperacion === "function") refrescarOperacion();
    } else if (btn.dataset.tab === "comunicacion") {
      if (typeof refrescarComunicacion === "function") refrescarComunicacion();
    } else if (btn.dataset.tab === "mando") {
      if (typeof refrescarCentroMando === "function") refrescarCentroMando();
    } else if (btn.dataset.tab === "usuarios") {
      const infoEl = document.getElementById("usuario-actual-info");
      if (infoEl && typeof _usuarioActual !== "undefined" && _usuarioActual) infoEl.textContent = "Sesión: " + (_usuarioActual.nombre || "") + (_usuarioActual.rol ? " · " + _usuarioActual.rol : "");
      if (typeof refrescarUsuarios === "function") refrescarUsuarios();
    } else if (btn.dataset.tab === "config") {
      if (typeof refrescarRolesAdmin === "function") refrescarRolesAdmin();
      if (typeof refrescarConfiguracion === "function") refrescarConfiguracion();
      ["categorias", "unidades"].forEach((tabla) => {
        const refrescar = window["_refrescarCatalogo_" + tabla];
        if (typeof refrescar === "function") refrescar();
      });
    }
    if (btn.dataset.tab !== "pendientes" && typeof cerrarDetalleOperacion === "function") cerrarDetalleOperacion();
  });
});

safeInit("resumen-alertas-accion", () => {
  const panel = document.getElementById("tab-resumen");
  if (!panel) return;
  const manejar = (target) => {
    const accion = target.closest("[data-ir-tab]");
    if (!accion) return;
    irATab(accion.getAttribute("data-ir-tab"));
  };
  panel.addEventListener("click", (e) => manejar(e.target));
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { manejar(e.target); if (e.target.closest("[data-ir-tab]")) e.preventDefault(); }
  });
});

safeInit("resumen-movs-accion", () => {
  const movsEl = document.getElementById("resumen-movs-lista");
  if (!movsEl) return;
  const abrir = (target) => {
    const item = target.closest(".resumen-mov-item[data-mov-tab]");
    if (!item) return;
    irATab(item.getAttribute("data-mov-tab"));
  };
  movsEl.addEventListener("click", (e) => abrir(e.target));
  movsEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { if (e.target.closest(".resumen-mov-item[data-mov-tab]")) { e.preventDefault(); abrir(e.target); } }
  });
});

safeInit("menu-lateral", () => {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const toggleBtn = document.getElementById("sidebar-toggle-btn");
  const closeBtn = document.getElementById("sidebar-close-btn");
  function abrirMenu() { sidebar.classList.add("open"); backdrop.classList.add("visible"); toggleBtn.setAttribute("aria-expanded", "true"); }
  function cerrarMenu() { sidebar.classList.remove("open"); backdrop.classList.remove("visible"); toggleBtn.setAttribute("aria-expanded", "false"); }
  toggleBtn.addEventListener("click", () => sidebar.classList.contains("open") ? cerrarMenu() : abrirMenu());
  closeBtn.addEventListener("click", cerrarMenu);
  backdrop.addEventListener("click", cerrarMenu);
  sidebar.addEventListener("click", (e) => { if (e.target.closest(".tab-btn")) cerrarMenu(); });
  window._battlecruiserCerrarMenuLateral = cerrarMenu;
});

window.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector('script[data-bc-m18]')) return;
  const s = document.createElement("script");
  s.src = "js/ciclos-unificacion.js?v=18";
  s.dataset.bcM18 = "true";
  s.async = false;
  document.body.appendChild(s);
});
