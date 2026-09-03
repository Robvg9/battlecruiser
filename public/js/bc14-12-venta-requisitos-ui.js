(function(){
'use strict';
if(window.__BC1412)return;window.__BC1412=true;
function tipo(){var id=document.getElementById('venta-almacen')?.value;try{return String(window.ventaAlmacenesTipo&&window.ventaAlmacenesTipo[id]||'venta').toLowerCase();}catch(_){return'venta';}}
function validar(e){
 var pid=document.getElementById('venta-producto')?.value||'';if(!pid)return;
 var p=(window.ventaProductosLista||window._cache?.productos||[]).find(function(x){return String(x.id)===String(pid);});if(!p)return;
 var mayor=tipo()==='mayorista';var precio=mayor?p.precio_mayorista:p.precio_normal;var pres=document.getElementById('venta-presentacion');
 if(!(Number(precio)>0)){e.preventDefault();e.stopImmediatePropagation();if(typeof window.setMsg==='function')window.setMsg('msg-venta-linea',mayor?'No se puede vender: falta precio mayorista.':'No se puede vender: falta precio normal.',false);return false;}
 if(!pres||!pres.value){e.preventDefault();e.stopImmediatePropagation();if(typeof window.setMsg==='function')window.setMsg('msg-venta-linea','No se puede vender: seleccioná una presentación.',false);return false;}
 return true;
}
function bind(){var f=document.getElementById('form-venta-linea');if(f&&!f.dataset.bc1412){f.dataset.bc1412='1';f.addEventListener('submit',validar,true);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
[300,800,1600,3000].forEach(function(ms){setTimeout(bind,ms);});
})();
