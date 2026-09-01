// ==== BattleCruiser · online/offline guard ====
// FASE 1: endurecimiento de conectividad SIN reescribir withCache/ejecutarOperacion
// (esas capas ahora tienen timeout en network-core.js / offline.js).
// Reutiliza IndexedDB, withCache(), ejecutarOperacion(), sincronizarCola() e indicador existentes.
(function () {
  "use strict";

  if (window.__bcOnlineOfflineGuardF1) return;
  window.__bcOnlineOfflineGuardF1 = true;

  var UMBRAL_SONDEO_MS = 30000;
  var UMBRAL_VISIBILIDAD_MS = 15000;
  var ultimoSondeo = 0;
  var sondeoEnCurso = false;
  var timer = null;

  function errorEsRed(error) {
    if (typeof esErrorTimeout === "function" && esErrorTimeout(error)) return true;
    if (typeof esErrorDeRed === "function") return esErrorDeRed(error);
    var msg = String((error && (error.message || error.code)) || error || "").toLowerCase();
    return !navigator.onLine || /failed to fetch|fetch failed|networkerror|network request failed|load failed|timeout|err_internet_disconnected|err_network|aborterror|network|network_timeout/.test(msg);
  }

  var esErrorDeRedOriginal = window.esErrorDeRed;
  window.esErrorDeRed = function (error) {
    if (typeof esErrorTimeout === "function" && esErrorTimeout(error)) return true;
    if (!navigator.onLine) return true;
    var msg = String((error && (error.message || error.code || error.name)) || error || "").toLowerCase();
    if (/aborterror|network|failed to fetch|fetch failed|load failed|timeout|err_internet_disconnected|err_network|dns|enotfound|econn|connection reset|connection refused|network_timeout/.test(msg)) return true;
    return esErrorDeRedOriginal ? esErrorDeRedOriginal(error) : errorEsRed(error);
  };

  async function comprobarBackendReal() {
    if (!navigator.onLine) {
      if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
      return false;
    }
    if (sondeoEnCurso) return typeof _conectividadReal !== "undefined" && _conectividadReal === "online";
    sondeoEnCurso = true;
    try {
      if (typeof client === "undefined" || !client || !client.auth) {
        return false;
      }
      var resultado;
      if (typeof withNetworkTimeout === "function") {
        resultado = await withNetworkTimeout(function () {
          return client.auth.getUser();
        }, Math.min(typeof BC_NETWORK_TIMEOUT_MS === "number" ? BC_NETWORK_TIMEOUT_MS : 12000, 8000), "guard.sondeo");
      } else {
        resultado = await client.auth.getUser();
      }
      var error = resultado && resultado.error;
      if (error && window.esErrorDeRed(error)) {
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
        return false;
      }
      if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
      return true;
    } catch (e) {
      if (window.esErrorDeRed(e)) {
        if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
        return false;
      }
      if (typeof marcarConectividadReal === "function") marcarConectividadReal("online");
      return true;
    } finally {
      sondeoEnCurso = false;
      ultimoSondeo = Date.now();
    }
  }

  async function recuperarYComprobar() {
    if (!navigator.onLine) {
      if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
      return;
    }
    var online = await comprobarBackendReal();
    if (online && typeof sincronizarCola === "function" && typeof usuarioIdParaCola === "function" && usuarioIdParaCola()) {
      try {
        await sincronizarCola();
      } catch (e) {
        if (window.esErrorDeRed(e)) {
          if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
        }
      }
    }
  }

  window.addEventListener("offline", function () {
    if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
  });

  window.addEventListener("online", function () {
    if (typeof marcarConectividadReal === "function") marcarConectividadReal(null);
    setTimeout(recuperarYComprobar, 250);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - ultimoSondeo >= UMBRAL_VISIBILIDAD_MS) {
      recuperarYComprobar();
    }
  });

  timer = setInterval(function () {
    if (document.visibilityState === "hidden") return;
    if (Date.now() - ultimoSondeo >= UMBRAL_SONDEO_MS) recuperarYComprobar();
  }, UMBRAL_SONDEO_MS);

  setTimeout(recuperarYComprobar, 800);
})();
