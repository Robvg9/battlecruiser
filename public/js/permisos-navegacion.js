// BattleCruiser — permisos-navegacion.js (v9.2.47)
// Capa ÚNICA de visibilidad de secciones: tienePermiso(seccion, "ver").
// No consulta permisos por otra vía. No toca backend.
(function () {
  'use strict';

  // Mapa canónico TAB (data-tab) → sección de permisos backend.
  // Solo secciones que existen en la matriz real (SECCIONES_PERMISOS / B3).
  // Tabs sin sección de negocio (resumen, pendientes) = visibles si hay sesión.
  var TAB_A_SECCION_CANONICO = {
    productos: 'productos',
    ventas: 'ventas',
    almacenes: 'almacenes',
    transferencias: 'transferencias',
    vales: 'vales_salida',
    reportes: 'reportes',
    inventario: 'reportes',
    movimientos: 'reportes',
    turnos: 'turnos',
    ciclos: 'ciclos',
    operacion: 'turnos',
    comunicacion: 'comunicacion',
    mando: 'auditoria',
    usuarios: 'usuarios'
  };

  window.TAB_A_SECCION = TAB_A_SECCION_CANONICO;
  try { TAB_A_SECCION = TAB_A_SECCION_CANONICO; } catch (_) {}

  function seccionDeTab(tab) {
    if (!tab) return null;
    if (tab === 'turnos') {
      var ciclosBtn = document.querySelector('.tab-btn[data-tab="ciclos"]');
      if (ciclosBtn) tab = 'ciclos';
    }
    return TAB_A_SECCION_CANONICO[tab] || null;
  }

  function tabEsSiempreVisible(tab) {
    return tab === 'resumen' || tab === 'pendientes';
  }

  function puedeVerTab(tab) {
    if (!tab) return false;
    if (typeof _usuarioActual === 'undefined' || !_usuarioActual) return false;
    if (tabEsSiempreVisible(tab)) return true;
    var sec = seccionDeTab(tab);
    if (!sec) return false;
    if (typeof tienePermiso !== 'function') return false;
    return !!tienePermiso(sec, 'ver');
  }

  function aplicarVisibilidadTabs() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(function (btn) {
      var tab = btn.dataset.tab;
      if (tab === 'config') {
        btn.classList.add('hidden');
        btn.style.display = 'none';
        btn.setAttribute('aria-hidden', 'true');
        return;
      }
      var ok = puedeVerTab(tab);
      btn.classList.toggle('hidden', !ok);
      btn.style.display = ok ? '' : 'none';
      if (!ok) {
        btn.classList.remove('active');
        btn.setAttribute('aria-hidden', 'true');
        btn.tabIndex = -1;
      } else {
        btn.removeAttribute('aria-hidden');
        btn.tabIndex = 0;
      }
    });

    var activo = document.querySelector('.tab-btn.active:not(.hidden)');
    if (!activo) {
      var candidato = document.querySelector('.tab-btn[data-tab="resumen"]:not(.hidden)') ||
        document.querySelector('.tab-btn:not(.hidden)');
      if (candidato && typeof irATab === 'function') {
        try { irATab(candidato.dataset.tab); } catch (_) {}
      }
    }
  }

  function guardarIrATab() {
    if (typeof window.irATab !== 'function') return;
    if (window.irATab.__bcPermGuard) return;
    var original = window.irATab;
    function guarded(tab) {
      if (!tab) return;
      if (tab === 'turnos') {
        var ciclosBtn = document.querySelector('.tab-btn[data-tab="ciclos"]');
        if (ciclosBtn) tab = 'ciclos';
      }
      if (!puedeVerTab(tab)) {
        console.warn('[BattleCruiser] Acceso denegado a pestaña:', tab);
        var msg = document.getElementById('msg-permiso-nav');
        if (!msg) {
          msg = document.createElement('p');
          msg.id = 'msg-permiso-nav';
          msg.className = 'msg';
          msg.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;background:#1a2e28;color:#f5e2ac;padding:10px 16px;border-radius:8px;border:1px solid #c9a24d55;';
          document.body.appendChild(msg);
        }
        msg.textContent = 'No tenés permiso para ver esa sección.';
        clearTimeout(msg._t);
        msg._t = setTimeout(function () { msg.textContent = ''; }, 2500);
        return;
      }
      return original(tab);
    }
    guarded.__bcPermGuard = true;
    window.irATab = guarded;
  }

  function guardarClicksTabs() {
    var nav = document.getElementById('tabs');
    if (!nav || nav.dataset.bcPermClick === '1') return;
    nav.dataset.bcPermClick = '1';
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn || !btn.dataset.tab) return;
      if (!puedeVerTab(btn.dataset.tab)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        console.warn('[BattleCruiser] Click bloqueado en pestaña sin ver:', btn.dataset.tab);
      }
    }, true);
  }

  function engancharAplicarPermisos() {
    if (typeof window.aplicarPermisosAInterfaz !== 'function') return;
    if (window.aplicarPermisosAInterfaz.__bcVis) return;
    var prev = window.aplicarPermisosAInterfaz;
    function wrapped() {
      prev();
      aplicarVisibilidadTabs();
      if (typeof togglePorPermiso === 'function') {
        togglePorPermiso('form-categoria', 'categorias', 'crear');
        togglePorPermiso('form-unidad', 'unidades', 'crear');
        togglePorPermiso('form-compra', 'stock', 'crear');
        if (typeof tienePermiso === 'function' && !tienePermiso('stock', 'crear')) {
          togglePorPermiso('form-compra', 'productos', 'crear');
        }
      }
    }
    wrapped.__bcVis = true;
    window.aplicarPermisosAInterfaz = wrapped;
    try { aplicarPermisosAInterfaz = wrapped; } catch (_) {}
  }

  function reforzarTienePermiso() {
    if (typeof window.tienePermiso !== 'function') return;
    if (window.tienePermiso.__bcStrict) return;
    var prev = window.tienePermiso;
    function strict(seccion, accion) {
      if (typeof _usuarioActual === 'undefined' || !_usuarioActual) return false;
      if (typeof _permisosCargaExitosa !== 'undefined' && !_permisosCargaExitosa) {
        if (typeof _permisosCargaFallidaRed !== 'undefined' && _permisosCargaFallidaRed) return false;
        if (Object.keys(typeof _permisosEfectivos !== 'undefined' ? _permisosEfectivos : {}).length === 0) {
          return false;
        }
      }
      return prev(seccion, accion);
    }
    strict.__bcStrict = true;
    window.tienePermiso = strict;
    try { tienePermiso = strict; } catch (_) {}
  }

  function boot() {
    reforzarTienePermiso();
    engancharAplicarPermisos();
    guardarIrATab();
    guardarClicksTabs();
    aplicarVisibilidadTabs();
  }

  window.__bcPuedeVerTab = puedeVerTab;
  window.__bcAplicarVisibilidadTabs = aplicarVisibilidadTabs;
  window.__bcTAB_A_SECCION = TAB_A_SECCION_CANONICO;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 0);
      setTimeout(boot, 400);
      setTimeout(boot, 1500);
    });
  } else {
    setTimeout(boot, 0);
    setTimeout(boot, 400);
    setTimeout(boot, 1500);
  }
})();
