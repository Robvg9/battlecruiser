// BattleCruiser — 16.1: Importar Excel / CSV debe abrir el importador real.
(function(){
  'use strict';
  if(window.__BC161)return;window.__BC161=true;
  function bind(){
    var targets=[].slice.call(document.querySelectorAll('button')).filter(function(b){
      return /importar\s+(excel\s*\/\s*csv|productos)/i.test((b.textContent||'').trim());
    });
    var real=document.getElementById('bc-m55-open');
    if(!real || typeof real.click!=='function') return false;
    targets.forEach(function(b){
      if(b===real || b.dataset.bc161==='1')return;
      b.dataset.bc161='1';
      b.addEventListener('click',function(e){
        e.preventDefault();e.stopPropagation();
        real.click();
      },true);
    });
    return targets.length>0;
  }
  function boot(){bind();setTimeout(bind,250);setTimeout(bind,800);setTimeout(bind,1500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC161_verify=function(){
    var real=document.getElementById('bc-m55-open');
    var targets=[].slice.call(document.querySelectorAll('button')).filter(function(b){return /importar\s+(excel\s*\/\s*csv|productos)/i.test((b.textContent||'').trim())});
    return {realImporterPresent:!!real,buttonsBound:targets.filter(function(b){return b.dataset.bc161==='1'}).length,totalMatchingButtons:targets.length};
  };
})();
