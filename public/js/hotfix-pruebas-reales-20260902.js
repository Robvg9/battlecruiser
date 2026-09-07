// BattleCruiser hotfixes for real-test compatibility
(function(){
  "use strict";
  if(window.__BCRealTestsFix20260902)return;
  window.__BCRealTestsFix20260902=true;
  function same(a,b){return a!=null&&b!=null&&String(a)===String(b)}
  function num(v){var n=Number(v);return Number.isFinite(n)?n:0}
  function patchStockTruth(){if(typeof window.obtenerStockDisponible!=="function"||window.obtenerStockDisponible.__bcReal)return;var old=window.obtenerStockDisponible;function fn(p,a){var rows=window._cache&&Array.isArray(window._cache.stock)?window._cache.stock:[];var row=rows.find(function(s){return same(s.producto_id,p)&&same(s.almacen_id,a)});if(row)return{valor:Math.max(num(row.cantidad),0),ajuste:0,noCalculable:false,loaded:true,unknown:false,estado:"ok",hasRow:true};return old.apply(this,arguments)}fn.__bcReal=true;window.obtenerStockDisponible=fn}
  function patchConfig(){var u=window._usuarioActual||{},role=String(u.rol||u.role||"").toLowerCase(),admin=["dueño","dueno","admin","administrador","owner"].includes(role);var btn=document.querySelector('.tab-btn[data-tab="config"]'),panel=document.getElementById("tab-config");if(admin&&btn&&panel){btn.classList.remove("hidden","tab-sin-permiso","bc-config-tab-hidden");btn.style.removeProperty("display");btn.removeAttribute("aria-hidden");panel.classList.remove("hidden")}}
  function patchPermissions(){if(typeof window.aplicarPermisosAInterfaz!=="function"||window.aplicarPermisosAInterfaz.__bcReal)return;var old=window.aplicarPermisosAInterfaz;function fn(){var r=old.apply(this,arguments);setTimeout(patchConfig,0);return r}fn.__bcReal=true;window.aplicarPermisosAInterfaz=fn}
  function patchSales(){if(typeof window.agregarLineaVenta!=="function"||window.agregarLineaVenta.__bcReal)return;var old=window.agregarLineaVenta;function fn(producto,cantidad,almacen){var rows=window._cache&&Array.isArray(window._cache.productos)?window._cache.productos:[],p=rows.find(function(x){return same(x.id,producto)});if(!p){if(typeof window.setMsg==="function")window.setMsg("msg-venta-linea","Producto no encontrado.",false);return false}return old.apply(this,arguments)}fn.__bcReal=true;window.agregarLineaVenta=fn}
  function boot(){patchStockTruth();patchPermissions();patchConfig();patchSales()}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  setTimeout(boot,250);setTimeout(boot,1000);setTimeout(boot,2500);
})();
