// BattleCruiser — 17.18: mapa de operación para presentaciones en cola offline
(function(){
  'use strict';
  if(window.__BC1718)return; window.__BC1718=true;
  function boot(){
    try{
      if(typeof window.RPC_POR_TIPO === 'object' && window.RPC_POR_TIPO){
        window.RPC_POR_TIPO.presentacion='crear_presentacion';
      }
    }catch(e){console.warn('[BC1718] no se pudo registrar RPC de presentacion',e)}
    return true;
  }
  boot();
  window.__BC1718_verify=function(){return !!(window.RPC_POR_TIPO&&window.RPC_POR_TIPO.presentacion==='crear_presentacion')};
})();
