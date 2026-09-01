// ==== BattleCruiser · js/network-core.js ====
// FASE 1 Offline Core — timeout de red central + consolidación de loading.
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

  /**
   * Error estructurado de timeout.
   * Limitación: client.rpc de Supabase no expone AbortController de forma fiable;
   * abandonamos la espera en UI (Promise.race) pero la petición puede completar en background.
   */
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

  /**
   * withNetworkTimeout(promiseOrFn, timeoutMs?, label?)
   * Si promiseOrFn es función, se invoca al entrar (lazy).
   */
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

  if (typeof window.sondearBackend === "function" && !window.sondearBackend.__bcF1Timed) {
    window.sondearBackend = async function () {
      if (!navigator.onLine) {
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
        return false;
      }
      try {
        var resultado = await withNetworkTimeout(
          function () {
            return client.auth.getUser();
          },
          Math.min(NETWORK_TIMEOUT_MS, 8000),
          "sondearBackend"
        );
        var error = resultado && resultado.error;
        if (error && window.esErrorDeRed(error)) {
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
          return false;
        }
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
        return true;
      } catch (e) {
        if (window.esErrorDeRed(e) || esErrorTimeout(e)) {
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
          return false;
        }
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
        return true;
      }
    };
    window.sondearBackend.__bcF1Timed = true;
    try {
      sondearBackend = window.sondearBackend;
    } catch (e) {}
  }

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

  console.info("[BattleCruiser] network-core F1 activo (timeout=" + NETWORK_TIMEOUT_MS + "ms)");
})();
