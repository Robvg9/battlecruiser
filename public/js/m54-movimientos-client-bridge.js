// BattleCruiser — M54.1: puente de compatibilidad para M51/M52
// El cliente Supabase existente se declara como binding global "client".
// M51/M52 necesitan además window.client. Exponemos el mismo objeto sin crear otro cliente.
(function () {
  'use strict';
  if (window.__bcM54MovClientBridge) return;
  window.__bcM54MovClientBridge = true;

  try {
    if ((!window.client || typeof window.client.rpc !== 'function') && typeof client !== 'undefined' && client) {
      window.client = client;
    }
  } catch (_) {}
})();
