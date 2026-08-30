// BattleCruiser — M36: asignaciones Turno, layout Mañana/Tarde y offline-first
(function(){
  'use strict';
  if(window.__bcM36AsignacionesOffline)return;
  window.__bcM36AsignacionesOffline=true;
  const QUEUE_KEY='bc_turnos_asignaciones_pendientes_v1';
  let syncing=false;
  function readQueue(){try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')}catch(e){return[]}}
  function writeQueue(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q))}catch(e){console.warn('[M36] no se pudo guardar cola offline',e)}}
  function uid(){return 'asg_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
  function esc(v){return String(v==null?'':v).replace(/[&<>\\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;',"'":'&#39;'}[c]))}
  function api(){return window.BattleCruiserTurnoAPI}
  function isOffline(){return navigator.onLine===false}
  function syncQueue(){
    if(syncing||isOffline())return;
    const q=readQueue(); if(!q.length)return;
    const a=api(); if(!a||typeof a.asignarSesion!=='function')return;
    syncing=true;
    (async()=>{
      const remain=[];
      for(const item of q){
        try{
          await a.asignarSesion(item.sesionId,item.usuarioId);
        }catch(e){
          remain.push(item);
        }
      }
      writeQueue(remain); syncing=false;
      if(!remain.length) window.dispatchEvent(new CustomEvent('bc:turnos-sync-ok'));
      else window.dispatchEvent(new CustomEvent('bc:turnos-sync-pendiente',{detail:{count:remain.length}}));
    })();
  }
  function queueAssignment(sesionId,usuarioId){
    const q=readQueue();
    const idx=q.findIndex(x=>String(x.sesionId)===String(sesionId));
    const item={id:uid(),sesionId,usuarioId,createdAt:new Date().toISOString()};
    if(idx>=0)q[idx]=item;else q.push(item);
    writeQueue(q);
    return item;
  }
  function pendingFor(sesionId){return readQueue().find(x=>String(x.sesionId)===String(sesionId))||null}
  function notify(msg,ok){
    let el=document.getElementById('m36-msg');
    if(!el){
      el=document.createElement('div');el.id='m36-msg';el.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:11000;padding:10px 14px;border-radius:10px;font-size:.84rem;box-shadow:0 8px 30px rgba(0,0,0,.35);background:rgba(20,24,30,.96);color:'+(ok?'#86efac':'#fde68a');el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);
    }else{el.textContent=msg;setTimeout(()=>el.remove(),2600)}
  }
  function layout(){
    const modal=document.querySelector('.m33-modal'); if(!modal)return;
    if(document.getElementById('m36-layout-css'))return;
    const s=document.createElement('style');s.id='m36-layout-css';s.textContent=`.m33-modal [data-m33-step="2"]{display:grid;grid-template-columns:1fr 1fr;gap:12px}.m33-modal [data-m33-step="2"]>.m33-session{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:11px;margin:0}.m33-modal [data-m33-step="2"]>.m33-session label{font-weight:600}.m33-modal [data-m33-step="2"] .m36-offline{font-size:.72rem;opacity:.7;margin-top:5px}.m33-modal [data-m33-step="2"] select{min-height:38px}@media(max-width:700px){.m33-modal [data-m33-step="2"]{grid-template-columns:1fr}}`;document.head.appendChild(s);
  }
  function locateStep2(){
    const sels=[...document.querySelectorAll('.m33-modal select[data-m33-sid]')];
    if(!sels.length)return;
    const body=sels[0].closest('.m33-body');
    if(body)body.setAttribute('data-m33-step','2');
    sels.forEach(sel=>{
      if(sel.dataset.m36Ready==='1')return;
      const p=pendingFor(sel.dataset.m33Sid);
      if(p){sel.value=String(p.usuarioId);}
      sel.dataset.m36Ready='1';
      const host=sel.parentElement;
      if(host&&!host.querySelector('.m36-offline')){
        const tag=document.createElement('div');tag.className='m36-offline';tag.textContent=p?'Pendiente de sincronización':'Cambios se sincronizan al recuperar Internet';host.appendChild(tag);
      }
    });
    layout();
  }
  async function save(e,button){
    const sels=[...document.querySelectorAll('.m33-modal select[data-m33-sid]')];
    if(!sels.length)return false;
    button.disabled=true;
    const assignments=sels.filter(s=>s.value).map(s=>({sesionId:s.dataset.m33Sid,usuarioId:s.value}));
    const a=api();
    try{
      if(isOffline()){
        assignments.forEach(x=>queueAssignment(x.sesionId,x.usuarioId));
        assignments.forEach(x=>{
          const s=document.querySelector('select[data-m33-sid="'+CSS.escape(x.sesionId)+'"]');
          if(s){s.dispatchEvent(new Event('change',{bubbles:true}));const host=s.parentElement,tag=host&&host.querySelector('.m36-offline');if(tag)tag.textContent='Pendiente de sincronización';}
        });
        notify('Asignaciones guardadas localmente. Se sincronizarán al volver Internet.',true);
        button.disabled=false; return true;
      }
      if(!a||typeof a.asignarSesion!=='function')throw new Error('API de asignación no disponible.');
      const failures=[];
      for(const x of assignments){try{await a.asignarSesion(x.sesionId,x.usuarioId)}catch(err){failures.push({x,err});}}
      if(failures.length){failures.forEach(f=>queueAssignment(f.x.sesionId,f.x.usuarioId));notify('Guardado parcial. '+failures.length+' quedo pendiente de sincronización.',false)}
      else notify('Asignaciones guardadas correctamente.',true);
      assignments.forEach(x=>{const s=document.querySelector('select[data-m33-sid="'+CSS.escape(x.sesionId)+'"]');const tag=s&&s.parentElement&&s.parentElement.querySelector('.m36-offline');if(tag)tag.textContent=failures.some(f=>String(f.x.sesionId)===String(x.sesionId))?'Pendiente de sincronización':'Sincronizado';});
      button.disabled=false; return true;
    }catch(err){notify(String(err&&err.message||err),false);button.disabled=false;return true}
  }
  function intercept(){
    document.addEventListener('click',function(e){
      const b=e.target.closest('.m33-modal button'); if(!b)return;
      const txt=String(b.textContent||'').trim().toLowerCase();
      if(txt!=='guardar asignaciones')return;
      e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();save(e,b);
    },true);
  }
  function boot(){
    intercept();
    const obs=new MutationObserver(()=>locateStep2());obs.observe(document.body,{childList:true,subtree:true});window.__BC_M36_OBS=obs;
    window.addEventListener('online',syncQueue);window.addEventListener('pageshow',syncQueue);window.addEventListener('bc:turnos-sync-ok',()=>notify('Asignaciones sincronizadas con Supabase.',true));
    locateStep2();syncQueue();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  window.__BC_M36={queue:readQueue,sync:syncQueue};
})();