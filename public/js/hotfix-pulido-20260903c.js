// BattleCruiser — Pulido operativo C 2026-09-03
(function(){
  'use strict';
  if(window.__BC_PULIDO_C_20260903__)return;
  window.__BC_PULIDO_C_20260903__=true;
  var done=false;
  function load(){
    if(typeof window.client==='undefined'||!client||typeof client.rpc!=='function')return;
    client.rpc('bc_stock_operativo').then(function(r){
      if(r.error||!Array.isArray(r.data))return;
      window.__BC_STOCK_MAP=Object.create(null);
      r.data.forEach(function(x){window.__BC_STOCK_MAP[String(x.producto_id)+'::'+String(x.almacen_id)]=Number(x.cantidad)||0;});
      if(window._cache){_cache.stock=r.data;_cache.stockPorProductoAlmacen=window.__BC_STOCK_MAP;}
      done=true;
      ['#catalogo-grid .catalogo-card'].forEach(function(sel){document.querySelectorAll(sel).forEach(function(card){var pid=card.dataset.productoId||card.dataset.productId||card.dataset.id||card.querySelector('[data-producto-id]')?.dataset.productoId||'';var aid=(document.getElementById('venta-almacen')||{}).value||'';if(!pid||!aid)return;var n=window.__BC_STOCK_MAP[pid+'::'+aid];var el=card.querySelector('.catalogo-card-stock');if(el)el.textContent='Stock: '+(n==null?0:n);});});
    }).catch(function(){});
    if(Array.isArray(window._cache?.almacenes)&&_cache.almacenes.length){
      _cache.almacenes.filter(function(a){return a&&a.activo!==false;}).forEach(function(a){['trf-origen','trf-destino','compra-almacen','vale-almacen','turno-almacen-abrir'].forEach(function(id){var s=document.getElementById(id);if(!s)return;if(!Array.from(s.options).some(function(o){return String(o.value)===String(a.id)})){var o=document.createElement('option');o.value=a.id;o.textContent=a.nombre;s.appendChild(o);}});});
    }
  }
  function boot(){[0,800,1800,3500,6000].forEach(function(ms){setTimeout(load,ms);});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC_PULIDO_C_VERIFY=function(){return{stockMapReady:!!window.__BC_STOCK_MAP&&Object.keys(window.__BC_STOCK_MAP).length>0,retried:true}};
})();
