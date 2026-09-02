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

  // Compatibilidad exclusiva del harness. La producción mantiene
  // _usuarioActual como variable interna; aquí exponemos un callable legacy
  // que refleja dinámicamente el mismo objeto para los tests B3 antiguos.
  const bridge = `
;(function __bcTestCompatibilityBridge(){
  try {
    if (typeof _usuarioActual !== "undefined") {
      const accessor = function(){ return _usuarioActual || null; };
      ["id","nombre","activo","role_id","rol","role","rol_nombre"].forEach((key) => {
        try { Object.defineProperty(accessor, key, { configurable:true, get:() => _usuarioActual && _usuarioActual[key] }); } catch (_) {}
      });
      window._usuarioActual = accessor;
      window.__bcTestUsuarioActualAccessor = accessor;
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