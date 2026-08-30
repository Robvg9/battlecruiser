// BattleCruiser — M46: organización inteligente de sesiones del Turno
(function(){
  'use strict';
  if(window.__bcM46TurnosSesiones)return;
  window.__bcM46TurnosSesiones=true;

  const STYLE='bc-m46-turnos-style';
  let working=false;

  function css(){
    if(document.getElementById(STYLE))return;
    const s=document.createElement('style');
    s.id=STYLE;
    s.textContent=`
      .m33-modal .m46-session-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start;margin-top:10px}
      .m33-modal .m46-session-col{display:flex;flex-direction:column;gap:8px;min-width:0}
      .m33-modal .m46-session-col-title{font-size:.74rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-bright);padding:9px 10px;border:1px solid rgba(212,176,92,.15);background:rgba(212,176,92,.045);border-radius:9px;text-align:center}
      .m33-modal .m46-session-card{margin:0!important;padding:10px 11px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:10px!important;background:rgba(255,255,255,.018)!important;min-width:0!important}
      .m33-modal .m46-session-card label{margin:0 0 6px!important;line-height:1.3!important}
      .m33-modal .m46-session-card select{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
      .m33-modal .m46-same-note{font-size:.7rem;color:var(--mist);margin:2px 0 8px;line-height:1.35}
      @media(max-width:720px){.m33-modal .m46-session-columns{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function kind(el){
    const txt=String(el.textContent||'').toUpperCase();
    if(txt.includes('TARDE'))return 'tarde';
    return 'manana';
  }

  function organizeStep(step){
    const body=document.querySelector('.m33-modal .m33-body[data-m33-step="'+step+'"]');
    if(!body || body.dataset.bcM46==='1' || working)return;
    const sessions=[...body.querySelectorAll(':scope > .m33-session')];
    if(!sessions.length)return;
    working=true;
    try{
      const grid=document.createElement('div');grid.className='m46-session-columns';
      const man=document.createElement('div');man.className='m46-session-col';
      const tar=document.createElement('div');tar.className='m46-session-col';
      const manTitle=document.createElement('div');manTitle.className='m46-session-col-title';manTitle.textContent='☀️ Mañana';
      const tarTitle=document.createElement('div');tarTitle.className='m46-session-col-title';tarTitle.textContent='🌙 Tarde';
      man.appendChild(manTitle);tar.appendChild(tarTitle);
      sessions.forEach(el=>{el.classList.add('m46-session-card');(kind(el)==='tarde'?tar:man).appendChild(el)});
      const firstSession=sessions[0];
      body.insertBefore(grid,firstSession);
      grid.appendChild(man);grid.appendChild(tar);
      body.dataset.bcM46='1';
    }finally{working=false}
  }

  function installBlockAssignment(){
    const body=document.querySelector('.m33-modal .m33-body[data-m33-step="2"]');
    if(!body || body.dataset.bcM46Block==='1')return;
    const sels=[...body.querySelectorAll('select[data-m33-sid]')];
    if(!sels.length)return;
    const box=body.querySelector('.m37-same-worker');
    if(!box)return;
    const check=box.querySelector('#m37-same-worker-check');
    if(!check)return;
    const oldHint=box.querySelector('.m37-hint');
    if(oldHint)oldHint.remove();
    let mode=box.querySelector('#m46-same-mode');
    if(!mode){
      const wrap=document.createElement('div');wrap.id='m46-same-mode';wrap.className='m46-same-note';
      wrap.textContent='Activado: la dependienta elegida se replica solo en su bloque (Mañana o Tarde) para todas las sesiones del Turno.';
      box.appendChild(wrap);
    }
    function applyBlock(source){
      if(!check.checked || !source || !source.value)return;
      const sourceKind=String(source.closest('.m33-session')?.textContent||'').toUpperCase().includes('TARDE')?'tarde':'manana';
      sels.forEach(sel=>{
        const k=String(sel.closest('.m33-session')?.textContent||'').toUpperCase().includes('TARDE')?'tarde':'manana';
        if(k===sourceKind && sel.value!==source.value){sel.value=source.value;sel.dispatchEvent(new Event('change',{bubbles:true}))}
      });
    }
    body.addEventListener('change',e=>{
      const sel=e.target.closest('select[data-m33-sid]');
      if(!sel)return;
      if(check.checked)applyBlock(sel);
    });
    check.addEventListener('change',()=>{
      if(!check.checked)return;
      const firstMan=sels.find(s=>!String(s.closest('.m33-session')?.textContent||'').toUpperCase().includes('TARDE')&&s.value);
      const firstTar=sels.find(s=>String(s.closest('.m33-session')?.textContent||'').toUpperCase().includes('TARDE')&&s.value);
      if(firstMan)applyBlock(firstMan);
      if(firstTar)applyBlock(firstTar);
    });
    box.querySelector('.m37-label span').textContent='Asignar la misma dependienta a todas las sesiones de ese bloque';
    body.dataset.bcM46Block='1';
  }

  function boot(){
    css();
    const obs=new MutationObserver(()=>{
      organizeStep(1);organizeStep(2);installBlockAssignment();
    });
    obs.observe(document.body,{childList:true,subtree:true});
    window.__BC_M46_OBS=obs;
    organizeStep(1);organizeStep(2);installBlockAssignment();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();