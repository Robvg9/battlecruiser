// BattleCruiser — 16.2: no mostrar dos acciones que representan la misma plantilla.
(function(){
  'use strict';
  if(window.__BC162)return;window.__BC162=true;
  function limpiar(){
    var nodes=[].slice.call(document.querySelectorAll('#bc149-menu button'));
    var seen={};
    nodes.forEach(function(b){
      var t=(b.textContent||'').trim().toLowerCase();
      if(t==='plantilla xlsx' || t==='plantilla csv'){
        if(seen[t]) b.remove(); else seen[t]=true;
      }
    });
    // La barra antigua de M55 no debe competir con el punto único de herramientas.
    var legacy=document.getElementById('bc-m55-template');
    if(legacy) legacy.hidden=true;
    return true;
  }
  function boot(){limpiar();setTimeout(limpiar,300);setTimeout(limpiar,900);setTimeout(limpiar,1600);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.__BC162_verify=function(){
    var menu=document.getElementById('bc149-menu');
    var vals=menu?[].slice.call(menu.querySelectorAll('button')).map(function(b){return (b.textContent||'').trim()}):[];
    return {templateXlsx:vals.filter(function(v){return v==='Plantilla XLSX'}).length,templateCsv:vals.filter(function(v){return v==='Plantilla CSV'}).length,legacyCsvHidden:!!(document.getElementById('bc-m55-template')||{}).hidden};
  };
})();
