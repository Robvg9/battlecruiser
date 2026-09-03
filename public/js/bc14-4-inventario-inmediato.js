(function(){
'use strict';
if(window.__BC144)return;window.__BC144=true;
function renderCache(){
  var rows=window._cache&&Array.isArray(window._cache.stock)?window._cache.stock:[];
  if(!rows.length||typeof window.renderInventario!=='function')return false;
  var productos=Array.isArray(window._cache.productos)?window._cache.productos:[];
  var almacenes=Array.isArray(window._cache.almacenes)?window._cache.almacenes:[];
  var pm=new Map(productos.map(function(p){return[String(p.id),p];}));
  var am=new Map(almacenes.map(function(a){return[String(a.id),a];}));
  window.renderInventario(rows.map(function(s){
    var p=pm.get(String(s.producto_id)),a=am.get(String(s.almacen_id)),q=Number(s.cantidad)||0,m=s.minimo==null?null:Number(s.minimo);
    return{producto_id:s.producto_id,producto:p&&p.nombre?p.nombre:'—',almacen_id:s.almacen_id,almacen:a&&a.nombre?a.nombre:(s.almacen_nombre||'—'),cantidad:q,minimo:m,estado:q<=0?'agotado':(m!=null&&q<=m?'bajo':'normal'),valor_inventario:q*(Number(p&&p.precio_normal)||0)};
  }));
  return true;
}
function install(){
  var old=window.refrescarInventario;
  if(typeof old!=='function'||old.__bc144)return false;
  function wrapped(){
    var painted=renderCache();
    if(painted)return Promise.resolve().then(function(){return old.apply(this,arguments);});
    return old.apply(this,arguments);
  }
  wrapped.__bc144=true;window.refrescarInventario=wrapped;
  try{refrescarInventario=wrapped;}catch(_){ }
  return true;
}
function boot(){if(install())return;[150,400,900,1800,3000].forEach(function(ms){setTimeout(install,ms);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
