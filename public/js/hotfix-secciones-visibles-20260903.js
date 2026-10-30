// BattleCruiser — normalización de etiquetas de navegación.
// Política de visibilidad: exclusivamente permisos-navegacion.js (fail-closed).
(function () {
  "use strict";
  var VERSION = "20261030.1";
  if (window.__BC_SECCIONES_LABELS__ === VERSION) return;
  window.__BC_SECCIONES_LABELS__ = VERSION;

  var LABELS = { config: "Administración", ciclos: "Turnos" };

  function normalizarEtiquetas() {
    var tabs = document.getElementById("tabs");
    if (!tabs) return;
    tabs.querySelectorAll(".tab-btn[data-tab]").forEach(function (btn) {
      var label = LABELS[btn.dataset.tab];
      if (!label) return;
      var current = btn.querySelector(".bc-nav-label");
      if (current) {
        current.textContent = label;
      } else if (btn.querySelector(".bc-nav-icon")) {
        var span = document.createElement("span");
        span.className = "bc-nav-label";
        span.textContent = label;
        btn.appendChild(span);
      } else if (btn.textContent.trim() !== label) {
        btn.textContent = label;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", normalizarEtiquetas, { once: true });
  } else {
    normalizarEtiquetas();
  }
})();
