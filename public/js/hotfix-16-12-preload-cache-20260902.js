// BattleCruiser — 16.12: precarga local inmediata para Inventario/Ventas/Productos.
(function(){'use strict';if(window.__BC1612)return;window.__BC1612=true;
var done=false;
async function preload(){if(done||typeof leerDeCache!=='function')return false;var uid=window._usuarioActualId||window._usuarioActual?.id;if(!uid)return false;done=true;try{if(typeof window._cache!=='undefined')window._cache=window._cache||{};}catch(_){}
 var keys=['productos','categorias','unidades','almacenes','stock','presentaciones'];await Promise.all(keys.map(async function(k){try{var d=await leerDeCache(k);if(Array.isArray(d)&&typeof _cache!=='undefined')_cache[k]=d;}catch(_){}}));
 try{if(typeof refrescarStockYSelects==='function'&&_cache?.stock?.length)renderPanelAlmacenSeleccionado?.();}catch(_){}try{if(typeof window.__bcInventarioProyectado==='function'&&document.getElementById('tab-inventario')?.classList.contains('visible'))window.__bcInventarioProyectado();}catch(_){}return true;}
function boot(){preload();var i=0,t=setInterval(function(){if(preload()||++i>20)clearInterval(t)},250);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();window.addEventListener('focus',preload);window.addEventListener('online',preload);
window.__BC1612_verify=function(){return{preloadStarted:done,cacheKeys:['productos','categorias','unidades','almacenes','stock','presentaciones'].filter(function(k){try{return Array.isArray(_cache?.[k])&&_cache[k].length>0}catch(_){return false}})}};
})();
