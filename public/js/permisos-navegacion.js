// BattleCruiser — override canónico de navegación por permisos (v9.2.48)
// Se carga DESPUÉS de usuarios-permisos.js y ANTES de interacciones de usuario.
// Redefine SOLO: tienePermiso, TAB_A_SECCION, aplicarPermisosAInterfaz.
// No envuelve en capas, no captura clicks dejando botones visibles, no setTimeouts largos.
(function () {
  'use strict';

  function tienePermisoCanonico(seccion, accion) {
    if (typeof _usuarioActual === 'undefined' || !_usuarioActual) return false;
    if (typeof _permisosCargaExitosa === 'undefined' || !_permisosCargaExitosa) return false;
    if (typeof _permisosEfectivos === 'undefined') return false;
    var sec = _permisosEfectivos[seccion];
    return !!(sec && sec[accion]);
  }

  var TAB_CANONICO = {
    productos: 'productos',
    ventas: 'ventas',
    almacenes: 'almacenes',
    transferencias: 'transferencias',
    vales: 'vales_salida',
    usuarios: 'usuarios',
    mando: 'auditoria',
    reportes: 'reportes',
    inventario: 'reportes',
    movimientos: 'reportes',
    turnos: 'turnos',
    ciclos: 'ciclos',
    operacion: 'turnos',
    comunicacion: 'comunicacion'
  };

  function aplicarPermisosCanonico() {
    var loggedIn = !!(typeof _usuarioActual !== 'undefined' && _usuarioActual);
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      var tab = btn.dataset.tab;
      if (!tab) return;

      if (tab === 'config') {
        btn.classList.add('hidden');
        btn.style.display = 'none';
        btn.setAttribute('aria-hidden', 'true');
        return;
      }

      if (tab === 'resumen' || tab === 'pendientes') {
        var okHome = loggedIn;
        btn.classList.toggle('hidden', !okHome);
        btn.style.display = okHome ? '' : 'none';
        if (!okHome) btn.classList.remove('active');
        return;
      }

      var seccion = TAB_CANONICO[tab];
      if (!seccion) {
        btn.classList.add('hidden');
        btn.style.display = 'none';
        return;
      }

      var permitido = loggedIn && tienePermisoCanonico(seccion, 'ver');
      btn.classList.toggle('hidden', !permitido);
      btn.style.display = permitido ? '' : 'none';
      if (!permitido) {
        btn.classList.remove('active');
        btn.setAttribute('aria-hidden', 'true');
        btn.tabIndex = -1;
      } else {
        btn.removeAttribute('aria-hidden');
        btn.tabIndex = 0;
      }
    });

    function tog(id, sec, acc) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('hidden', !tienePermisoCanonico(sec, acc));
    }
    tog('form-producto', 'productos', 'crear');
    tog('form-compra', 'stock', 'crear');
    if (!tienePermisoCanonico('stock', 'crear')) tog('form-compra', 'productos', 'crear');
    tog('form-venta-linea', 'ventas', 'crear');
    tog('form-almacen', 'almacenes', 'crear');
    tog('form-transferencia', 'transferencias', 'crear');
    tog('form-vale', 'vales_salida', 'crear');
    tog('form-categoria', 'categorias', 'crear');
    tog('form-unidad', 'unidades', 'crear');
    tog('form-nuevo-usuario', 'usuarios', 'crear');

    var activo = document.querySelector('.tab-btn.active');
    if (activo && (activo.classList.contains('hidden') || activo.style.display === 'none')) {
      var home = document.querySelector('.tab-btn[data-tab="resumen"]');
      if (home && !home.classList.contains('hidden') && typeof irATab === 'function') {
        try { irATab('resumen'); } catch (e) {}
      }
    }
  }

  window.tienePermiso = tienePermisoCanonico;
  try { tienePermiso = tienePermisoCanonico; } catch (e) {}
  window.TAB_A_SECCION = TAB_CANONICO;
  try { TAB_A_SECCION = TAB_CANONICO; } catch (e) {}
  window.aplicarPermisosAInterfaz = aplicarPermisosCanonico;
  try { aplicarPermisosAInterfaz = aplicarPermisosCanonico; } catch (e) {}

  if (typeof _permisosCargaExitosa !== 'undefined' && _permisosCargaExitosa) {
    aplicarPermisosCanonico();
  }
})();
