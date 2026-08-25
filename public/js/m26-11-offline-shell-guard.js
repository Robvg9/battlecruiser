// BattleCruiser — M26.11-FE: estabilización crítica post-venta offline
// Problema real: tras venta offline (ok + offline=true, "1 pendiente") la UI
// quedaba sin secciones (0 tab-btn.active / 0 tab-panel.visible).
//
// Causas defensivas cubiertas:
// 1) Acciones secundarias post-guardado (render catálogo, stock UI, contador)
//    sin aislar → excepción secundaria deja el shell inconsistente.
// 2) sesion-navegacion-reset + cargarContextoUsuario: doReset() quita TODAS
//    las tabs; si luego falla carga de permisos offline, el menú queda vacío.
// 3) limpiarContextoUsuario() no debe dispararse por fallos transitorios de red
//    cuando ya hay usuario autenticado en memoria.
//
// NO toca Supabase. NO crea segunda cola ni segundo IndexedDB.
// Reutiliza: ejecutarOperacion, actualizarContadorColaPendiente, ventaLineas.
(function () {
  "use strict";

  var FLAG = "__bcM2611";
  var LOG = "[Battlecruiser][M26.11]";

  function logWarn() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG);
      console.warn.apply(console, args);
    } catch (e) {}
  }

  function logErr() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG);
      console.error.apply(console, args);
    } catch (e) {}
  }

  /* ---------- Fail-safe: integridad de navegación ---------- */
  function shellVisibleYAutenticado() {
    var shell = document.getElementById("app-shell");
    if (!shell || !shell.classList.contains("visible")) return false;
    try {
      if (typeof _usuarioActualId !== "undefined" && _usuarioActualId) return true;
      if (typeof _bcSesionActivaId !== "undefined" && _bcSesionActivaId) return true;
      if (typeof _usuarioActual !== "undefined" && _usuarioActual && _usuarioActual.id) return true;
    } catch (e) {}
    return false;
  }

  function navegacionCorrupta() {
    if (!shellVisibleYAutenticado()) return false;
    var activos = document.querySelectorAll(".tab-btn.active");
    var visibles = document.querySelectorAll(".tab-panel.visible");
    if (activos.length === 0 || visibles.length === 0) return true;
    // Todos los botones ocultos = menú vacío (síntoma reportado)
    var btns = document.querySelectorAll(".tab-btn[data-tab]");
    var algunoVisible = false;
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (
        !b.classList.contains("hidden") &&
        !b.classList.contains("tab-sin-permiso") &&
        b.style.display !== "none" &&
        b.getAttribute("data-bc-permiso") !== "0"
      ) {
        algunoVisible = true;
        break;
      }
    }
    // Si hay permisos cargados y ningún botón usable → corrupto
    try {
      if (
        typeof _permisosCargaExitosa !== "undefined" &&
        _permisosCargaExitosa &&
        !algunoVisible
      ) {
        return true;
      }
    } catch (e2) {}
    return activos.length === 0 || visibles.length === 0;
  }

  function tabPermitido(btn) {
    if (!btn) return false;
    if (btn.classList.contains("hidden") || btn.classList.contains("tab-sin-permiso")) return false;
    if (btn.style.display === "none") return false;
    if (btn.getAttribute("data-bc-permiso") === "0") return false;
    return true;
  }

  function restaurarNavegacionSegura(preferTab) {
    try {
      if (typeof aplicarPermisosAInterfaz === "function") {
        try {
          aplicarPermisosAInterfaz();
        } catch (ePerm) {
          logWarn("aplicarPermisosAInterfaz en fail-safe", ePerm);
        }
      }

      var prefer =
        preferTab ||
        (window.__bcUltimaTabActiva ? String(window.__bcUltimaTabActiva) : "") ||
        "ventas";

      var candidatos = [prefer, "ventas", "resumen", "productos", "almacenes", "ciclos", "pendientes"];
      var elegido = null;
      for (var i = 0; i < candidatos.length; i++) {
        var btn = document.querySelector('.tab-btn[data-tab="' + candidatos[i] + '"]');
        if (btn && tabPermitido(btn)) {
          elegido = candidatos[i];
          break;
        }
      }
      if (!elegido) {
        var all = document.querySelectorAll(".tab-btn[data-tab]");
        for (var j = 0; j < all.length; j++) {
          if (tabPermitido(all[j])) {
            elegido = all[j].dataset.tab;
            break;
          }
        }
      }

      // Si aún no hay botones permitidos pero hay sesión: mostrar al menos ventas/resumen
      // sin tocar permisos (solo recuperación visual de shell vacío).
      if (!elegido) {
        var fallbacks = ["ventas", "resumen", "productos"];
        for (var k = 0; k < fallbacks.length; k++) {
          var fb = document.querySelector('.tab-btn[data-tab="' + fallbacks[k] + '"]');
          if (fb) {
            fb.classList.remove("hidden", "tab-sin-permiso");
            fb.style.removeProperty("display");
            fb.setAttribute("data-bc-permiso", "1");
            elegido = fallbacks[k];
            break;
          }
        }
      }

      if (!elegido) {
        logWarn("fail-safe: no se encontró tab restaurable");
        return false;
      }

      document.querySelectorAll(".tab-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.classList.remove("visible");
      });
      var btnAct = document.querySelector('.tab-btn[data-tab="' + elegido + '"]');
      var panel = document.getElementById("tab-" + elegido);
      if (btnAct) btnAct.classList.add("active");
      if (panel) panel.classList.add("visible");
      window.__bcUltimaTabActiva = elegido;
      logWarn("fail-safe: navegación restaurada →", elegido);
      return true;
    } catch (e) {
      logErr("fail-safe falló", e);
      return false;
    }
  }

  function garantizarIntegridadShell(preferTab) {
    try {
      if (!navegacionCorrupta()) return false;
      logWarn("estado corrupto detectado (sin tab activa/visible) — restaurando");
      return restaurarNavegacionSegura(preferTab);
    } catch (e) {
      logErr("garantizarIntegridadShell", e);
      return false;
    }
  }

  /* ---------- Recordar última tab (sin reset agresivo) ---------- */
  function wireRecordarTab() {
    if (document.documentElement.dataset[FLAG + "TabMem"] === "1") return;
    document.documentElement.dataset[FLAG + "TabMem"] = "1";
    var tabs = document.getElementById("tabs");
    if (!tabs) return;
    tabs.addEventListener(
      "click",
      function (e) {
        var btn = e.target.closest(".tab-btn[data-tab]");
        if (!btn || !tabPermitido(btn)) return;
        window.__bcUltimaTabActiva = btn.dataset.tab;
      },
      true
    );
  }

  /* ---------- Procesar éxito offline de venta (aislado) ---------- */
  function procesarExitoOfflineVenta(opts) {
    opts = opts || {};
    var total = opts.total;
    var btn = opts.btn;
    var textoOriginal = opts.textoOriginal || "Confirmar venta";

    // 1) Estado principal: carrito vacío + botón restaurado (crítico)
    try {
      if (btn) {
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    } catch (eBtn) {
      logWarn("restaurar botón", eBtn);
    }

    try {
      if (typeof ventaLineas !== "undefined") {
        ventaLineas = [];
      }
    } catch (eLineas) {
      logWarn("vaciar ventaLineas", eLineas);
    }

    try {
      if (typeof renderVentaLineas === "function") renderVentaLineas();
    } catch (eRender) {
      logWarn("renderVentaLineas", eRender);
    }

    // 2) Mensaje éxito offline
    try {
      var moneyTxt =
        typeof money === "function"
          ? money(total)
          : Number(total || 0).toFixed(2);
      var msg =
        "✓ Venta guardada localmente por $" +
        moneyTxt +
        ". Se sincronizará automáticamente al recuperar conexión.";
      if (typeof setMsg === "function") {
        setMsg("msg-venta", msg, true);
      } else {
        var el = document.getElementById("msg-venta");
        if (el) {
          el.textContent = msg;
          el.className = "msg ok";
        }
      }
      if (typeof setMsg === "function") setMsg("msg-venta-linea", "", true);
    } catch (eMsg) {
      logWarn("mensaje offline", eMsg);
    }

    // 3) Secundarias aisladas — NUNCA invalidan el éxito
    try {
      if (typeof actualizarContadorColaPendiente === "function") {
        Promise.resolve(actualizarContadorColaPendiente()).catch(function (e) {
          logWarn("actualizarContadorColaPendiente", e);
        });
      }
    } catch (eCnt) {
      logWarn("contador pendientes", eCnt);
    }

    try {
      if (typeof actualizarStockDisponibleUI === "function") {
        actualizarStockDisponibleUI();
      }
    } catch (eStock) {
      logWarn("actualizarStockDisponibleUI", eStock);
    }

    try {
      if (typeof renderCatalogoGrid === "function") {
        renderCatalogoGrid();
      }
    } catch (eCat) {
      logWarn("renderCatalogoGrid", eCat);
    }

    // 4) Garantizar shell intacto
    try {
      garantizarIntegridadShell(
        window.__bcUltimaTabActiva || "ventas"
      );
    } catch (eShell) {
      logErr("integridad post-offline", eShell);
    }
  }

  /* ---------- Patch m26-8 forzarRegistroVenta offline path (si existe en runtime) ----------
     No reescribimos el archivo: interceptamos el flujo tras ejecutarOperacion
     envolviendo ejecutarOperacion solo para tipo venta cuando ya hay handlers,
     y reforzamos el botón de confirmar.
  */
  function patchEjecutarOperacionVentaOffline() {
    if (typeof ejecutarOperacion !== "function") return;
    if (ejecutarOperacion[FLAG]) return;
    var orig = ejecutarOperacion;
    window.ejecutarOperacion = async function (tipo, payload) {
      var r = await orig.apply(this, arguments);
      // No procesamos aquí el éxito de venta: m26-8 / ventas.js lo hacen.
      // Solo marcamos flag para que wrappers sepan que la cola ya persistió.
      try {
        if (tipo === "venta" && r && r.ok && r.offline) {
          window.__bcUltimaVentaOfflineOk = {
            at: Date.now(),
            operacion: r.operacion || null,
          };
        }
      } catch (e) {}
      return r;
    };
    window.ejecutarOperacion[FLAG] = true;
  }

  /**
   * Envuelve el click de confirmar para asegurar que, tras ok+offline,
   * se ejecute procesarExitoOfflineVenta aunque el handler original falle
   * en acciones secundarias. No duplica el registro: solo post-proceso.
   */
  function wireConfirmPostOfflineGuard() {
    var btn = document.getElementById("btn-confirmar-venta");
    if (!btn || btn.dataset[FLAG + "Post"] === "1") return;
    btn.dataset[FLAG + "Post"] = "1";

    btn.addEventListener(
      "click",
      function () {
        // Tras el flujo async de confirmación, verificar integridad
        setTimeout(function () {
          try {
            var mark = window.__bcUltimaVentaOfflineOk;
            if (mark && Date.now() - mark.at < 8000) {
              // Asegurar carrito vacío y shell
              try {
                if (
                  typeof ventaLineas !== "undefined" &&
                  ventaLineas &&
                  ventaLineas.length > 0
                ) {
                  // Si el handler original no vació (falló a mitad), no vaciar
                  // ciegamente: solo si el mensaje indica éxito offline
                  var msgEl = document.getElementById("msg-venta");
                  var txt = (msgEl && msgEl.textContent) || "";
                  if (/guardada localmente|sincronizar/i.test(txt)) {
                    ventaLineas = [];
                    if (typeof renderVentaLineas === "function") renderVentaLineas();
                  }
                }
              } catch (e1) {}
              try {
                if (btn.disabled) {
                  btn.disabled = false;
                  if (/registrando|proces/i.test(btn.textContent || "")) {
                    btn.textContent = "Confirmar venta";
                  }
                }
              } catch (e2) {}
              garantizarIntegridadShell("ventas");
            } else {
              // Cualquier confirmación: si el shell quedó vacío, restaurar
              garantizarIntegridadShell(
                window.__bcUltimaTabActiva || "ventas"
              );
            }
          } catch (e) {
            logErr("post-confirm guard", e);
          }
        }, 900);
      },
      false
    );
  }

  /* ---------- Blindar cargarContextoUsuario: no limpiar por fallo de red ---------- */
  function patchCargarContextoUsuario() {
    if (typeof cargarContextoUsuario !== "function") return;
    if (cargarContextoUsuario[FLAG]) return;
    var orig = cargarContextoUsuario;
    window.cargarContextoUsuario = async function () {
      var teniaUsuario = false;
      var teniaPermisos = false;
      var ultimaTab = window.__bcUltimaTabActiva || null;
      try {
        teniaUsuario = !!(
          (typeof _usuarioActual !== "undefined" && _usuarioActual) ||
          (typeof _usuarioActualId !== "undefined" && _usuarioActualId)
        );
        teniaPermisos = !!(
          typeof _permisosCargaExitosa !== "undefined" && _permisosCargaExitosa
        );
      } catch (e0) {}

      var result;
      try {
        result = await orig.apply(this, arguments);
      } catch (e) {
        logWarn("cargarContextoUsuario excepción", e);
        result = undefined;
      }

      // Si ya había sesión operativa y tras la carga el shell quedó vacío → restaurar
      try {
        if (teniaUsuario && shellVisibleYAutenticado() && navegacionCorrupta()) {
          logWarn(
            "post-cargarContextoUsuario: navegación corrupta — restaurando (sin logout)"
          );
          if (teniaPermisos && typeof aplicarPermisosAInterfaz === "function") {
            try {
              aplicarPermisosAInterfaz();
            } catch (eP) {}
          }
          restaurarNavegacionSegura(ultimaTab || "ventas");
        }
      } catch (e2) {
        logErr("post-cargarContexto check", e2);
      }
      return result;
    };
    window.cargarContextoUsuario[FLAG] = true;
    try {
      cargarContextoUsuario = window.cargarContextoUsuario;
    } catch (e3) {}
  }

  /* ---------- Blindar limpiarContextoUsuario: no destruir shell por error de red ---------- */
  function patchLimpiarContextoUsuario() {
    if (typeof limpiarContextoUsuario !== "function") return;
    if (limpiarContextoUsuario[FLAG]) return;
    var orig = limpiarContextoUsuario;
    window.limpiarContextoUsuario = function () {
      // Si el caller es un fallo transitorio offline Y la shell está visible
      // con sesión, NO limpiar a menos que sea logout explícito.
      // Detectamos logout: app-shell sin visible o flag de logout.
      try {
        if (window.__bcLogoutEnCurso) {
          return orig.apply(this, arguments);
        }
        var shell = document.getElementById("app-shell");
        var shellOn = shell && shell.classList.contains("visible");
        var offlineAhora =
          typeof navigator !== "undefined" && navigator.onLine === false;
        var tieneSesionMem =
          (typeof _bcSesionActivaId !== "undefined" && _bcSesionActivaId) ||
          (typeof _usuarioActualId !== "undefined" && _usuarioActualId);

        // Guard: limpiar contexto con shell visible + offline + sesión mem
        // es casi siempre un falso positivo de getSession/red.
        if (shellOn && offlineAhora && tieneSesionMem) {
          logWarn(
            "limpiarContextoUsuario BLOQUEADO (shell visible + offline + sesión en memoria). " +
              "No se destruye navegación por fallo de red."
          );
          return;
        }
      } catch (e) {
        logWarn("guard limpiarContextoUsuario", e);
      }
      return orig.apply(this, arguments);
    };
    window.limpiarContextoUsuario[FLAG] = true;
    try {
      limpiarContextoUsuario = window.limpiarContextoUsuario;
    } catch (e2) {}
  }

  /* ---------- sesion-navegacion-reset: no doReset en re-carga de mismo usuario ---------- */
  function patchSesionNavResetBehavior() {
    // El módulo original envuelve cargarContextoUsuario con doReset() al inicio.
    // Eso deja 0 tabs activas hasta que aplicarPermisos termine; offline puede
    // quedar a medias. Re-envolvemos para que doReset solo ocurra si cambió
    // el id de sesión o es login fresco.
    if (typeof cargarContextoUsuario !== "function") return;
    if (cargarContextoUsuario.__bcM2611Nav) return;

    var current = cargarContextoUsuario;
    var wrapped = async function () {
      var prevId = null;
      try {
        prevId =
          (typeof _bcSesionActivaId !== "undefined" && _bcSesionActivaId) ||
          (typeof _usuarioActualId !== "undefined" && _usuarioActualId) ||
          null;
      } catch (e) {}

      // Si ya hay shell + usuario, NO quitar tabs antes de recargar contexto
      var skipHardReset = false;
      try {
        var shell = document.getElementById("app-shell");
        if (
          shell &&
          shell.classList.contains("visible") &&
          prevId &&
          (typeof _permisosCargaExitosa !== "undefined" ? _permisosCargaExitosa : false)
        ) {
          skipHardReset = true;
        }
      } catch (e2) {}

      if (skipHardReset) {
        // Evitar que un wrapper anterior (sesion-navegacion-reset) deje el shell vacío:
        // guardamos estado de tab y lo restauramos si hace falta.
        var tabAntes = window.__bcUltimaTabActiva;
        var r = await current.apply(this, arguments);
        setTimeout(function () {
          garantizarIntegridadShell(tabAntes || "ventas");
        }, 0);
        return r;
      }
      return current.apply(this, arguments);
    };
    wrapped.__bcM2611Nav = true;
    wrapped[FLAG] = current[FLAG];
    window.cargarContextoUsuario = wrapped;
    try {
      cargarContextoUsuario = wrapped;
    } catch (e3) {}
  }

  /* ---------- Marcar logout explícito ---------- */
  function wireLogoutFlag() {
    if (document.documentElement.dataset[FLAG + "Logout"] === "1") return;
    document.documentElement.dataset[FLAG + "Logout"] = "1";
    var btn = document.getElementById("logout-btn");
    if (!btn) return;
    btn.addEventListener(
      "click",
      function () {
        window.__bcLogoutEnCurso = true;
        setTimeout(function () {
          window.__bcLogoutEnCurso = false;
        }, 5000);
      },
      true
    );
  }

  /* ---------- Watchdog periódico ligero (solo si corrupto) ---------- */
  function startWatchdog() {
    if (window[FLAG + "Watch"]) return;
    window[FLAG + "Watch"] = true;
    setInterval(function () {
      try {
        if (navegacionCorrupta()) {
          garantizarIntegridadShell(window.__bcUltimaTabActiva || "ventas");
        }
      } catch (e) {}
    }, 2500);
  }

  /* ---------- Exponer API para m26-8 si se invoca manualmente ---------- */
  window.procesarExitoOfflineVenta = procesarExitoOfflineVenta;
  window.__bcGarantizarIntegridadShell = garantizarIntegridadShell;

  function boot() {
    wireRecordarTab();
    wireLogoutFlag();
    patchLimpiarContextoUsuario();
    patchCargarContextoUsuario();
    patchSesionNavResetBehavior();
    patchEjecutarOperacionVentaOffline();
    wireConfirmPostOfflineGuard();
    startWatchdog();
    // Si al bootear ya está corrupto (raro), reparar
    setTimeout(function () {
      garantizarIntegridadShell(window.__bcUltimaTabActiva || null);
    }, 1200);
  }

  function start() {
    boot();
    var n = 0;
    var t = setInterval(function () {
      n++;
      patchLimpiarContextoUsuario();
      patchCargarContextoUsuario();
      patchSesionNavResetBehavior();
      patchEjecutarOperacionVentaOffline();
      wireConfirmPostOfflineGuard();
      wireRecordarTab();
      wireLogoutFlag();
      if (n >= 30) clearInterval(t);
    }, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(start, 650);
    });
  } else {
    setTimeout(start, 650);
  }
})();
