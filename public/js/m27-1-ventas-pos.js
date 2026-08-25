// BattleCruiser — M27.1-FE RETIRADA
// Causa: reconfiguración periódica del DOM (setInterval) + wrappers sobre
// funciones globales → regresión del shell.
// NO activar. La capa 1 POS vive en m27-2-fe1-ventas-pos.js (v9.2.95).
(function () {
  "use strict";
  try {
    window.__BC_M271_POS__ = "disabled";
  } catch (e) {}
})();
