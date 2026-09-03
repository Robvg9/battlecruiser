// BattleCruiser — 17.12: eliminar del listado conversaciones de prueba/legacy
(function(){
  'use strict';
  if(window.__BC1712)return;window.__BC1712=true;
  var BAD=/^(chat grupal|almacenero|prueba1|ayudante|prueba|prueba2)$/i;
  function clean(){
    var list=document.getElementById('lista-conversaciones');if(!list)return false;
    list.querySelectorAll('.com-conv-item').forEach(function(item){
      var title=item.querySelector('.com-conv-titulo');var t=(title?.textContent||'').replace(/\s+/g,' ').trim();
      if(BAD.test(t))item.remove();
    });
    return true;
  }
  function boot(){clean();var list=document.getElementById('lista-conversaciones');if(list&&!list.dataset.bc1712){list.dataset.bc1712='1';new MutationObserver(clean).observe(list,{childList:true,subtree:true});}}
  [0,300,800,1500,3000,5000].forEach(function(ms){setTimeout(boot,ms)});
  window.__BC1712_verify=function(){var list=document.getElementById('lista-conversaciones');return{list:!!list,forbidden:!!(list&&Array.from(list.querySelectorAll('.com-conv-titulo')).some(function(e){return BAD.test((e.textContent||'').trim())})),observer:!!(list&&list.dataset.bc1712)}};
})();