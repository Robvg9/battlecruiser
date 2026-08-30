// BattleCruiser — M45.1: acabado final de Reportes
(function(){
  'use strict';
  if(window.__bcM45ReportesUx)return;
  window.__bcM45ReportesUx=true;

  function boot(){
    const tab=document.getElementById('tab-reportes');
    if(!tab)return;
    const aplicar=tab.querySelector('#rep-aplicar-btn');
    if(aplicar)aplicar.textContent='Generar reporte';
    const limpiar=tab.querySelector('#rep-limpiar-btn');
    if(limpiar)limpiar.textContent='Limpiar';
    const conn=tab.querySelector('#reportes-conn-info');
    if(conn && !conn.dataset.bcM45Hint)conn.dataset.bcM45Hint='1';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){boot();setTimeout(boot,600)});else{boot();setTimeout(boot,600)}
})();
