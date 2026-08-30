// BattleCruiser — M50.3: orden determinista de la Parte 1 del expediente
(function(){
  'use strict';
  if(window.__bcM50TurnoOrderV3)return;
  window.__bcM50TurnoOrderV3=true;

  function findStep1(){
    return document.querySelector('.m33-modal .m33-body[data-m33-step="1"]');
  }
  function findSessionsGrid(body){
    return body && body.querySelector(':scope > .m49-session-grid, :scope > .bc-m48-grid, :scope > .m46-session-columns');
  }
  function findSessionsHeading(body){
    if(!body)return null;
    const els=[...body.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    return els.find(el=>String(el.textContent||'').trim().toLowerCase()==='sesiones')||null;
  }
  function reorder(){
    const body=findStep1();
    if(!body)return false;
    const grid=findSessionsGrid(body);
    const heading=findSessionsHeading(body);
    if(!grid||!heading)return false;
    if(heading.nextElementSibling!==grid){
      heading.insertAdjacentElement('afterend',grid);
    }
    return heading.nextElementSibling===grid;
  }
  function boot(){
    const run=()=>reorder();
    const obs=new MutationObserver(run);
    obs.observe(document.body,{childList:true,subtree:true});
    window.__BC_M50_OBS_V3=obs;
    run();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();