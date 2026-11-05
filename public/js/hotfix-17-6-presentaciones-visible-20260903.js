// BattleCruiser — 17.6: compatibilidad heredada del catálogo único de Presentaciones.
(function () {
  'use strict';
  if (window.__BC176) return;
  window.__BC176 = true;

  // El panel se monta en Administración y presentaciones.js gobierna sus permisos.
  // Este módulo ya no crea anclas, ni fuerza formularios visibles, ni abre una ruta paralela.
  function verify() {
    var panel = document.querySelector('#tab-config .presentaciones-panel');
    var create = document.getElementById('form-presentacion-nueva');
    var assign = document.getElementById('form-pp-nueva');
    return {
      panel: !!(panel && getComputedStyle(panel).display !== 'none'),
      createPermission: !!(create && !create.classList.contains('hidden')),
      assignmentPermissionAndProduct: !!(assign && !assign.classList.contains('hidden'))
    };
  }

  window.__BC176_verify = verify;
})();