// BattleCruiser — hotfix 14 regresiones operativas
(function(){
  'use strict';
  if(window.__BC14Regresiones20260902) return;
  window.__BC14Regresiones20260902=true;

  function same(a,b){ return a!=null && b!=null && String(a)===String(b); }
  function num(v){ var n=Number(v); return Number.isFinite(n)?n:0; }

  function instalarStockCanonico(){
    if(typeof window.cargarStockAlmacenes!=='function') return false;
    if(window.cargarStockAlmacenes.__bc14StockCanonico) return true;
    var original=window.cargarStockAlmacenes;
    async function cargar(force){
      if(!force && window._stockCargaEstado==='ok' && Array.isArray(window._cache&&window._cache.stock)){
        if(typeof window.renderPanelAlmacenSeleccionado==='function') window.renderPanelAlmacenSeleccionado();
        return window._cache.stock;
      }
      window._stockCargaEstado='loading';
      window._stockCargaError=null;
      try{
        var r=await window.client.rpc('bc_stock_operativo');
        if(r.error) throw r.error;
        var rows=Array.isArray(r.data)?r.data:[];
        window._cache=window._cache||{};
        window._cache.stock=rows.map(function(x){
          return {
            id:x.id||null,
            producto_id:x.producto_id,
            almacen_id:x.almacen_id,
            cantidad:num(x.cantidad),
            minimo:x.minimo==null?null:num(x.minimo),
            productos:x.producto_nombre?{nombre:x.producto_nombre}:undefined,
            almacen_nombre:x.almacen_nombre||''
          };
        });
        window._stockCargaEstado='ok';
        if(typeof window.renderPanelAlmacenSeleccionado==='function') window.renderPanelAlmacenSeleccionado();
        return window._cache.stock;
      }catch(e){
        window._stockCargaEstado='error';
        window._stockCargaError=e&&e.message?e.message:String(e);
        if(typeof window.renderPanelAlmacenSeleccionado==='function') window.renderPanelAlmacenSeleccionado();
        return [];
      }
    }
    cargar.__bc14StockCanonico=true;
    window.cargarStockAlmacenes=cargar;
    try{ cargarStockAlmacenes=cargar; }catch(_){ }
    return true;
  }

  function arrancar(){
    if(instalarStockCanonico()) return;
    [150,400,900,1800,3000].forEach(function(ms){setTimeout(instalarStockCanonico,ms);});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',arrancar,{once:true});
  else arrancar();
})();
