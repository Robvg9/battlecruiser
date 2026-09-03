// BattleCruiser — 17.3: editar producto abre el mismo modal definitivo
(function(){
  'use strict';
  if(window.__BC173)return; window.__BC173=true;
  function boot(){
    if(typeof window.__BC171_open!=='function')return false;
    window.iniciarEdicionProducto=function(p){
      if(!p)return;
      function set(id,v){var e=document.getElementById(id);if(e)e.value=v==null?'':String(v);}
      set('prod-editando-id',p.id);set('prod-nombre',p.nombre);set('prod-categoria',p.categoria_id);set('prod-unidad',p.unidad);set('prod-precio-normal',p.precio_normal);set('prod-precio-mayorista',p.precio_mayorista);
      var b=document.getElementById('prod-submit-btn');if(b)b.textContent='Guardar producto';
      window.__BC171_open();
    };
    return true;
  }
  function schedule(){[0,300,800,1500,3000,5000].forEach(function(ms){setTimeout(boot,ms)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  window.__BC173_verify=function(){return{modalOpen:typeof window.__BC171_open==='function',editFunction:typeof window.iniciarEdicionProducto==='function'}};
})();