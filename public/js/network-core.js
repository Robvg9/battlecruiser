// ==== BattleCruiser · js/network-core.js ====
// FASE 1 Offline Core — timeout de red central + consolidación de loading.
// P0-B residual: tras encolar offline, refrescar proyección UI abierta.
// Owner de loading: offline.js (loadingCount). Este módulo NO crea segundo contador.
// No duplica IndexedDB ni cola. Integra withNetworkTimeout en withCache / ejecutarOperacion / sondeo.
(function () {
  "use strict";

  var FLAG = "__bcNetworkCoreF1";
  if (window[FLAG]) return;
  window[FLAG] = true;

  /** Timeout por defecto para operaciones de red que afectan UX (ms). */
  var NETWORK_TIMEOUT_MS = 12000;
  window.BC_NETWORK_TIMEOUT_MS = NETWORK_TIMEOUT_MS;

  function crearErrorTimeout(label) {
    var err = new Error("NETWORK_TIMEOUT" + (label ? " (" + label + ")" : ""));
    err.code = "NETWORK_TIMEOUT";
    err.name = "NetworkTimeoutError";
    err.isNetworkTimeout = true;
    return err;
  }

  function esErrorTimeout(error) {
    if (!error) return false;
    if (error.isNetworkTimeout || error.code === "NETWORK_TIMEOUT") return true;
    var msg = String((error && (error.message || error.code || error.name)) || "").toLowerCase();
    return msg.indexOf("network_timeout") !== -1 || (msg.indexOf("timeout") !== -1 && msg.indexOf("network") !== -1);
  }

  async function withNetworkTimeout(promiseOrFn, timeoutMs, label) {
    var ms = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : NETWORK_TIMEOUT_MS;
    var promise = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
    var timedOut = false;
    var timer = null;
    var race = Promise.race([
      Promise.resolve(promise).then(function (v) {
        if (timedOut) {
          try {
            console.warn("[BattleCruiser] Red completó tras timeout abandonado", { label: label || null });
          } catch (e) {}
        }
        return v;
      }),
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          timedOut = true;
          reject(crearErrorTimeout(label || "network"));
        }, ms);
      }),
    ]);
    try {
      return await race;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  window.withNetworkTimeout = withNetworkTimeout;
  window.crearErrorTimeout = crearErrorTimeout;
  window.esErrorTimeout = esErrorTimeout;

  var esErrorDeRedBase = typeof window.esErrorDeRed === "function" ? window.esErrorDeRed : null;
  window.esErrorDeRed = function (error) {
    if (esErrorTimeout(error)) return true;
    if (esErrorDeRedBase) return esErrorDeRedBase(error);
    var msg = String((error && (error.message || error.code || error.name)) || error || "").toLowerCase();
    return (
      (typeof navigator !== "undefined" && !navigator.onLine) ||
      /failed to fetch|fetch failed|networkerror|network request failed|load failed|timeout|err_internet_disconnected|err_network|aborterror|network/.test(msg)
    );
  };

  if (typeof loadingCount !== "undefined") {
    window.__bcLoadingCount = function () {
      return loadingCount;
    };
  } else {
    window.__bcLoadingCount = function () {
      return 0;
    };
  }

  if (typeof showLoading === "function") window.showLoading = showLoading;
  if (typeof hideLoading === "function") window.hideLoading = hideLoading;
  if (typeof resetLoadingOverlay === "function") window.resetLoadingOverlay = resetLoadingOverlay;
  if (typeof withLoading === "function") window.withLoading = withLoading;

  /** P0-B: tras encolar, reflejar proyección en UIs abiertas (funciones existentes). */
  function refrescarProyeccionUiTrasOffline() {
    try {
      if (typeof actualizarContadorColaPendiente === "function") actualizarContadorColaPendiente();
      if (typeof actualizarStockDisponibleUI === "function") actualizarStockDisponibleUI();
      if (typeof renderCatalogoGrid === "function") renderCatalogoGrid();
      if (typeof actualizarStockTransferenciaUI === "function") actualizarStockTransferenciaUI();
      if (typeof window.__bcInventarioProyectado === "function") {
        var invEl = document.getElementById("inv-detalle");
        if (invEl) window.__bcInventarioProyectado();
      } else if (typeof refrescarInventario === "function") {
        var tabInv = document.getElementById("tab-inventario");
        if (tabInv && tabInv.classList.contains("visible")) refrescarInventario();
      }
    } catch (e) {
      try {
        console.warn("[BattleCruiser] P0-B refresh UI post-offline:", e);
      } catch (e2) {}
    }
  }
  window.__bcRefrescarProyeccionUiTrasOffline = refrescarProyeccionUiTrasOffline;

  if (typeof window.withCache === "function" && !window.withCache.__bcF1Timed) {
    window.withCache = async function (clave, consultaFn) {
      if (!navigator.onLine) {
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
        return typeof leerDeCache === "function" ? leerDeCache(clave) : [];
      }
      try {
        var respuesta = await withNetworkTimeout(
          function () {
            return consultaFn();
          },
          NETWORK_TIMEOUT_MS,
          "withCache:" + clave
        );
        var data = respuesta && respuesta.data;
        var error = respuesta && respuesta.error;
        if (error) {
          if (window.esErrorDeRed(error)) {
            if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
            return typeof leerDeCache === "function" ? leerDeCache(clave) : [];
          }
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
          if (typeof _estadoCacheClaves !== "undefined") _estadoCacheClaves[clave] = "servidor";
          if (typeof actualizarIndicadorConexion === "function") actualizarIndicadorConexion();
          return [];
        }
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
        if (typeof _estadoCacheClaves !== "undefined") _estadoCacheClaves[clave] = "servidor";
        if (typeof idbSet === "function") await idbSet(clave, data || []);
        if (typeof actualizarIndicadorConexion === "function") actualizarIndicadorConexion();
        return data || [];
      } catch (e) {
        if (window.esErrorDeRed(e) || esErrorTimeout(e)) {
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
          try {
            console.warn("[BattleCruiser] withCache timeout/red → cache", { clave: clave, code: e && e.code });
          } catch (e2) {}
          return typeof leerDeCache === "function" ? leerDeCache(clave) : [];
        }
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
        throw e;
      }
    };
    window.withCache.__bcF1Timed = true;
    try {
      withCache = window.withCache;
    } catch (e) {}
  }

  if (typeof window.ejecutarOperacion === "function" && !window.ejecutarOperacion.__bcF1Timed) {
    var ejecutarOriginal = window.ejecutarOperacion;
    if (typeof ejecutarOperacion === "function") ejecutarOriginal = ejecutarOperacion;

    window.ejecutarOperacion = async function (tipo, payload) {
      if (typeof usuarioPuedeOperar === "function") {
        var puede = await usuarioPuedeOperar();
        if (!puede) {
          return { ok: false, error: { message: "Tu usuario está inactivo. Contactá al administrador." } };
        }
      }
      if (typeof sincronizarUsuarioIdParaOperaciones === "function") sincronizarUsuarioIdParaOperaciones();
      var idempotency_key = crypto.randomUUID();
      var rpcNombre = typeof RPC_POR_TIPO !== "undefined" ? RPC_POR_TIPO[tipo] : null;
      if (!rpcNombre) {
        return ejecutarOriginal.apply(this, arguments);
      }

      async function encolar() {
        var operacion = await guardarOperacionPendiente(
          crearOperacionPendiente(tipo, payload, idempotency_key)
        );
        await refrescarOperacionesPendientesCache();
        refrescarProyeccionUiTrasOffline();
        return { ok: true, offline: true, operacion: operacion };
      }

      if (!navigator.onLine) {
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
        return encolar();
      }

      try {
        var respuesta = await withNetworkTimeout(
          function () {
            return client.rpc(rpcNombre, Object.assign({}, payload, { p_idempotency_key: idempotency_key }));
          },
          NETWORK_TIMEOUT_MS,
          "ejecutarOperacion:" + tipo
        );
        var data = respuesta && respuesta.data;
        var error = respuesta && respuesta.error;

        if (!error) {
          if (typeof tipoAuditableFrontend === "function" && tipoAuditableFrontend(tipo) && typeof registrarAuditoria === "function") {
            var entidadId = typeof data === "string" ? data : String((data && data.id) || "");
            registrarAuditoria(
              tipo,
              "Operación " + ((typeof ETIQUETA_TIPO_OP !== "undefined" && ETIQUETA_TIPO_OP[tipo]) || tipo) + " ejecutada online.",
              "exito",
              entidadId,
              idempotency_key,
              null
            );
          }
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
          return { ok: true, offline: false, data: data };
        }

        if (window.esErrorDeRed(error)) {
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
          return encolar();
        }

        if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
        if (typeof tipoAuditableFrontend === "function" && tipoAuditableFrontend(tipo) && typeof registrarAuditoria === "function") {
          registrarAuditoria(
            tipo,
            "Operación " + ((typeof ETIQUETA_TIPO_OP !== "undefined" && ETIQUETA_TIPO_OP[tipo]) || tipo) + " rechazada: " + (error.message || "error de negocio"),
            "requiere_atencion",
            null,
            idempotency_key,
            null
          );
        }
        return { ok: false, error: error };
      } catch (e) {
        if (window.esErrorDeRed(e) || esErrorTimeout(e)) {
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
          try {
            console.warn("[BattleCruiser] ejecutarOperacion timeout/red → cola", { tipo: tipo, code: e && e.code });
          } catch (e2) {}
          return encolar();
        }
        throw e;
      }
    };
    window.ejecutarOperacion.__bcF1Timed = true;
    try {
      ejecutarOperacion = window.ejecutarOperacion;
    } catch (e) {}
  }

  function registrarDiagnosticoSondeo(status, reason, startedAt) {
    // Only safe categories and timing are exposed; never record credentials, tokens, URLs, or user data.
    window.__BC_BACKEND_PROBE__ = {
      status: status,
      reason: reason,
      checkedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - startedAt)
    };
    if (status !== "online") window.__BC_BACKEND_RECOVERY_PENDING__ = true;
  }

  function emitirRecuperacionBackendSiPendiente() {
    if (!window.__BC_BACKEND_RECOVERY_PENDING__) return;
    if (typeof window.dispatchEvent !== "function" || typeof Event !== "function") return;
    try {
      window.dispatchEvent(new Event("bc:backend-reconnected"));
      window.__BC_BACKEND_RECOVERY_PENDING__ = false;
    } catch (e) {
      // Keep the recovery flag set so the next confirmed probe can retry the notification.
    }
  }

  // All callers share one real probe. This prevents the heartbeat, resume handlers,
  // reconnection events and manual diagnostic button from firing parallel requests.
  var sondeoBackendEnCurso = null;
  if (typeof window.sondearBackend === "function" && !window.sondearBackend.__bcF1Timed) {
    window.sondearBackend = function sondearBackendProtegido() {
      if (sondeoBackendEnCurso) return sondeoBackendEnCurso;
      var request = (async function () {
        var startedAt = Date.now();
        if (!navigator.onLine) {
          registrarDiagnosticoSondeo("offline", "device_offline", startedAt);
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
          return false;
        }
        try {
          // Probe Supabase Auth directly; getUser() may fail locally without an HTTP request.
          var baseUrl = typeof SUPABASE_URL === "string" ? SUPABASE_URL.replace(/\/+$/, "") : "";
          var apiKey = typeof SUPABASE_ANON_KEY === "string" ? SUPABASE_ANON_KEY : "";
          if (!baseUrl || !apiKey || typeof fetch !== "function") {
            registrarDiagnosticoSondeo("offline", "probe_config_missing", startedAt);
            if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
            return false;
          }
          var response = await withNetworkTimeout(function () {
            return fetch(baseUrl + "/auth/v1/health", {
              method: "GET",
              headers: { apikey: apiKey },
              cache: "no-store"
            });
          }, Math.min(NETWORK_TIMEOUT_MS, 8000), "sondearBackend");
          if (!response || typeof response.ok !== "boolean") throw new Error("BACKEND_PROBE_INVALID_RESPONSE");
          if (!response.ok) {
            registrarDiagnosticoSondeo("offline", "server_http_error", startedAt);
            if (typeof response.status === "number" && response.status >= 100 && response.status <= 599) {
              window.__BC_BACKEND_PROBE__.httpStatus = response.status;
            }
            if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
            return false;
          }
          registrarDiagnosticoSondeo("online", "response_ok", startedAt);
          if (typeof response.status === "number" && response.status >= 100 && response.status <= 599) {
            window.__BC_BACKEND_PROBE__.httpStatus = response.status;
          }
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
          emitirRecuperacionBackendSiPendiente();
          return true;
        } catch (e) {
          if (esErrorTimeout(e)) {
            registrarDiagnosticoSondeo("offline", "timeout", startedAt);
            if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
            return false;
          }
          if (window.esErrorDeRed(e)) {
            registrarDiagnosticoSondeo("offline", "network_error", startedAt);
            if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
            return false;
          }
          registrarDiagnosticoSondeo("offline", "probe_error", startedAt);
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
          return false;
        }
      })();
      var shared = request.finally(function () {
        if (sondeoBackendEnCurso === shared) sondeoBackendEnCurso = null;
      });
      sondeoBackendEnCurso = shared;
      return shared;
    };
    window.sondearBackend.__bcF1Timed = true;
    try { sondearBackend = window.sondearBackend; } catch (e) {}
  }

  // Android may suspend a PWA in the background, so no browser timer can promise a permanent socket.
  // Probe on resume, monitor every 30s while visible, and retry failures with bounded backoff.
  function iniciarVigilanciaConectividad() {
    if (window.__BC_CONNECTIVITY_WATCHDOG_INSTALLED__) return;
    if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
    if (typeof window.addEventListener !== "function" || typeof window.setTimeout !== "function") return;
    if (typeof window.sondearBackend !== "function") return;
    window.__BC_CONNECTIVITY_WATCHDOG_INSTALLED__ = true;
    var timer = null, failures = 0, checking = false;
    var POLL_INTERVAL_MS = 30000, FIRST_RETRY_MS = 3000, MAX_RETRY_MS = 30000;

    function isVisible() { return document.hidden !== true && document.visibilityState !== "hidden"; }
    function clearScheduledProbe() {
      if (timer !== null) { window.clearTimeout(timer); timer = null; }
    }
    function renderVisibleDiagnostic() {
      try {
        var tab = typeof document.getElementById === "function" ? document.getElementById("tab-config") : null;
        if (isVisible() && tab && tab.classList && tab.classList.contains("visible") &&
            typeof renderDiagnosticoConfig === "function") renderDiagnosticoConfig();
      } catch (e) {}
    }
    function scheduleProbe(ms) {
      clearScheduledProbe();
      if (!isVisible()) return;
      timer = window.setTimeout(runProbe, Math.max(0, ms));
    }
    function runProbe() {
      timer = null;
      if (!isVisible()) return;
      if (!navigator.onLine) {
        Promise.resolve(window.sondearBackend()).then(renderVisibleDiagnostic, function () {});
        return; // Wait for the browser "online" event rather than polling a known-offline device.
      }
      if (checking) { scheduleProbe(1000); return; }
      checking = true;
      Promise.resolve().then(function () { return window.sondearBackend(); }).then(function (online) {
        renderVisibleDiagnostic();
        if (online) {
          failures = 0;
          scheduleProbe(POLL_INTERVAL_MS);
        } else {
          failures += 1;
          scheduleProbe(Math.min(FIRST_RETRY_MS * Math.pow(2, Math.min(failures - 1, 4)), MAX_RETRY_MS));
        }
      }, function () {
        failures += 1;
        renderVisibleDiagnostic();
        scheduleProbe(Math.min(FIRST_RETRY_MS * Math.pow(2, Math.min(failures - 1, 4)), MAX_RETRY_MS));
      }).then(function () { checking = false; });
    }
    function resumeProbe() {
      if (isVisible()) { failures = 0; scheduleProbe(0); }
    }

    window.addEventListener("online", resumeProbe);
    window.addEventListener("offline", function () {
      clearScheduledProbe();
      failures = 0;
      window.__BC_BACKEND_RECOVERY_PENDING__ = true;
      registrarDiagnosticoSondeo("offline", "device_offline", Date.now());
      if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
      renderVisibleDiagnostic();
    });
    window.addEventListener("pageshow", resumeProbe);
    window.addEventListener("focus", resumeProbe);
    window.addEventListener("pagehide", clearScheduledProbe);
    document.addEventListener("visibilitychange", function () {
      if (isVisible()) resumeProbe();
      else clearScheduledProbe();
    });
    scheduleProbe(0);
  }
  window.__BC_START_CONNECTIVITY_WATCHDOG__ = iniciarVigilanciaConectividad;
  iniciarVigilanciaConectividad();

  if (typeof window.hideLoading === "function" && !window.hideLoading.__bcF1Display) {
    var hideOrig = window.hideLoading;
    window.hideLoading = function () {
      hideOrig.apply(this, arguments);
      try {
        var count = typeof window.__bcLoadingCount === "function" ? window.__bcLoadingCount() : null;
        if (count === 0) {
          var el = document.getElementById("global-loading-overlay");
          if (el) {
            el.classList.remove("visible");
            el.style.display = "none";
          }
        }
      } catch (e) {}
    };
    window.hideLoading.__bcF1Display = true;
    try {
      hideLoading = window.hideLoading;
    } catch (e) {}
  }

  if (typeof window.resetLoadingOverlay === "function" && !window.resetLoadingOverlay.__bcF1Display) {
    var resetOrig = window.resetLoadingOverlay;
    window.resetLoadingOverlay = function () {
      resetOrig.apply(this, arguments);
      try {
        var el = document.getElementById("global-loading-overlay");
        if (el) {
          el.classList.remove("visible");
          el.style.display = "none";
        }
      } catch (e) {}
    };
    window.resetLoadingOverlay.__bcF1Display = true;
    try {
      resetLoadingOverlay = window.resetLoadingOverlay;
    } catch (e) {}
  }

  console.info("[BattleCruiser] network-core F1+P0-B activo (timeout=" + NETWORK_TIMEOUT_MS + "ms)");
})();
