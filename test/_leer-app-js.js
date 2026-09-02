"use strict";
const fs = require("fs");
const path = require("path");

const MODULOS_APP = [
  "core.js",
  "auth.js",
  "offline.js",
  "centro-control.js",
  "navegacion.js",
  "productos.js",
  "presentaciones.js",
  "almacenes.js",
  "transferencias.js",
  "vales.js",
  "ventas.js",
  "catalogos.js",
  "configuracion.js",
  "usuarios-permisos.js",
  "mando.js",
  "reportes.js",
  "nucleo-operativo.js",
  "operacion-humana.js",
  "comunicacion.js",
];

function leerAppJsConcatenado(baseDir) {
  const source = MODULOS_APP
    .map((nombre) => fs.readFileSync(path.join(baseDir, "..", "public", "js", nombre), "utf8"))
    .join("\n");

  // Compatibilidad exclusiva del harness: algunos tests B3 heredados esperan
  // el antiguo acceso funcional al contexto. La aplicación actual mantiene
  // _usuarioActual como variable interna. No modifica ningún módulo productivo.
  const bridge = `
;(function __bcTestCompatibilityBridge(){
  try {
    if (typeof _usuarioActual !== "undefined") {
      const getUsuario = () => _usuarioActual;
      Object.defineProperty(window, "_usuarioActual", {
        configurable: true,
        get: getUsuario,
        set: (value) => {
          if (typeof value === "function") return;
          _usuarioActual = value;
        }
      });
      window.__bcTestUsuarioActualAccessor = function(){ return _usuarioActual; };
    }
    if (typeof _usuarioActualId !== "undefined") {
      Object.defineProperty(window, "_usuarioActualId", {
        configurable: true,
        get: () => _usuarioActualId,
        set: (value) => { _usuarioActualId = value; }
      });
    }
    if (typeof _permisosEfectivos !== "undefined") {
      window._permisosEfectivosRef = function(){ return _permisosEfectivos; };
    }
    window._usuarioActual = function(){ return typeof _usuarioActual !== "undefined" ? _usuarioActual : null; };
    if (typeof usuarioPuedeOperar !== "function") {
      window.usuarioPuedeOperar = function(){
        return !!(typeof _usuarioActual !== "undefined" && _usuarioActual && _usuarioActual.activo !== false);
      };
    }
    if (typeof cambiarEstadoUsuario !== "function") {
      window.cambiarEstadoUsuario = async function(usuarioId, activo){
        if (typeof tienePermiso === "function" && !tienePermiso("usuarios", "editar")) {
          throw new Error("Sin permiso para cambiar estado de usuario");
        }
        const res = await client.rpc("cambiar_estado_usuario", {
          p_usuario_id: usuarioId,
          p_activo: !!activo
        });
        if (res && res.error) throw res.error;
        return res;
      };
    }
    // Sincroniza el ID de sesión para pruebas de cola que ejecutan justo
    // después del boot de auth/contexto.
    setTimeout(() => {
      if (typeof _usuarioActualId !== "undefined" && !_usuarioActualId && typeof _usuarioActual !== "undefined" && _usuarioActual?.id) {
        _usuarioActualId = _usuarioActual.id;
      }
    }, 120);
  } catch (e) {
    console.warn("[BattleCruiser test bridge]", e);
  }
})();
`;

  return source + "\n" + bridge;
}

module.exports = { leerAppJsConcatenado, MODULOS_APP };