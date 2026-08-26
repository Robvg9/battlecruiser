// BattleCruiser F3/F4 — Payload de venta con presentación (defensa en profundidad)
// v1.0 — Asegura que p_lineas conserve presentacion_id / cantidad_presentacion / tipo_precio.
// Owner de presentación: m27-6. Este módulo solo corrige constructores de payload residuales.
(function(){
  "use strict";
  if(window.__BC_VENTA_PAYLOAD_PRES__) return;
  window.__BC_VENTA_PAYLOAD_PRES__ = true;

  function buildLineas(lineas){
    if(typeof window.__BC_M276_buildPLineas === "function"){
      return window.__BC_M276_buildPLineas(lineas);
    }
    return (lineas||[]).map(function(l){
      var out = { producto_id: l.producto_id, cantidad: Number(l.cantidad)||0 };
      if(l.presentacion_id){
        out.presentacion_id = l.presentacion_id;
        out.cantidad_presentacion = l.cantidad_presentacion!=null ? Number(l.cantidad_presentacion) : null;
      } else {
        out.presentacion_id = null;
        out.cantidad_presentacion = null;
      }
      if(l.tipo_precio) out.tipo_precio = l.tipo_precio;
      return out;
    });
  }

  function patchEjecutar(){
    if(typeof ejecutarOperacion !== "function" || ejecutarOperacion.__bcVentaPayloadPres) return;
    var orig = ejecutarOperacion;
    window.ejecutarOperacion = async function(tipo, params){
      if(tipo === "venta" && params && Array.isArray(ventaLineas) && ventaLineas.length){
        params = Object.assign({}, params);
        params.p_lineas = buildLineas(ventaLineas);
      }
      return orig.call(this, tipo, params);
    };
    window.ejecutarOperacion.__bcVentaPayloadPres = true;
  }

  function boot(){ patchEjecutar(); }
  boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
})();
