// BattleCruiser M27.6 — Presentaciones en Ventas
(function(){
  "use strict";
  if(window.__BC_M276_PRES__)return;
  window.__BC_M276_PRES__=true;
  var _pres=[];
  function esc(s){return typeof escHtml==="function"?escHtml(s):String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");}
  function almId(){try{if(typeof bcSincronizarSelectAlmacenTurno==="function"){var id=bcSincronizarSelectAlmacenTurno();if(id)return id;}}catch(e){}var s=document.getElementById("venta-almacen");return s?s.value:"";}
  function almTipo(){var id=almId();try{if(typeof ventaAlmacenesTipo!=="undefined"&&id&&ventaAlmacenesTipo[id]!=null)return String(ventaAlmacenesTipo[id]).toLowerCase();}catch(e){}try{var a=(_cache.almacenes||[]).find(function(x){return String(x.id)===String(id);});return a&&a.tipo?String(a.tipo).toLowerCase():null;}catch(e2){return null;}}
  function getProd(pid){try{if(Array.isArray(ventaProductosLista)){var p=ventaProductosLista.find(function(x){return String(x.id)===String(pid);});if(p)return p;}}catch(e){}try{return(_cache.productos||[]).find(function(x){return String(x.id)===String(pid);})||null;}catch(e2){return null;}}
  function canSell(pid){var tipo=almTipo(),prod=getProd(pid);if(!prod)return{ok:false,msg:"Producto no encontrado."};if(tipo==="mayorista"){if(prod.precio_mayorista==null)return{ok:false,msg:"Este producto no tiene precio mayorista configurado."};if(!prod.presentacion_id)return{ok:false,msg:"No se puede vender mayorista «"+(prod.nombre||"producto")+"» sin presentación mayorista definida."};}else if(prod.precio_normal==null&&prod.precio_mayorista==null)return{ok:false,msg:"Este producto no tiene precio configurado."};return{ok:true};}
  function buildPLineasFromCart(lineas){return(lineas||[]).map(function(l){return{producto_id:l.producto_id,cantidad:Number(l.cantidad)||0,presentacion_id:l.presentacion_id||null,cantidad_presentacion:l.cantidad_presentacion!=null?Number(l.cantidad_presentacion):null,tipo_precio:l.tipo_precio||null};});}
  window.__BC_M276_buildPLineas=buildPLineasFromCart;
  function ensureUI(){var form=document.getElementById("form-venta-linea");if(!form||document.getElementById("venta-presentacion"))return;var s=document.createElement("select");s.id="venta-presentacion";s.innerHTML='<option value="">Unidad base</option>';var c=document.getElementById("venta-cantidad");if(c&&c.parentNode===form)form.insertBefore(s,c);else form.appendChild(s);}
  function patchAdd(){if(typeof window.agregarLineaVenta!=="function"||window.agregarLineaVenta.__bcM276)return;var old=window.agregarLineaVenta;function add(producto_id,cantidad,almacen_id,opts){opts=opts||{};var check=canSell(producto_id);if(!check.ok){if(typeof setMsg==="function")setMsg("msg-venta-linea",check.msg,false);return false;}return old.apply(this,arguments);}add.__bcM276=true;add.__bcM276Orig=old;window.agregarLineaVenta=add;try{agregarLineaVenta=add;}catch(e){}}
  function patchOp(){if(typeof window.ejecutarOperacion!=="function"||window.ejecutarOperacion.__bcM276)return;var old=window.ejecutarOperacion;function op(tipo,params){if(tipo==="venta"&&params){params=Object.assign({},params);if(Array.isArray(window.ventaLineas)&&window.ventaLineas.length)params.p_lineas=buildPLineasFromCart(window.ventaLineas);var t=almTipo();if(t==="mayorista")params.p_tipo_precio=params.p_tipo_precio||"mayorista";else if(t==="minorista")params.p_tipo_precio=params.p_tipo_precio||"normal";}return old.apply(this,arguments);}op.__bcM276=true;window.ejecutarOperacion=op;try{ejecutarOperacion=op;}catch(e){}}
  function boot(){ensureUI();patchAdd();patchOp();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  setTimeout(boot,300);setTimeout(boot,1200);
})();
