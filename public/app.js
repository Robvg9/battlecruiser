// ==== Battlecruiser · app.js ====
// Misión de modularización: este archivo dejó de contener la lógica de la
// aplicación. Todo el código que antes vivía acá ahora está dividido en
// módulos dentro de public/js/ (ver lista y orden de carga en index.html).
//
// Los módulos se cargan como <script> clásicos (no ES modules), en el mismo
// orden en que las secciones aparecían originalmente en el archivo, y
// comparten el mismo scope global.
//
// Misión 9.3 T6: el panel contextual se carga al final para no alterar el
// orden histórico de los módulos de negocio.
// Misión 9.3 T8: configuración/mantenimiento se carga tras los módulos base.
// Misión 9.3 T9: catálogo avanzado (filtros) tras productos.
(function cargarConfiguracion() {
  if (document.querySelector('script[src*="configuracion"]')) return;
  var s = document.createElement("script");
  s.src = "js/configuracion.js";
  s.async = false;
  document.body.appendChild(s);
})();

// Misión Online/Offline — auditoría profunda y recuperación automática.
(function cargarGuardiaOnlineOffline() {
  if (document.querySelector('script[src*="online-offline-guard"]')) return;
  var s = document.createElement("script");
  s.src = "js/online-offline-guard.js";
  s.async = false;
  document.body.appendChild(s);
})();

// M20 — Operaciones financieras: reinversión integrada con caja + inventario.
(function cargarOperacionesFinancieras() {
  if (document.querySelector('script[src*="operaciones-financieras"]')) return;
  var s = document.createElement("script");
  s.src = "js/operaciones-financieras.js";
  s.async = false;
  document.body.appendChild(s);
})();

// Misión 2/7 — Aprobaciones administrativas. Se carga al final para reutilizar
// permisos, cliente Supabase, cache y Centro de Control ya inicializados.
(function cargarAprobacionesAdmin() {
  if (document.querySelector('script[src*="aprobaciones-admin"]')) return;
  var s = document.createElement("script");
  s.src = "js/aprobaciones-admin.js";
  s.async = false;
  document.body.appendChild(s);
})();
