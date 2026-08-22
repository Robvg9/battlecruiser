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
// Se carga al final porque app.js es el último módulo del shell: en ese punto
// offline.js, auth y el resto de módulos ya existen. La guardia no crea una
// segunda caché ni una segunda cola; endurece las funciones existentes.
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