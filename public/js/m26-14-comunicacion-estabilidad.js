// BattleCruiser — M26.14: Comunicación UX estable + permisos offline
// NO reescribe comunicacion.js. NO toca Supabase/RLS/cola.
// Corrige causas raíz:
//  1) Input chat usable (CSS de contenedor real, sin overflow).
//  2) Ocultar Cerrar de la UX (no llama cerrar_conversacion).
//  3) Offline no debe vaciar permisos ni secciones.
(function () {
  "use strict";
  if (window.__bcM2614) return;
  window.__bcM2614 = true;

  var LOG = "[Battlecruiser][M26.14]";

  function log() {
    try {
      var a = Array.prototype.slice.call(arguments);
      a.unshift(LOG);
      console.log.apply(console, a);
    } catch (e) {}
  }

  function clonePerms(src) {
    var out = {};
    if (!src || typeof src !== "object") return out;
    Object.keys(src).forEach(function (sec) {
      out[sec] = {};
      var row = src[sec];
      if (row && typeof row === "object") {
        Object.keys(row).forEach(function (act) {
          out[sec][act] = row[act];
        });
      }
    });
    return out;
  }

  function saveSnapshot() {
    try {
      if (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa) {
        window.__bcPermisosSnapshot = {
          efectivos: clonePerms(typeof _permisosEfectivos !== "undefined" ? _permisosEfectivos : {}),
          exitosa: true,
          usuario: typeof _usuarioActual !== "undefined" && _usuarioActual
            ? {
                id: _usuarioActual.id,
                nombre: _usuarioActual.nombre,
                activo: _usuarioActual.activo,
                role_id: _usuarioActual.role_id,
                rol: _usuarioActual.rol
              }
            : null
        };
      }
    } catch (e) {}
  }

  function restoreSnapshot(reason) {
    var snap = window.__bcPermisosSnapshot;
    if (!snap || !snap.exitosa) return false;
    try {
      if (typeof _permisosEfectivos !== "undefined") {
        _permisosEfectivos = clonePerms(snap.efectivos);
      }
      if (typeof _permisosCargaExitosa !== "undefined") {
        _permisosCargaExitosa = true;
      }
      if (typeof _permisosCargaFallidaRed !== "undefined") {
        _permisosCargaFallidaRed = true;
      }
      if (snap.usuario && typeof _usuarioActual !== "undefined") {
        if (!_usuarioActual || !_usuarioActual.id) {
          _usuarioActual = snap.usuario;
        }
      }
      log("permisos restaurados desde snapshot:", reason);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---- UX: input + ocultar Cerrar ---- */
  function injectCss() {
    if (document.getElementById("bc-m2614-css")) return;
    var s = document.createElement("style");
    s.id = "bc-m2614-css";
    s.textContent = [
      /* Contenedor chat: sin desborde horizontal, flex vertical real */
      "#tab-comunicacion .com-layout{",
      "  width:100%;max-width:100%;overflow:hidden;box-sizing:border-box;",
      "}",
      "#tab-comunicacion .com-col-chat{",
      "  display:flex!important;flex-direction:column!important;",
      "  width:100%!important;max-width:100%!important;",
      "  min-width:0!important;box-sizing:border-box!important;",
      "  overflow:hidden!important;",
      "  min-height:min(68vh,680px);",
      "  padding-bottom:4px;",
      "}",
      "#tab-comunicacion .com-chat-header{",
      "  flex:0 0 auto;min-width:0;max-width:100%;box-sizing:border-box;",
      "}",
      "#tab-comunicacion .com-mensajes{",
      "  flex:1 1 auto!important;min-height:160px;min-width:0;",
      "  max-width:100%;overflow-x:hidden;overflow-y:auto;",
      "  -webkit-overflow-scrolling:touch;box-sizing:border-box;",
      "}",
      /* Barra de escritura WhatsApp-like, dentro del panel */
      "#tab-comunicacion #form-mensaje,",
      "#tab-comunicacion .com-input-bar{",
      "  display:flex!important;flex-direction:row!important;",
      "  align-items:stretch!important;gap:10px!important;",
      "  flex:0 0 auto!important;width:100%!important;max-width:100%!important;",
      "  min-width:0!important;box-sizing:border-box!important;",
      "  margin:10px 0 0 0!important;padding:12px!important;",
      "  border-radius:16px!important;",
      "  background:var(--void,#0e1614)!important;",
      "  border:1px solid rgba(201,162,77,.4)!important;",
      "  overflow:visible!important;",
      "}",
      "#tab-comunicacion #mensaje-input{",
      "  flex:1 1 auto!important;min-width:0!important;width:auto!important;",
      "  max-width:100%!important;box-sizing:border-box!important;",
      "  min-height:48px!important;height:48px!important;",
      "  padding:12px 14px!important;margin:0!important;",
      "  font-size:16px!important;line-height:1.35!important;",
      "  color:var(--text,#f2efe6)!important;",
      "  background:rgba(255,255,255,.06)!important;",
      "  border:1px solid rgba(201,162,77,.28)!important;",
      "  border-radius:12px!important;outline:none!important;",
      "}",
      "#tab-comunicacion #mensaje-input:focus{",
      "  border-color:rgba(201,162,77,.6)!important;",
      "}",
      "#tab-comunicacion #form-mensaje button[type=submit]{",
      "  flex:0 0 auto!important;flex-shrink:0!important;",
      "  min-width:88px!important;min-height:48px!important;",
      "  padding:12px 16px!important;border-radius:12px!important;",
      "  font-size:14px!important;font-weight:600!important;",
      "  white-space:nowrap!important;box-sizing:border-box!important;",
      "}",
      "#tab-comunicacion #msg-mensaje{max-width:100%;box-sizing:border-box;}",
      "#tab-comunicacion #msg-mensaje:empty{display:none!important;}",
      /* Eliminar Cerrar de la UX normal */
      "#tab-comunicacion #com-cerrar-btn{",
      "  display:none!important;visibility:hidden!important;",
      "  pointer-events:none!important;width:0!important;height:0!important;",
      "  overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;",
      "}",
      "@media(max-width:768px){",
      "  #tab-comunicacion .com-col-chat{min-height:calc(100dvh - 150px);}",
      "  #tab-comunicacion #mensaje-input{font-size:16px!important;}",
      "}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function hideCerrar() {
    var btn = document.getElementById("com-cerrar-btn");
    if (!btn) return;
    btn.classList.add("hidden");
    btn.style.display = "none";
    btn.setAttribute("aria-hidden", "true");
    btn.disabled = true;
    // Neutralizar clicks residuales sin tocar la RPC backend
    if (!btn.dataset.bcM2614) {
      btn.dataset.bcM2614 = "1";
      btn.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return false;
        },
        true
      );
    }
  }

  function enhanceInput() {
    var form = document.getElementById("form-mensaje");
    var input = document.getElementById("mensaje-input");
    if (form) {
      form.classList.add("com-input-bar");
      form.style.maxWidth = "100%";
      form.style.boxSizing = "border-box";
    }
    if (input) {
      input.setAttribute("placeholder", "Escribí un mensaje…");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("enterkeyhint", "send");
    }
    hideCerrar();
  }

  /* ---- Preservar permisos ante fallo de red ---- */
  function wrapCargarContexto() {
    if (typeof cargarContextoUsuario !== "function") return;
    if (cargarContextoUsuario.__bcM2614) return;
    var orig = cargarContextoUsuario;
    var wrapped = async function () {
      // Snapshot ANTES de que el original vacíe _permisosEfectivos
      var prevEfectivos = clonePerms(typeof _permisosEfectivos !== "undefined" ? _permisosEfectivos : {});
      var prevOk = typeof _permisosCargaExitosa !== "undefined" && !!_permisosCargaExitosa;
      var prevUser = null;
      try {
        if (typeof _usuarioActual !== "undefined" && _usuarioActual && _usuarioActual.id) {
          prevUser = {
            id: _usuarioActual.id,
            nombre: _usuarioActual.nombre,
            activo: _usuarioActual.activo,
            role_id: _usuarioActual.role_id,
            rol: _usuarioActual.rol
          };
        }
      } catch (e0) {}

      var result;
      try {
        result = await orig.apply(this, arguments);
      } catch (e) {
        result = undefined;
      }

      try {
        var offline =
          (typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado()) ||
          !navigator.onLine;
        var fallidaRed =
          (typeof _permisosCargaFallidaRed !== "undefined" && _permisosCargaFallidaRed) || offline;
        var sinExito =
          typeof _permisosCargaExitosa !== "undefined" && !_permisosCargaExitosa;

        if (sinExito && (fallidaRed || offline) && (prevOk || (window.__bcPermisosSnapshot && window.__bcPermisosSnapshot.exitosa))) {
          // Restaurar último estado válido — NO inventar permisos
          if (prevOk) {
            if (typeof _permisosEfectivos !== "undefined") _permisosEfectivos = prevEfectivos;
            if (typeof _permisosCargaExitosa !== "undefined") _permisosCargaExitosa = true;
            if (typeof _permisosCargaFallidaRed !== "undefined") _permisosCargaFallidaRed = true;
            if (prevUser && typeof _usuarioActual !== "undefined" && (!_usuarioActual || !_usuarioActual.id)) {
              _usuarioActual = prevUser;
            }
          } else {
            restoreSnapshot("cargarContexto falló offline");
          }
          if (typeof aplicarPermisosAInterfaz === "function") {
            try { aplicarPermisosAInterfaz(); } catch (e1) {}
          }
          if (typeof window.__bcGarantizarIntegridadShell === "function") {
            try {
              window.__bcGarantizarIntegridadShell(
                (typeof window.__bcUltimaTabActiva === "string" && window.__bcUltimaTabActiva) || "comunicacion"
              );
            } catch (e2) {}
          }
          log("contexto offline: permisos previos conservados");
        } else if (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa) {
          saveSnapshot();
        }
      } catch (e3) {
        log("post-cargar", e3);
      }
      return result;
    };
    wrapped.__bcM2614 = true;
    // preservar flags de módulos previos
    if (orig.__bcM263Timeout) wrapped.__bcM263Timeout = true;
    if (orig.__bcNav52) wrapped.__bcNav52 = true;
    if (orig.__bcPermitidoFix) wrapped.__bcPermitidoFix = true;
    window.cargarContextoUsuario = wrapped;
    try { cargarContextoUsuario = wrapped; } catch (e) {}
  }

  function wrapAplicarPermisos() {
    // Tras aplicar, si hay snapshot y carga falló por red, no dejar menú vacío
    if (typeof aplicarPermisosAInterfaz !== "function") return;
    if (aplicarPermisosAInterfaz.__bcM2614) return;
    var orig = aplicarPermisosAInterfaz;
    var wrapped = function () {
      try {
        var offline =
          (typeof estaRealmenteDesconectado === "function" && estaRealmenteDesconectado()) ||
          !navigator.onLine;
        var sinExito =
          typeof _permisosCargaExitosa !== "undefined" && !_permisosCargaExitosa;
        if (offline && sinExito) {
          restoreSnapshot("aplicarPermisos offline");
        }
      } catch (e0) {}
      var r = orig.apply(this, arguments);
      try {
        if (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa) {
          saveSnapshot();
        }
      } catch (e1) {}
      return r;
    };
    wrapped.__bcM2614 = true;
    window.aplicarPermisosAInterfaz = wrapped;
    try { aplicarPermisosAInterfaz = wrapped; } catch (e) {}
  }

  function wrapLimpiarContexto() {
    // Solo permitir clear total en logout real; si hay sesión operativa, no vaciar snapshot
    if (typeof limpiarContextoUsuario !== "function") return;
    if (limpiarContextoUsuario.__bcM2614) return;
    var orig = limpiarContextoUsuario;
    var wrapped = function () {
      var logout = !!window.__bcLogoutEnCurso;
      var shell = document.getElementById("app-shell");
      var shellVisible = shell && shell.classList.contains("visible");
      // Si no es logout y el shell sigue visible con usuario, NO destruir snapshot
      if (!logout && shellVisible) {
        try {
          if (typeof _usuarioActual !== "undefined" && _usuarioActual && _usuarioActual.id) {
            saveSnapshot();
          }
        } catch (e0) {}
      }
      var r = orig.apply(this, arguments);
      if (!logout && shellVisible) {
        // Restaurar permisos si el clear fue espurio (p.ej. getSession offline)
        setTimeout(function () {
          try {
            var vacio =
              typeof _permisosCargaExitosa !== "undefined" && !_permisosCargaExitosa;
            if (vacio && restoreSnapshot("limpiarContexto espurio")) {
              if (typeof aplicarPermisosAInterfaz === "function") aplicarPermisosAInterfaz();
              if (typeof window.__bcGarantizarIntegridadShell === "function") {
                window.__bcGarantizarIntegridadShell(
                  (typeof window.__bcUltimaTabActiva === "string" && window.__bcUltimaTabActiva) || "comunicacion"
                );
              }
            }
          } catch (e1) {}
        }, 0);
      }
      return r;
    };
    wrapped.__bcM2614 = true;
    if (orig.__bcNav52) wrapped.__bcNav52 = true;
    window.limpiarContextoUsuario = wrapped;
    try { limpiarContextoUsuario = wrapped; } catch (e) {}
  }

  function onOnline() {
    // Al recuperar red, no forzar wipe; snapshot se actualiza en próxima carga ok
    setTimeout(function () {
      try {
        if (typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa) {
          saveSnapshot();
        }
      } catch (e) {}
    }, 500);
  }

  function boot() {
    injectCss();
    enhanceInput();
    wrapCargarContexto();
    wrapAplicarPermisos();
    wrapLimpiarContexto();
    saveSnapshot();
    window.addEventListener("online", onOnline);
    // Re-aplicar CSS/Cerrar si el DOM de chat se re-renderiza
    setInterval(function () {
      try {
        hideCerrar();
      } catch (e) {}
    }, 3000);
    log("módulo cargado");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(boot, 200);
      setTimeout(boot, 1000);
    });
  } else {
    setTimeout(boot, 200);
    setTimeout(boot, 1000);
  }
})();
