// BattleCruiser — M51: orden determinista de la Parte 1 del expediente
(function(){'use strict';if(window.__bcM51TurnoOrder)return;window.__bcM51TurnoOrder=true;
function reorder(){
  const body=document.querySelector('.m33-modal .m33-body[data-m33-step="1"]');
  if(!body)return;
  const grid=body.querySelector(':scope > .m49-session-grid, :scope > .bc-m48-grid, :scope > .m46-session-columns');
  if(!grid)return;
  const summaries=[...body.querySelectorAll(':scope > .m33-summary')];
  const heading=[...body.children].find(x=>x.tagName==='H4'&&String(x.textContent||'').trim()==='Sesiones');
  if(!summaries.length || !heading)return;
  // Preserve every existing information block, but force the intended order.
  const frag=document.createDocumentFragment();
  summaries.forEach(el=>frag.appendChild(el));
  frag.appendChild(heading);
  frag.appendChild(grid);
  body.appendChild(frag);
}
function boot(){
  const obs=new MutationObserver(()=>reorder());
  obs.observe(document.body,{childList:true,subtree:true});
  window.__BC_M51_OBS=obs;
  reorder();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();