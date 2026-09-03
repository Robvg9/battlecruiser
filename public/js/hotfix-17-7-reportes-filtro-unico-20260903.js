// BattleCruiser — 17.7: un solo bloque de filtros en Información detallada
(function(){
  'use strict';
  if(window.__BC177)return;window.__BC177=true;
  function normalize(){
    var tab=document.getElementById('tab-reportes');if(!tab)return false;
    var detail=tab.querySelector('.bc-m42-detail');
    var body=detail&&detail.querySelector('.bc-m42-detail-body');
    var filters=Array.from(tab.querySelectorAll('.bc-m42-filters,#reportes-filtros'));
    if(!filters.length)return false;
    var canonical=filters.find(function(x){return x.classList.contains('bc-m42-filters');})||filters[0];
    if(body&&canonical.parentElement!==body)body.insertBefore(canonical,body.firstChild);
    filters.forEach(function(f){
      if(f!==canonical){f.style.display='none';f.setAttribute('aria-hidden','true');f.dataset.bc177Hidden='1';}
      else{f.style.removeProperty('display');f.removeAttribute('aria-hidden');f.dataset.bc177Canonical='1';}
    });
    if(canonical.classList.contains('bc-m42-filters'))canonical.removeAttribute('hidden');
    return true;
  }
  function boot(){normalize();var tab=document.getElementById('tab-reportes');if(!tab)return;var obs=new MutationObserver(function(){normalize();});obs.observe(tab,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,300);setTimeout(normalize,1000);setTimeout(normalize,2500);},{once:true});else{setTimeout(boot,300);setTimeout(normalize,1000);setTimeout(normalize,2500);}
  window.__BC177_verify=function(){var fs=Array.from(document.querySelectorAll('#tab-reportes .bc-m42-filters,#tab-reportes #reportes-filtros'));return{count:fs.length,hidden:fs.filter(function(f){return f.dataset.bc177Hidden==='1'||getComputedStyle(f).display==='none'}).length,canonical:fs.filter(function(f){return f.dataset.bc177Canonical==='1'}).length}};
})();