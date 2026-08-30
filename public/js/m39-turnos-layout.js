// BattleCruiser — M39: ventana de asignaciones organizada Mañana/Tarde
(function(){
  'use strict';
  if(window.__bcM39TurnosLayout)return; window.__bcM39TurnosLayout=true;
  const SEL='.m33-modal [data-m33-sid]';
  const up=s=>String(s||'').toUpperCase();
  const isMorning=s=>{const b=up(s.dataset.m39Bloque||s.closest('.m33-session')?.querySelector('label')?.textContent||'');return b.includes('MANANA')||b.includes('MAÑANA')||b.includes('MORNING');};
  function ensure(){
    const sels=[...document.querySelectorAll(SEL)]; if(!sels.length)return;
    const body=sels[0].closest('.m33-body'); if(!body)return;
    let layout=body.querySelector('.m39-session-layout');
    if(!layout){
      const source=sels.map(s=>s.closest('.m33-session')).filter(Boolean); if(!source.length)return;
      layout=document.createElement('div'); layout.className='m39-session-layout';
      layout.innerHTML='<section class="m39-session-col m39-morning"><div class="m39-session-col-head"><span class="m39-session-kicker">01</span><div><h4>Mañana</h4><small>Sesiones de mañana</small></div></div><div class="m39-session-list"></div></section><section class="m39-session-col m39-afternoon"><div class="m39-session-col-head"><span class="m39-session-kicker">02</span><div><h4>Tarde</h4><small>Sesiones de tarde</small></div></div><div class="m39-session-list"></div></section>';
      const anchor=source[0]; anchor.parentNode.insertBefore(layout,anchor);
      source.forEach(card=>{const label=card.querySelector('label'); const text=String(label?.textContent||'').toUpperCase(); const target=(text.includes('MANANA')||text.includes('MAÑANA'))?layout.querySelector('.m39-morning .m39-session-list'):layout.querySelector('.m39-afternoon .m39-session-list'); target.appendChild(card);});
    }
    layout.querySelectorAll('.m39-session-col').forEach(col=>{col.querySelectorAll('.m33-session').forEach((card,i)=>{card.classList.add('m39-session-card'); const label=card.querySelector('label'); if(label)label.classList.add('m39-session-label');});});
    layout.dataset.ready='1';
  }
  function css(){
    if(document.getElementById('m39-css'))return;
    const s=document.createElement('style'); s.id='m39-css'; s.textContent=`.m33-modal [data-m33-step="2"]{display:block!important}.m33-modal [data-m33-step="2"]>.m33-muted{margin:0 0 12px}.m39-session-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-top:12px}.m39-session-col{min-width:0;border:1px solid rgba(212,176,92,.14);border-radius:14px;background:linear-gradient(180deg,rgba(26,56,48,.42),rgba(10,22,19,.44));padding:12px}.m39-session-col-head{display:flex;align-items:center;gap:10px;padding:2px 2px 10px;border-bottom:1px solid rgba(212,176,92,.12);margin-bottom:8px}.m39-session-col-head h4{margin:0;color:var(--text);font-size:14px;font-weight:700}.m39-session-col-head small{display:block;color:var(--mist);font-size:10.5px;margin-top:2px}.m39-session-kicker{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;background:rgba(212,176,92,.10);border:1px solid rgba(212,176,92,.20);color:var(--gold);font-family:'IBM Plex Mono',monospace;font-size:10px}.m39-session-list{display:flex;flex-direction:column;gap:8px}.m33-modal [data-m33-step="2"] .m39-session-card{margin:0!important;padding:11px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:11px!important;background:rgba(8,18,15,.56)!important;min-width:0;box-shadow:none}.m33-modal [data-m33-step="2"] .m39-session-label{display:block!important;margin:0 0 7px!important;font-size:11px!important;line-height:1.35!important;letter-spacing:.04em!important;text-transform:none!important;color:var(--text)!important;white-space:normal}.m33-modal [data-m33-step="2"] .m39-session-card select{width:100%!important;min-width:0!important;height:40px!important;margin-top:0!important;padding:8px 10px!important}.m33-modal .m37-same-worker{grid-column:auto!important;margin-bottom:10px}.m33-modal .m39-session-card>*{min-width:0;max-width:100%}@media(max-width:760px){.m39-session-layout{grid-template-columns:1fr;gap:10px}.m39-session-col{padding:10px}}`;
    document.head.appendChild(s);
  }
  function boot(){css();ensure();const obs=new MutationObserver(()=>ensure());obs.observe(document.body,{childList:true,subtree:true});window.__BC_M39_OBS=obs;}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,150));else setTimeout(boot,150);
})();