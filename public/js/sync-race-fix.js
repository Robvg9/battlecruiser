// ==== BattleCruiser · sync-race-fix.js ====
// Evita una carrera entre el auto-sync y una sincronización manual.
// Cada llamada a sincronizarCola() espera su turno; no se pierde una
// sincronización solicitada mientras otra está ejecutándose.
(function () {
  "use strict";

  if (window.__BC_SYNC_RACE_FIX__) return;

  var original = window.sincronizarCola;
  if (typeof original !== "function") return;

  var cola = Promise.resolve();

  async function sincronizarColaSerializada() {
    var trabajo = cola.then(function () {
      return original();
    });
    cola = trabajo.catch(function () {});
    return trabajo;
  }

  sincronizarColaSerializada.__bcSyncRaceFix = true;
  sincronizarColaSerializada.__bcSyncRaceOriginal = original;
  window.sincronizarCola = sincronizarColaSerializada;
  window.__BC_SYNC_RACE_FIX__ = true;
})();
