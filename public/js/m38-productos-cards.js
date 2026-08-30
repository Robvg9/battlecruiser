// BattleCruiser — M38.2: compatibilidad legacy Productos
// La selección real de vista ahora pertenece a M44.
(function(){
  'use strict';
  if(window.__bcM38ProductosCards)return;
  window.__bcM38ProductosCards=true;
  function mark(){
    const list=document.getElementById('lista-productos');
    if(!list)return;
    [...list.children].forEach(function(item){
      if(!(item instanceof HTMLElement))return;
      item.classList.add('bc-product-card');
      item.querySelectorAll('img').forEach(function(img){
        img.classList.add('bc-product-thumb');
        img.removeAttribute('width');img.removeAttribute('height');
      });
    });
  }
  function boot(){
    mark();
    const list=document.getElementById('lista-productos');
    if(!list||list.dataset.bcM38Obs==='1')return;
    list.dataset.bcM38Obs='1';
    const obs=new MutationObserver(mark);
    obs.observe(list,{childList:true,subtree:true});
    window.__BC_M38_OBS=obs;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,400)});else setTimeout(boot,400);
})();
