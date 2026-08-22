// ==== BattleCruiser · online/offline guard ====
// Capa de endurecimiento del estado de conectividad.
// No crea otra caché ni otra cola: reutiliza IndexedDB, withCache(),
// ejecutarOperacion(), sincronizarCola() y el indicador existentes.
(function () {
  "use strict";

  var UMBRAL_SONDEO_MS = 30000;
  var UMBRAL_VISIBILIDAD_MS = 15000;
  var ultimoSondeo = 0;
  var sondeoEnCurso = false;
  var timer = null;

  function errorEsRed(error) {
    if (typeof esErrorDeRed === "function") return esErrorDeRed(error);
    var msg = String((error && (error.message || error.code)) || error || "").toLowerCase();
    return !navigator.onLine || /failed to fetch|fetch failed|networkerror|network request failed|load failed|timeout|err_internet_disconnected|err_network|aborterror|network/.test(msg);
  }

  // Amplía la detección existente sin reemplazar la infraestructura offline.
  var esErrorDeRedOriginal = window.esErrorDeRed;
  window.esErrorDeRed = function (error) {
    if (!navigator.onLine) return true;
    var msg = String((error && (error.message || error.code || error.name)) || error || "").toLowerCase();
    if (/aborterror|network|failed to fetch|fetch failed|load failed|timeout|err_internet_disconnected|err_network|dns|enotfound|econn|connection reset|connection refused/.test(msg)) return true;
    return esErrorDeRedOriginal ? esErrorDeRedOriginal(error) : errorEsRed(error);
  };

  async function comprobarBackendReal() {
    if (!navigator.onLine) {
      if (typeof marcarConectividadReal === "function") marcarConectividadReal("offline");
      return false;
    }
    if (sondeoEnCurso) return _conectividadReal === "online";
    sondeoEnCurso = true;
    try {
      if (typeof client === "undefined" || !client || !client.auth) {
        return false;
      }
      // auth.getUser() llega realmente a Supabase. Un error de autenticación
      // sigue demostrando que el backend respondió; solo un fallo de red
      // significa backend inaccesible.
      var resultado = await client.auth.getUser();
      var error = resultado && resultado.error;
      if (error && window.esErrorDeRed(error)) {
        marcarConectividadReal("offline");
        return false;
      }
      marcarConectividadReal("online");
      return true;
    } catch (e) {
      if (window.esErrorDeRed(e)) {
        marcarConectividadReal("offline");
        return false;
      }
      marcarConectividadReal("online");
      return true;
    } finally {
      sondeoEnCurso = false;
      ultimoSondeo = Date.now();
    }
  }

  // Reemplaza solo la capa de decisión de caché. La infraestructura IDB
  // existente sigue siendo la única fuente local.
  if (typeof window.withCache === "function") {
    window.withCache = async function (clave, consultaFn) {
      if (!navigator.onLine) {
        marcarConectividadReal("offline");
        return leerDeCache(clave);
      }
      try {
        var respuesta = await consultaFn();
        var data = respuesta && respuesta.data;
        var error = respuesta && respuesta.error;
        if (error) {
          if (window.esErrorDeRed(error)) {
            marcarConectividadReal("offline");
            return leerDeCache(clave);
          }
          // El servidor respondió: esto NO es offline aunque sea un error
          // de permisos, RPC o validación.
          marcarConectividadReal("online");
          _estadoCacheClaves[clave] = "servidor";
          actualizarIndicadorConexion();
          return [];
        }
        marcarConectividadReal("online");
        _estadoCacheClaves[clave] = "servidor";
        await idbSet(clave, data || []);
        actualizarIndicadorConexion();
        return data || [];
      } catch (e) {
        if (window.esErrorDeRed(e)) {
          marcarConectividadReal("offline");
          return leerDeCache(clave);
        }
        // Error de código/transformación: no mentir diciendo que se perdió
        // Internet. Se conserva el error para que la pantalla pueda
        // diagnosticarlo.
        marcarConectividadReal("online");
        throw e;
      }
    };
  }

  // Refuerzo de ejecutarOperacion: una respuesta del backend confirma
  // conectividad; un fallo de red la marca offline. La lógica de cola y RPC
  // sigue siendo exactamente la original.
  if (typeof window.ejecutarOperacion === "function") {
    var ejecutarOperacionOriginal = window.ejecutarOperacion;
    window.ejecutarOperacion = async function () {
      if (!navigator.onLine) marcarConectividadReal("offline");
      try {
        var r = await ejecutarOperacionOriginal.apply(this, arguments);
        if (r && r.offline) {
          marcarConectividadReal("offline");
        } else if (r && (r.ok || r.error)) {
          // Tanto éxito como error de negocio implican respuesta real del
          // backend; solo r.offline representa fallo de red.
          if (!r.offline) marcarConectividadReal("online");
        }
        return r;
      } catch (e) {
        if (window.esErrorDeRed(e)) marcarConectividadReal("offline");
        throw e;
      }
    };
  }

  async function recuperarYComprobar() {
    if (!navigator.onLine) {
      marcarConectividadReal("offline");
      return;
    }
    var online = await comprobarBackendReal();
    if (online && typeof sincronizarCola === "function" && typeof usuarioIdParaCola === "function" && usuarioIdParaCola()) {
      try { await sincronizarCola(); } catch (e) { if (window.esErrorDeRed(e)) marcarConectividadReal("offline"); }
    }
  }

  // Recuperación inmediata cuando el sistema operativo vuelve a tener red.
  window.addEventListener("offline", function () {
    marcarConectividadReal("offline");
  });

  window.addEventListener("online", function () {
    marcarConectividadReal(null);
    setTimeout(recuperarYComprobar, 250);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - ultimoSondeo >= UMBRAL_VISIBILIDAD_MS) {
      recuperarYComprobar();
    }
  });

  // Sondeo ligero: evita que un fallo transitorio deje el indicador pegado
  // en offline cuando no existe evento online (caso común con Wi-Fi).
  timer = setInterval(function () {
    if (document.visibilityState === "hidden") return;
    if (Date.now() - ultimoSondeo >= UMBRAL_SONDEO_MS) recuperarYComprobar();
  }, UMBRAL_SONDEO_MS);

  // Primera comprobación después de que los módulos y auth hayan tenido
  // oportunidad de inicializarse.
  setTimeout(recuperarYComprobar, 800);
})();
