// BattleCruiser — 16.11: el carrito no espera el refresco de stock.
(function(){'use strict';if(window.__BC1611)return;window.__BC1611=true;
function install(){
 var f=window.cargarStockAlmacenes;if(typeof f!=='function'||f.__bc1611)return false;
 async function load(force){
  var cache=window._cache&&Array.isArray(window._cache.stock)?window._cache.stock:null;
  if(cache&&cache.length){window._stockCargaEstado='ok';window._stockCargaError=null;try{window.renderPanelAlmacenSeleccionado?.()}catch(_){}
   if(!window.__BC1611_BG)window.__BC1611_BG=true;
   setTimeout(function(){try{Promise.resolve(f(force===true)).catch(function(){})}catch(_){}},0);
   return cache;
  }
  return f(force);
 }
 load.__bc1611=true;window.cargarStockAlmacenes=load;try{cargarStockAlmacenes=load}catch(_){}return true;
}
function boot(){if(install())return;[300,700,1500,2500].forEach(function(ms){setTimeout(install,ms)});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.__BC1611_verify=function(){return{patched:!!(window.cargarStockAlmacenes&&window.cargarStockAlmacenes.__bc1611),cached:Array.isArray(window._cache&&window._cache.stock)}};
})();
