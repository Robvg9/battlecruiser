// BattleCruiser — M50: orden de la Parte 1 del expediente
(function(){'use strict';if(window.__bcM50TurnoOrder)return;window.__bcM50TurnoOrder=true;
const STYLE='bc-m50-turno-order';
function css(){if(document.getElementById(STYLE))return;const s=document.createElement('style');s.id=STYLE;s.textContent='.m33-modal .m50-step1-spacer{height:0;margin:0;padding:0}';document.head.appendChild(s)}
function reorder(){
  const body=document.querySelector('.m33-modal .m33-body[data-m33-step="1"]');
  if(!body)return;
  const grid=body.querySelector(':scope > .m49-session-grid, :scope > .bc-m48-grid, :scope > .m46-session-columns');
  if(!grid)return;
  const summaries=[...body.querySelectorAll(':scope > .m33-summary')];
  const heading=[...body.children].find(x=>x.tagName==='H4'&&String(x.textContent||'').trim()==='Sesiones');
  const anchor=summaries[summaries.length-1]||null;
  if(anchor){
    if(anchor.nextElementSibling!==grid){
      anchor.insertAdjacentElement('afterend',grid);
    }
  }else if(heading){
    body.insertBefore(grid,heading);
  }
  if(heading && grid.nextElementSibling!==heading)body.insertBefore(heading,grid.nextElementSibling);
}
function boot(){css();const obs=new MutationObserver(reorder);obs.observe(document.body,{childList:true,subtree:true});window.__BC_M50_OBS=obs;reorder()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();