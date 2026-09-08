"use strict";
const fs = require("fs");
const path = require("path");

const MODULOS_APP = [
  "core.js", "auth.js", "offline.js", "centro-control.js", "navegacion.js", "productos.js", "presentaciones.js", "almacenes.js",
  "transferencias.js", "vales.js", "ventas.js", "catalogos.js", "configuracion.js", "usuarios-permisos.js", "mando.js", "reportes.js",
  "nucleo-operativo.js", "operacion-humana.js", "comunicacion.js",
];

function obtenerModulosProduccion(baseDir) {
  const appPath = path.join(baseDir, "..", "public", "app.js");
  const appSource = fs.readFileSync(appPath, "utf8");
  const dinamicos = [...appSource.matchAll(/\[\s*["']([^"']+\.js)["']\s*,/g)].map((m) => m[1]);
  const candidatos = [...new Set([...MODULOS_APP, ...dinamicos])];
  const jsDir = path.join(baseDir, "..", "public", "js");
  return candidatos.filter((nombre) => fs.existsSync(path.join(jsDir, nombre)));
}

function leerAppJsConcatenado(baseDir) {
  const appPath = path.join(baseDir, "..", "public", "app.js");
  const appSource = fs.readFileSync(appPath, "utf8");
  const versionMatch = appSource.match(/const VERSION="([^"]+)"/);
  const version = versionMatch ? versionMatch[1] : "unknown";
  const modulos = obtenerModulosProduccion(baseDir);
  let source = modulos.map((nombre) => fs.readFileSync(path.join(baseDir, "..", "public", "js", nombre), "utf8")).join("\n");

  // B2.3 uses a special mock client (__rpcResult) and manually controls the
  // visible shell. Prevent only that harness from running the real auth boot,
  // which otherwise starts asynchronous UI refreshes against a partial DOM.
  // B3 uses a different mock and keeps the normal auth boot path untouched.
  source = source
    .replace(/function showApp\(session\) \{/, "function showApp(session) { if (window.__BC_B23_TEST_MODE__) return;")
    .replace(/function showLogin\(\) \{/, "function showLogin() { if (window.__BC_B23_TEST_MODE__) { _bcAuthBootResolved = true; return; }");

  const prelude = `
;(function __bcTestBootPrelude(){
  window.__BC_VERSION__ = ${JSON.stringify(version)};
  window.__BC_UI_READY_RESOLVED__ = false;
  window.__BC_UI_READY__ = new Promise(function(resolve){ window.__bcTestResolveUIReady = resolve; });
  try {
    var __bcTestClient = window.supabase && typeof window.supabase.createClient === "function"
      ? window.supabase.createClient()
      : null;
    window.__BC_B23_TEST_MODE__ = !!(__bcTestClient && __bcTestClient.__rpcResult);
  } catch (_) {
    window.__BC_B23_TEST_MODE__ = false;
  }
  if (typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame = function(cb){ return window.setTimeout(function(){ cb(Date.now()); }, 16); };
  }
  if (typeof window.cancelAnimationFrame !== "function") {
    window.cancelAnimationFrame = function(id){ window.clearTimeout(id); };
  }
  try {
    if (window.HTMLCanvasElement) {
      window.HTMLCanvasElement.prototype.getContext = function(){
        return {
          canvas: this,
          clearRect:function(){}, fillRect:function(){}, strokeRect:function(){},
          beginPath:function(){}, closePath:function(){}, moveTo:function(){}, lineTo:function(){},
          stroke:function(){}, fill:function(){}, arc:function(){}, rect:function(){},
          save:function(){}, restore:function(){}, translate:function(){}, rotate:function(){}, scale:function(){},
          fillText:function(){}, strokeText:function(){}, measureText:function(text){ return { width: String(text || "").length * 6 }; },
          setTransform:function(){}, resetTransform:function(){},
          setLineDash:function(){},
          createLinearGradient:function(){ return { addColorStop:function(){} }; },
          createPattern:function(){ return null; },
        };
      };
    }
  } catch (_) {}
})();
`;

  const bridge = `
;(function __bcTestCompatibilityBridge(){
  try {
    var testClient = null;
    try {
      if (window.supabase && typeof window.supabase.createClient === "function") testClient = window.supabase.createClient();
    } catch (_) {}

    if (testClient && testClient.__rpcResult) {
      try {
        if (!testClient.__bcB23RpcShim) {
          const originalRpc = testClient.rpc.bind(testClient);
          const perfil = [{ id: "u-test", nombre: "Test", activo: true, role_id: "r-test", rol: "Dueño" }];
          const permisoFilas = [
            ["productos","ver"],["productos","crear"],["productos","editar"],["productos","borrar"],
            ["stock","ver"],["stock","crear"],["stock","editar"],["stock","borrar"],
            ["compras","ver"],["compras","crear"],["compras","editar"],["compras","borrar"],
            ["ventas","ver"],["ventas","crear"],["ventas","editar"],["ventas","borrar"],
            ["transferencias","ver"],["transferencias","crear"],["transferencias","editar"],["transferencias","borrar"],
            ["vales","ver"],["vales","crear"],["vales","editar"],["vales","borrar"],
            ["almacenes","ver"],["almacenes","crear"],["almacenes","editar"],["almacenes","borrar"],
            ["reportes","ver"],["reportes","crear"],["reportes","editar"],["reportes","borrar"],
            ["turnos","ver"],["turnos","crear"],["turnos","editar"],["turnos","borrar"],
            ["usuarios","ver"],["usuarios","crear"],["usuarios","editar"],["usuarios","borrar"],
            ["auditoria","ver"],["auditoria","crear"],["auditoria","editar"],["auditoria","borrar"],
            ["comunicacion","ver"],["comunicacion","crear"],["comunicacion","editar"],["comunicacion","borrar"],
            ["gastos","ver"],["gastos","crear"],["gastos","editar"],["gastos","borrar"],
            ["mermas","ver"],["mermas","crear"],["mermas","editar"],["mermas","borrar"],
            ["reinversiones","ver"],["reinversiones","crear"],["reinversiones","editar"],["reinversiones","borrar"],
            ["responsabilidades","ver"],["responsabilidades","crear"],["responsabilidades","editar"],["responsabilidades","borrar"],
            ["incidencias","ver"],["incidencias","crear"],["incidencias","editar"],["incidencias","borrar"],
          ].map(([seccion, accion]) => ({ seccion, accion }));
          testClient.rpc = async function(nombre, params) {
            if (nombre === "perfil_usuario_actual") return { data: perfil, error: null };
            if (nombre === "permisos_usuario_actual") return { data: permisoFilas, error: null };
            if (nombre === "usuario_esta_activo") return { data: true, error: null };
            return originalRpc(nombre, params);
          };
          testClient.__bcB23RpcShim = true;
        }
      } catch (_) {}

      if (typeof _usuarioActualId !== "undefined") _usuarioActualId = "u-test";
      if (typeof _usuarioActual !== "undefined") _usuarioActual = { id:"u-test", nombre:"Test", activo:true, role_id:"r-test", rol:"Dueño" };
      if (typeof _permisosEfectivos !== "undefined") {
        _permisosEfectivos = {
          productos:{ver:true,crear:true,editar:true,borrar:true}, stock:{ver:true,crear:true,editar:true,borrar:true},
          compras:{ver:true,crear:true,editar:true,borrar:true}, ventas:{ver:true,crear:true,editar:true,borrar:true},
          transferencias:{ver:true,crear:true,editar:true,borrar:true}, vales:{ver:true,crear:true,editar:true,borrar:true},
          almacenes:{ver:true,crear:true,editar:true,borrar:true}, reportes:{ver:true,crear:true,editar:true,borrar:true},
          turnos:{ver:true,crear:true,editar:true,borrar:true}, usuarios:{ver:true,crear:true,editar:true,borrar:true},
          auditoria:{ver:true,crear:true,editar:true,borrar:true}, comunicacion:{ver:true,crear:true,editar:true,borrar:true},
          gastos:{ver:true,crear:true,editar:true,borrar:true}, mermas:{ver:true,crear:true,editar:true,borrar:true},
          reinversiones:{ver:true,crear:true,editar:true,borrar:true}, responsabilidades:{ver:true,crear:true,editar:true,borrar:true},
          incidencias:{ver:true,crear:true,editar:true,borrar:true}
        };
      }
      if (typeof _permisosCargaExitosa !== "undefined") _permisosCargaExitosa = true;
      if (typeof _permisosCargaFallidaRed !== "undefined") _permisosCargaFallidaRed = false;
      try { window.__bcTestClient = testClient; } catch (_) {}
    }

    if (typeof _usuarioActual !== "undefined") {
      const accessor = function(){ return _usuarioActual || null; };
      ["id","nombre","activo","role_id","rol","role","rol_nombre"].forEach((key) => {
        try { Object.defineProperty(accessor,key,{configurable:true,get:() => _usuarioActual && _usuarioActual[key]}); } catch (_) {}
      });
      window._usuarioActual = accessor;
      window.__bcTestUsuarioActualAccessor = accessor;
    }
    if (typeof _usuarioActualId !== "undefined") Object.defineProperty(window,"_usuarioActualId",{configurable:true,get:()=>_usuarioActualId,set:(value)=>{_usuarioActualId=value;}});
    if (typeof _permisosEfectivos !== "undefined") window._permisosEfectivosRef = function(){ return _permisosEfectivos; };
    if (typeof usuarioPuedeOperar !== "function") window.usuarioPuedeOperar = function(){ return !!(typeof _usuarioActual !== "undefined" && _usuarioActual && _usuarioActual.activo !== false); };

    var clientForShim = testClient;
    if (clientForShim && typeof clientForShim.from === "function" && !clientForShim.__bcTestBuilderShim) {
      const originalFrom = clientForShim.from.bind(clientForShim);
      const adaptarBuilder = (builder) => {
        if (!builder || typeof builder !== "object") return builder;
        ["eq","neq","gt","gte","lt","lte","in","is","not","like","ilike","match","or","filter","range"].forEach((metodo)=>{ if(typeof builder[metodo]!=="function") builder[metodo]=()=>builder; });
        ["select","order","limit","maybeSingle","single","insert","update","upsert","delete","csv"].forEach((metodo)=>{
          if(typeof builder[metodo]!=="function") return;
          const original=builder[metodo].bind(builder);
          builder[metodo]=(...args)=>adaptarBuilder(original(...args));
        });
        if (typeof builder.then !== "function") {
          builder.then = function(resolve, reject){
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          };
          builder.catch = function(reject){
            return Promise.resolve({ data: [], error: null }).catch(reject);
          };
          builder.finally = function(handler){
            return Promise.resolve({ data: [], error: null }).finally(handler);
          };
        }
        return builder;
      };
      clientForShim.from = (...args) => adaptarBuilder(originalFrom(...args));
      clientForShim.__bcTestBuilderShim = true;
    }

    if (typeof _usuarioActualId !== "undefined" && testClient && testClient.auth && typeof testClient.auth.getSession === "function") {
      Promise.resolve(testClient.auth.getSession()).then((res)=>{
        const sid=res&&res.data&&res.data.session&&res.data.session.user&&res.data.session.user.id;
        if(sid&&typeof _usuarioActualId!=="undefined"&&!_usuarioActualId) _usuarioActualId=sid;
      }).catch(()=>{});
    }

    if (typeof window.__bcTestResolveUIReady === "function") {
      window.__BC_UI_READY_RESOLVED__ = true;
      window.__bcTestResolveUIReady();
      window.__bcTestResolveUIReady = null;
    }

    // No auto-boot here. Individual tests decide when showApp() is required,
    // keeping harness setup deterministic and preventing asynchronous UI boot
    // from racing the behavior under test.
  } catch (e) {
    console.warn("[BattleCruiser test bridge]",e);
    try { window.__BC_UI_READY_RESOLVED__=true; if(typeof window.__bcTestResolveUIReady === "function") window.__bcTestResolveUIReady(); } catch (_) {}
  }
})();
`;

  const nombresFunciones = [...source.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m)=>m[1]);
  const exportaciones = [...new Set(nombresFunciones)].map((nombre)=>`try { if (typeof window[${JSON.stringify(nombre)}] !== "function") window[${JSON.stringify(nombre)}] = ${nombre}; } catch (_) {}`).join("\n");
  const exportBridge = `
;(function __bcTestExportFunctionBindings(){
  ${exportaciones}
})();
`;
  return prelude + source + "\n" + bridge + "\n" + exportBridge;
}

module.exports = { leerAppJsConcatenado, MODULOS_APP, obtenerModulosProduccion };