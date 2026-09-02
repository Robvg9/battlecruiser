// BattleCruiser — puente de compatibilidad de contexto 2026-09-02.
// No crea un segundo estado: expone funciones sobre las variables léxicas existentes.
(function () {
  'use strict';
  if (window.__BCContextoCompat20260902) return;
  window.__BCContextoCompat20260902 = true;
  window._usuarioActual = function () { return typeof _usuarioActual !== 'undefined' ? _usuarioActual : null; };
  window._permisosEfectivosRef = function () { return typeof _permisosEfectivos !== 'undefined' ? _permisosEfectivos : {}; };
  window._usuarioActualIdRef = function () { return typeof _usuarioActualId !== 'undefined' ? _usuarioActualId : null; };
  if (typeof usuarioPuedeOperar === 'function') window.usuarioPuedeOperar = usuarioPuedeOperar;
  if (typeof cambiarEstadoUsuario === 'function') window.cambiarEstadoUsuario = cambiarEstadoUsuario;
  if (typeof cargarContextoUsuario === 'function') window.cargarContextoUsuario = cargarContextoUsuario;
  if (typeof limpiarContextoUsuario === 'function') window.limpiarContextoUsuario = limpiarContextoUsuario;
  if (typeof tienePermiso === 'function') window.tienePermiso = tienePermiso;
})();
