// BattleCruiser — 16.10: reparar Editar producto.
(function(){'use strict';if(window.__BC1610)return;window.__BC1610=true;
function boot(){
  window.iniciarEdicionProducto=function(p){
    p=p||{};
    var set=function(id,val){var e=document.getElementById(id);if(e)e.value=val==null?'':String(val)};
    set('prod-editando-id',p.id||'');set('prod-nombre',p.nombre||'');set('prod-categoria',p.categoria_id||'');set('prod-unidad',p.unidad||'');set('prod-precio-normal',p.precio_normal);set('prod-precio-mayorista',p.precio_mayorista);
    var b=document.getElementById('prod-submit-btn');if(b){b.type='submit';b.textContent='Guardar producto';}
    if(typeof window.__BC164_open==='function')window.__BC164_open();
    else {var f=document.getElementById('form-producto');if(f)f.scrollIntoView({behavior:'smooth',block:'center'});}
  };
  return true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,600)},{once:true});else setTimeout(boot,600);
window.__BC1610_verify=function(){return{editFunction:typeof window.iniciarEdicionProducto==='function',editIdField:!!document.getElementById('prod-editando-id')}};
})();
