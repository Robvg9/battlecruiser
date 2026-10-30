// BattleCruiser — compatibilidad visual de navegación, sin conceder permisos.
(function () {
  "use strict";
  var VERSION = "20261030.2";
  if (window.__BC_SECCIONES_VISIBLES_20260903__ === VERSION) return;
  window.__BC_SECCIONES_VISIBLES_20260903__ = VERSION;

  function setLabel(tab, label) {
    var btn = document.querySelector('#tabs .tab-btn[data-tab="' + tab + '"]');
    if (!btn) return;
    var span = btn.querySelector(".bc-nav-label");
    if (span) span.textContent = label;
    else if (btn.querySelector(".bc-nav-icon")) {
      span = document.createElement("span");
      span.className = "bc-nav-label";
      span.textContent = label;
      btn.appendChild(span);
    } else if (!btn.textContent.trim() || tab === "config") {
      btn.textContent = label;
    }
  }

  function run() {
    // This legacy module used to force every tab and Configuración visible.
    // It now owns labels only; the effective-permission module owns visibility.
    setLabel("config", "Administración");
    setLabel("ciclos", "Turnos");
    if (typeof window.aplicarPermisosAInterfaz === "function") {
      window.aplicarPermisosAInterfaz();
    }
  }

  function installSelectionMarker() {
    var tabs = document.getElementById("tabs");
    if (!tabs || tabs.__bcConfigVisibilityListener) return;
    tabs.__bcConfigVisibilityListener = true;
    tabs.addEventListener("click", function (event) {
      var btn = event.target && event.target.closest
        ? event.target.closest(".tab-btn[data-tab]") : null;
      if (!btn || !tabs.contains(btn)) return;
      window.__BC_CONFIG_TAB_SELECTED = btn.dataset.tab === "config";
      window.setTimeout(run, 0);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      installSelectionMarker();
      run();
    }, { once: true });
  } else {
    installSelectionMarker();
    run();
  }
})();
