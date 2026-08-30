// BattleCruiser — M46.1: organización inteligente de sesiones del Turno
(function(){
  'use strict';
  if(window.__bcM46TurnosSesiones)return;
  window.__bcM46TurnosSesiones=true;
  const STYLE='bc-m46-turnos-style';
  let working=false;
  function css(){if(document.getElementById(STYLE))return;const s=document.createElement('style');s.id=STYLE;s.textContent=`
    .m33-modal .m46-session-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start;margin-top:10px}
    .m33-modal .m46-session-col{display:flex;flex-direction:column;gap:8px;min-width:0}
    .m33-modal .m46-session-col-title{font-size:.74rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-bright);padding:9px 10px;border:1px solid rgba(212,176,92,.15);background:rgba(212,176,92,.045);border-radius:9px;text-align:center}
    .m33-modal .m46-session-card{margin:0!important;padding:10px 11px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:10px!important;background:rgba(255,255,255,.018)!important;min-width:0!important}
    .m33-modal .m46-session-card label{margin:0 0 6px!important;line-height:1.3!important}
    .m33-modal .m46-session-card select{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
    .m33-modal .m46-block-control{grid-column:1/-1;margin:0 0 4px;padding:10px 12px;border:1px solid rgba(212,176,92,.16);border-radius:10px;background:rgba(212,176,92,.05)}
    .m33-modal .m46-block-label{display:flex!important;align-items:center;gap:8px;font-size:.84rem!important;text-transform:none!important;color:var(--text)!important;margin:0!important;cursor:pointer}
    .m33-modal .m46-block-label input{width:16px;height:16px;flex:0 0 auto}
    .m33-modal .m46-block-hint{margin:4px 0 0 24px;font-size:.7rem;color:var(--mist);line-height:1.35}
    @media(max-width:720px){.m33-modal .m46-session-columns{grid-template-columns:1fr}}
  `;document.head.appendChild(s)}
  function kind(el){return String(el.textContent||'').toUpperCase().includes('TARDE')?'tarde':'manana'}
  function organizeStep(step){
    const body=document.querySelector('.m33-modal .m33-body[data-m33-step="'+step+'"]');
    if(!body||body.dataset.bcM46==='1'||working)return;
    const sessions=[...body.querySelectorAll(':scope > .m33-session')];if(!sessions.length)return;
    working=true;try{
      const grid=document.createElement('div');grid.className='m46-session-columns';
      const man=document.createElement('div');man.className='m46-session-col';
      const tar=document.createElement('div');tar.className='m46-session-col';
      const mt=document.createElement('div');mt.className='m46-session-col-title';mt.textContent='☀️ Mañana';
      const tt=document.createElement('div');tt.className='m46-session-col-title';tt.textContent='🌙 Tarde';
      man.appendChild(mt);tar.appendChild(tt);
      sessions.forEach(el=>{el.classList.add('m46-session-card');(kind(el)==='tarde'?tar:man).appendChild(el)});
      body.insertBefore(grid,sessions[0]);grid.appendChild(man);grid.appendChild(tar);body.dataset.bcM46='1';
      if(step==='2'||step===2)installBlockAssignment(body);
    }finally{working=false}
  }
  function installBlockAssignment(body){
    if(!body||body.dataset.bcM46Block==='1')return;
    const sels=[...body.querySelectorAll('select[data-m33-sid]')];if(!sels.length)return;
    const grid=body.querySelector('.m46-session-columns')||body;
    const box=document.createElement('div');box.className='m46-block-control';
    box.innerHTML='<label class="m46-block-label"><input type="checkbox" id="m46-block-check"> <span>Asignar la misma dependienta en cada bloque</span></label><div class="m46-block-hint">Activado: la dependienta elegida en una sesión de Mañana se replica en todas las Mañanas. Lo mismo ocurre por separado con Tarde.</div>';
    grid.insertBefore(box,grid.firstChild);
    const check=box.querySelector('#m46-block-check');
    let busy=false;
    function applyBlock(source){
      if(!check.checked||busy||!source||!source.value)return;
      busy=true;try{const sourceKind=kind(source.closest('.m46-session-card')||source.closest('.m33-session'));sels.forEach(sel=>{const card=sel.closest('.m46-session-card')||sel.closest('.m33-session');if(kind(card)===sourceKind&&sel.value!==source.value){sel.value=source.value;sel.dispatchEvent(new Event('change',{bubbles:true}))}})}finally{busy=false}
    }
    body.addEventListener('change',function(e){const sel=e.target.closest('select[data-m33-sid]');if(sel)applyBlock(sel)});
    check.addEventListener('change',function(){if(!check.checked)return;['manana','tarde'].forEach(k=>{const s=sels.find(x=>kind(x.closest('.m46-session-card')||x.closest('.m33-session'))===k&&x.value);if(s)applyBlock(s)})});
    body.dataset.bcM46Block='1';
  }
  function boot(){css();const obs=new MutationObserver(()=>{organizeStep(1);organizeStep(2);const body=document.querySelector('.m33-modal .m33-body[data-m33-step="2"]');if(body&&body.dataset.bcM46Block!=='1')installBlockAssignment(body)});obs.observe(document.body,{childList:true,subtree:true});window.__BC_M46_OBS=obs;organizeStep(1);organizeStep(2)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();