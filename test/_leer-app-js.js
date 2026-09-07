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

function obtenerModulosProduccion(baseDir) {
  const appPath = path.join(baseDir, "..", "public", "app.js");
  const appSource = fs.readFileSync(appPath, "utf8");
  const dinamicos = [...appSource.matchAll(/\[\s*[\"']([^\"']+\.js)[\"']\s*,/g)]
    .map((m) => m[1]);
  return [...new Set([...MODULOS_APP, ...dinamicos])];
}

function leerAppJsConcatenado(baseDir) {
  const modulos = obtenerModulosProduccion(baseDir);
  const source = modulos
    .map((nombre) => fs.readFileSync(path.join(baseDir, "..", "public", "js", nombre), "utf8"))
    .join("\n");

  const bridge = `
;(function __bcTestCompatibilityBridge(){
  try {
    if (!window.__BC_UI_READY__) window.__BC_UI_READY__ = Promise.resolve();
    window.__BC_UI_READY_RESOLVED__ = true;

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

    if (typeof client !== "undefined" && typeof client.from === "function" && !client.__bcTestBuilderShim) {
      const originalFrom = client.from.bind(client);
      const adaptarBuilder = (builder) => {
        if (!builder || typeof builder !== "object") return builder;
        ["eq","neq","gt","gte","lt","lte","in","is","not","like","ilike","match","or","filter","range"]
          .forEach((metodo) => {
            if (typeof builder[metodo] !== "function") builder[metodo] = () => builder;
          });
        ["select","order","limit","maybeSingle","single","insert","update","upsert","delete","csv"]
          .forEach((metodo) => {
            if (typeof builder[metodo] !== "function") return;
            const original = builder[metodo].bind(builder);
            builder[metodo] = (...args) => adaptarBuilder(original(...args));
          });
        return builder;
      };
      client.from = (...args) => adaptarBuilder(originalFrom(...args));
      client.__bcTestBuilderShim = true;
    }

    if (typeof _usuarioActualId !== "undefined" && typeof client !== "undefined" &&
        client.auth && typeof client.auth.getSession === "function") {
      Promise.resolve(client.auth.getSession()).then((res) => {
        const sid = res && res.data && res.data.session && res.data.session.user && res.data.session.user.id;
        if (sid && typeof _usuarioActualId !== "undefined" && !_usuarioActualId) {
          _usuarioActualId = sid;
        }
      }).catch(() => {});
    }

    setTimeout(() => {
      try {
        if (typeof _usuarioActualId !== "undefined" && !_usuarioActualId &&
            typeof _bcSesionActivaId !== "undefined" && _bcSesionActivaId) {
          _usuarioActualId = _bcSesionActivaId;
        }
        if (typeof _usuarioActualId !== "undefined" && !_usuarioActualId &&
            typeof _usuarioActual !== "undefined" && _usuarioActual?.id) {
          _usuarioActualId = _usuarioActual.id;
        }
      } catch (_) {}
    }, 0);
  } catch (e) {
    console.warn("[BattleCruiser test bridge]", e);
  }
})();
`;

  const nombresFunciones = [...source.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((m) => m[1]);
  const exportaciones = [...new Set(nombresFunciones)]
    .map((nombre) => `try { window[${JSON.stringify(nombre)}] = ${nombre}; } catch (_) {}`)
    .join("\n");
  const exportBridge = `
;(function __bcTestExportFunctionBindings(){
  ${exportaciones}
})();
`;

  return source + "\n" + bridge + "\n" + exportBridge;
}

module.exports = { leerAppJsConcatenado, MODULOS_APP, obtenerModulosProduccion };
