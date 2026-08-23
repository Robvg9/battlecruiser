// ==== BattleCruiser · runtime-productos-hardening.js ====
// Misión 9.2.28 — estabilización de carga silenciosa y anti-duplicados.
// NO crea otra caché, cola, CRUD ni sistema de sincronización.
// Trabaja sobre las funciones/cachés existentes.

(function(){
  "use strict";

  let instalado = false;
  let refreshEnCurso = null;
  let activeOriginal = null;
  let activeCacheHasta = 0;
  let activeCacheValor = null;
  let silentProductRefresh = false;

  function instalar(){
    if(instalado) return;
    if(typeof window.refrescarProductos !== "function") return;
    instalado = true;

    // Defensa contra el error observado: fillSelect(null, ...) no debe
    // romper una carga completa solo porque un formulario no está montado.
    if(typeof window.fillSelect === "function" && !window.fillSelect.__bcSafe){
      const originalFillSelect = window.fillSelect;
      const safeFillSelect = function(select, rows, valueKey, labelFn, keepFirst){
        if(!select) return;
        return originalFillSelect(select, rows || [], valueKey, labelFn, keepFirst);
      };
      safeFillSelect.__bcSafe = true;
      window.fillSelect = safeFillSelect;
    }

    const originalRefresh = window.refrescarProductos;
    window.refrescarProductos = async function(){
      // Una sola carga física aunque varios módulos la pidan al mismo tiempo.
      if(refreshEnCurso) return refreshEnCurso;

      let tieneCache = false;
      try {
        tieneCache = typeof _cache !== "undefined" &&
          Array.isArray(_cache.productos) && _cache.productos.length > 0;
      } catch (_) {}

      // Si ya tenemos datos válidos, el usuario conserva inmediatamente la
      // pantalla mientras la actualización real ocurre en segundo plano.
      if(tieneCache && typeof window.renderProductosLista === "function"){
        try{ window.renderProductosLista(); }catch(e){}
      }

      refreshEnCurso = (async()=>{
        const oldSetLoading = window.setLoading;
        if(tieneCache && typeof oldSetLoading === "function"){
          window.setLoading = function(id,msg){
            if(silentProductRefresh && id === "lista-productos") return;
            return oldSetLoading.apply(this,arguments);
          };
          silentProductRefresh = true;
        }
        try{
          return await originalRefresh();
        } finally {
          if(tieneCache && typeof oldSetLoading === "function"){
            window.setLoading = oldSetLoading;
            silentProductRefresh = false;
          }
        }
      })();

      try{
        return await refreshEnCurso;
      } finally{
        refreshEnCurso = null;
      }
    };

    // La validación real de usuario activo sigue siendo la existente.
    // Solo se evita repetir el RPC durante 30 s después de una confirmación
    // positiva. Nunca convierte un false del backend en true.
    if(typeof window.usuarioPuedeOperar === "function" && !window.usuarioPuedeOperar.__bcCached){
      activeOriginal = window.usuarioPuedeOperar;
      const cachedActiveCheck = async function(){
        const ahora = Date.now();
        if(activeCacheHasta > ahora && activeCacheValor === true) return true;
        const resultado = await activeOriginal();
        activeCacheValor = resultado === true;
        activeCacheHasta = activeCacheValor ? ahora + 30000 : 0;
        return resultado;
      };
      cachedActiveCheck.__bcCached = true;
      window.usuarioPuedeOperar = cachedActiveCheck;
    }
  }

  instalar();
  if(!instalado) window.addEventListener("load",instalar,{once:true});
})();
