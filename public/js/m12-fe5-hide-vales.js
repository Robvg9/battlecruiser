// BattleCruiser M12-FE.5 — eliminación visual/operativa de Vales de salida
// No toca backend ni datos. Solo quita menú, panel y entradas de reporte de vales.
(function () {
  "use strict";
  if (window.__bcM12Fe5HideVales) return;
  window.__bcM12Fe5HideVales = true;

  function removeValesUi() {
    document.querySelectorAll('.tab-btn[data-tab="vales"]').forEach(function (btn) {
      if (btn.parentNode) btn.parentNode.removeChild(btn);
    });
    var panel = document.getElementById("tab-vales");
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    var form = document.getElementById("form-vale");
    if (form && form.parentNode) form.parentNode.removeChild(form);
    document.querySelectorAll('.rep-tab-btn[data-rep="vales"]').forEach(function (btn) {
      if (btn.parentNode) btn.parentNode.removeChild(btn);
    });
    var movTipo = document.getElementById("mov-filtro-tipo");
    if (movTipo) {
      Array.prototype.slice.call(movTipo.options).forEach(function (opt) {
        if (opt.value === "VALE_SALIDA") opt.remove();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeValesUi);
  } else {
    removeValesUi();
  }
})();
