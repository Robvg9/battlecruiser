// BattleCruiser — M52.1: sincronización de sesión para Movimientos
// Corrige el caso en que M51 consulta antes de que la sesión autenticada esté lista.
(function(){
  'use strict';
  if(window.__bcM52MovimientosAuthRetry)return;
  window.__bcM52MovimientosAuthRetry=true;

  let lastUserId=null;
  let retryInFlight=false;
  let lastRetryKey='';
  let observer=null;

  function getClient(){
    return window.client && window.client.auth ? window.client : null;
  }
  function movementTab(){
    const el=document.getElementById('tab-movimientos');
    return el && document.body.contains(el) ? el : null;
  }
  async function getUserId(){
    const c=getClient();
    if(!c) return null;
    try{
      const r=await c.auth.getSession();
      return r && r.data && r.data.session && r.data.session.user
        ? String(r.data.session.user.id)
        : null;
    }catch(_){ return null; }
  }
  async function retryAfterAuth(reason){
    if(retryInFlight)return;
    const tab=movementTab();
    if(!tab || !tab.classList.contains('visible'))return;

    const uid=await getUserId();
    if(!uid)return;

    const btn=document.getElementById('mov-retry-btn');
    if(!btn)return;

    const key=uid+'|'+reason;
    if(lastRetryKey===key)return;
    lastRetryKey=key;
    retryInFlight=true;
    try{
      btn.click();
    }finally{
      setTimeout(()=>{retryInFlight=false;},500);
    }
  }
  function schedule(reason){
    setTimeout(()=>retryAfterAuth(reason),0);
  }
  async function bind(){
    const c=getClient();
    if(!c)return;

    try{
      const r=await c.auth.getSession();
      const uid=r && r.data && r.data.session && r.data.session.user
        ? String(r.data.session.user.id)
        : null;
      lastUserId=uid;
    }catch(_){ lastUserId=null; }

    if(typeof c.auth.onAuthStateChange==='function'){
      c.auth.onAuthStateChange((event,session)=>{
        const uid=session && session.user ? String(session.user.id) : null;
        if(event==='SIGNED_OUT' || !uid){
          lastUserId=null;
          lastRetryKey='';
          return;
        }
        const changed=uid!==lastUserId;
        lastUserId=uid;
        schedule(changed?'auth-user-ready':'auth-refresh');
      });
    }

    window.addEventListener('online',()=>{lastRetryKey='';schedule('online');});
    window.addEventListener('pageshow',()=>{lastRetryKey='';schedule('pageshow');});

    const attachObserver=()=>{
      const tab=movementTab();
      if(!tab || observer)return;
      observer=new MutationObserver(()=>{
        const btn=document.getElementById('mov-retry-btn');
        if(btn) schedule('error-rendered');
      });
      observer.observe(tab,{childList:true,subtree:true});
      window.__BC_M52_MOV_OBSERVER=observer;
    };
    attachObserver();
    if(!observer){
      const rootObs=new MutationObserver(()=>{
        attachObserver();
        if(observer)rootObs.disconnect();
      });
      rootObs.observe(document.body,{childList:true,subtree:true});
      window.__BC_M52_ROOT_OBSERVER=rootObs;
    }
    schedule('initial');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',bind,{once:true});
  }else{
    bind();
  }
})();