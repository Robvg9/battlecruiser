// ==== Battlecruiser · js/navegacion.js ====
// Navegación por tabs y menú lateral desplegable.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

// R3: helper de navegación reutilizable. Activa un tab por data-tab usando
function irATab(tab) {
  if (!tab) return;
  const btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  if (btn) btn.click();
}

// ---- Navegación por tabs ----
safeInit("tabs", () => {
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("visible"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("visible");
    // el panel para mostrar el estado actual de la cola (una sola
    // lectura, solo cuando hace falta).
    if (btn.dataset.tab === "pendientes") {
      refrescarPanelPendientes();
    } else if (btn.dataset.tab === "resumen") {
      // refrescar el estado operacional derivado de la cola real.
      if (typeof refrescarCentroControl === "function") refrescarCentroControl();
    } else if (btn.dataset.tab === "reportes") {
      // B5: al entrar a Reportes, cargar resumen y detalle.
      if (typeof refrescarReportes === "function") refrescarReportes();
    } else if (btn.dataset.tab === "inventario") {
      // B6: al entrar a Inventario, cargar el inventario enriquecido.
      if (typeof refrescarInventario === "function") refrescarInventario();
    } else if (btn.dataset.tab === "movimientos") {
      // B6: al entrar a Movimientos, cargar la trazabilidad.
      if (typeof refrescarMovimientos === "function") refrescarMovimientos();
    } else if (btn.dataset.tab === "turnos") {
      // B7: al entrar a Turnos, cargar el turno actual e historial.
      if (typeof refrescarTurnos === "function") refrescarTurnos();
    } else if (btn.dataset.tab === "operacion") {
      // B7: al entrar a Operación, cargar responsabilidades e incidencias.
      if (typeof refrescarOperacion === "function") refrescarOperacion();
    } else if (btn.dataset.tab === "comunicacion") {
      // B8: al entrar a Comunicación, cargar conversaciones.
      if (typeof refrescarComunicacion === "function") refrescarComunicacion();
    } else if (btn.dataset.tab === "mando") {
      // B4: al entrar al Centro de Mando, refrescar estado/alertas/auditoría.
      if (typeof refrescarCentroMando === "function") refrescarCentroMando();
    } else if (btn.dataset.tab === "usuarios") {
      const infoEl = document.getElementById("usuario-actual-info");
      if (infoEl && typeof _usuarioActual !== "undefined" && _usuarioActual) {
        infoEl.textContent = "Sesión: " + (_usuarioActual.nombre || "") + (_usuarioActual.rol ? " · " + _usuarioActual.rol : "");
      }
      if (typeof refrescarUsuarios === "function") refrescarUsuarios();
    } else if (btn.dataset.tab === "config") {
      if (typeof refrescarRolesAdmin === "function") refrescarRolesAdmin();
    }
    if (btn.dataset.tab !== "pendientes" && typeof cerrarDetalleOperacion === "function") {
      // Al salir de la pestana Pendientes, cerrar el detalle si estaba
      // abierto para que no quede visible encima de otra seccion.
      cerrarDetalleOperacion();
    }
  });
});

// R3: navegación accionable del Centro de Control. Items del panel "Stock
// bajo mínimo" y el card "Bajo mínimo" llevan directo a Inventario con un
// click o Enter. Reutiliza irATab() y el listener de tabs existente.
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
    if (e.key === "Enter" || e.key === " ") {
      manejar(e.target);
      if (e.target.closest("[data-ir-tab]")) e.preventDefault();
    }
  });
});

// R9: cada movimiento de "Últimos movimientos" (venta/transferencia/vale) es
// accionable: click/Enter navega al tab correspondiente conservando el ID.
// Reutiliza irATab() + _cache. Sin segundo router, offline-first intacto.
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
    if (e.key === "Enter" || e.key === " ") {
      if (e.target.closest(".resumen-mov-item[data-mov-tab]")) { e.preventDefault(); abrir(e.target); }
    }
  });
});

// ---- Menú lateral desplegable — reemplaza los tabs horizontales ----
safeInit("menu-lateral", () => {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const toggleBtn = document.getElementById("sidebar-toggle-btn");
  const closeBtn = document.getElementById("sidebar-close-btn");

  function abrirMenu() {
    sidebar.classList.add("open");
    backdrop.classList.add("visible");
    toggleBtn.setAttribute("aria-expanded", "true");
  }
  function cerrarMenu() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("visible");
    toggleBtn.setAttribute("aria-expanded", "false");
  }

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.contains("open") ? cerrarMenu() : abrirMenu();
  });
  closeBtn.addEventListener("click", cerrarMenu);
  backdrop.addEventListener("click", cerrarMenu);
  sidebar.addEventListener("click", (e) => {
    if (e.target.closest(".tab-btn")) cerrarMenu();
  });

  window._battlecruiserCerrarMenuLateral = cerrarMenu;
});

