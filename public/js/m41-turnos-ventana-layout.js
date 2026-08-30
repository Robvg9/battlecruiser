// BattleCruiser — M41.1: ventana de asignaciones organizada por bloque
(function(){
  'use strict';
  if(window.__bcM41TurnosVentana)return;
  window.__bcM41TurnosVentana=true;

  const STYLE_ID='bc-m41-turnos-layout';

  function esc(v){
    return String(v==null?'':v).replace(/[&<>\"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function injectCss(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      .m33-modal .m33-body.bc-m41-assignment-body{padding:18px 20px 20px}
      .bc-m41-assignment-head{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 10px}
      .bc-m41-col-head{padding:9px 12px;border:1px solid rgba(212,176,92,.16);border-radius:10px;background:rgba(212,176,92,.045);font-size:.78rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-bright);text-align:center}
      .bc-m41-assignment-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
      .bc-m41-col{display:flex;flex-direction:column;gap:10px;min-width:0}
      .bc-m41-session{margin:0!important;padding:12px!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:12px!important;background:rgba(255,255,255,.018)!important;min-width:0}
      .bc-m41-session:hover{border-color:rgba(212,176,92,.22)!important;background:rgba(212,176,92,.03)!important}
      .bc-m41-session label{display:block;margin:0 0 7px;font-size:.78rem!important;line-height:1.3}
      .bc-m41-session select{width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
      .bc-m41-session .m36-offline{font-size:.7rem!important;line-height:1.25;margin-top:6px!important}
      .bc-m41-empty{padding:14px;border:1px dashed rgba(255,255,255,.08);border-radius:10px;color:var(--mist);font-size:.78rem;text-align:center}
      @media(max-width:720px){
        .bc-m41-assignment-head{grid-template-columns:1fr}
        .bc-m41-assignment-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(s);
  }

  function sessionKind(el){
    const txt=String(el.textContent||'').toUpperCase();
    if(txt.indexOf('TARDE')!==-1)return 'tarde';
    return 'manana';
  }

  function organize(){
    const body=document.querySelector('.m33-modal .m33-body[data-m33-step="2"]');
    if(!body)return;
    if(body.dataset.bcM41Ready==='1')return;

    const sessions=[...body.querySelectorAll(':scope > .m33-session')];
    if(!sessions.length)return;

    body.classList.add('bc-m41-assignment-body');

    const intro=[...body.children].find(el=>el.classList.contains('m33-muted'));
    const head=document.createElement('div');
    head.className='bc-m41-assignment-head';
    head.innerHTML='<div class="bc-m41-col-head">☀️ Sesiones de mañana</div><div class="bc-m41-col-head">🌙 Sesiones de tarde</div>';

    const grid=document.createElement('div');
    grid.className='bc-m41-assignment-grid';
    const manana=document.createElement('div');
    manana.className='bc-m41-col';
    const tarde=document.createElement('div');
    tarde.className='bc-m41-col';

    sessions.forEach(function(el){
      el.classList.add('bc-m41-session');
      (sessionKind(el)==='tarde'?tarde:manana).appendChild(el);
    });

    if(!manana.children.length)manana.innerHTML='<div class="bc-m41-empty">Sin sesiones de mañana</div>';
    if(!tarde.children.length)tarde.innerHTML='<div class="bc-m41-empty">Sin sesiones de tarde</div>';

    if(intro){body.insertBefore(head,intro);body.insertBefore(grid,intro);}
    else{body.insertBefore(head,body.firstChild);body.insertBefore(grid,head.nextSibling)}
    grid.appendChild(manana);grid.appendChild(tarde);
    if(intro)intro.style.marginBottom='12px';

    body.dataset.bcM41Ready='1';
  }

  function boot(){
    injectCss();
    const obs=new MutationObserver(function(){
      const body=document.querySelector('.m33-modal .m33-body[data-m33-step="2"]');
      if(body && body.dataset.bcM41Ready!=='1')organize();
    });
    obs.observe(document.body,{childList:true,subtree:true});
    window.__BC_M41_OBS=obs;
    organize();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
