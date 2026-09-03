// BattleCruiser — 17.9: protección contra doble confirmación de venta
(function(){
  'use strict';
  if(window.__BC179)return;window.__BC179=true;
  var locked=false;
  function boot(){
    var btn=document.getElementById('btn-confirmar-venta');if(!btn)return false;
    if(btn.dataset.bc179==='1')return true;btn.dataset.bc179='1';
    btn.addEventListener('click',function(e){
      if(locked){e.preventDefault();e.stopImmediatePropagation();return;}
      locked=true;btn.disabled=true;btn.dataset.bc179Busy='1';
      setTimeout(function(){locked=false;btn.disabled=false;btn.dataset.bc179Busy='0';},12000);
    },true);
    return true;
  }
  [0,300,800,1500,3000,5000].forEach(function(ms){setTimeout(boot,ms)});
  window.__BC179_verify=function(){var b=document.getElementById('btn-confirmar-venta');return{bound:!!(b&&b.dataset.bc179==='1')}};
})();