// ==== Battlecruiser · app.js ====
// Misión de modularización: este archivo dejó de contener la lógica de la
// aplicación. Todo el código que antes vivía acá ahora está dividido en
// módulos dentro de public/js/ (ver lista y orden de carga en index.html).
//
// Los módulos se cargan como <script> clásicos (no ES modules), en el mismo
// orden en que las secciones aparecían originalmente en este archivo, y
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
(function cargarCatalogoAvanzado() {
  if (document.querySelector('script[src*="catalogo-avanzado"]')) return;
  var s = document.createElement("script");
  s.src = "js/catalogo-avanzado.js";
  s.async = false;
  document.body.appendChild(s);
})();
(function cargarPanelContextual() {
  if (document.querySelector('script[src*="panel-contextual"]')) return;
  var s = document.createElement("script");
  s.src = "js/panel-contextual.js";
  s.async = false;
  document.body.appendChild(s);
})();
(function cargarHistorialDetalle() {
  if (document.querySelector('script[src*="historial-detalle"]')) return;
  var s = document.createElement("script");
  s.src = "js/historial-detalle.js";
  s.async = false;
  document.body.appendChild(s);
})();

// El loading guard se instala al final de la carga del documento, después de
// todos los módulos estáticos. Así reemplaza el controlador global anterior
// sin tocar IndexedDB, Supabase ni las operaciones de negocio.
(function cargarLoadingGuard() {
  function cargar() {
    if (document.querySelector('script[src*="loading-guard"]')) return;
    var s = document.createElement("script");
    s.src = "js/loading-guard.js";
    s.async = false;
    document.body.appendChild(s);
  }
  if (document.readyState === "complete") cargar();
  else window.addEventListener("load", cargar, { once: true });
})();
