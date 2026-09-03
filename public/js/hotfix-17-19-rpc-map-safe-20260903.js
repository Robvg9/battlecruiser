// BattleCruiser — 17.19: ensure presentation RPC mapping before importer runs
(function(){
  'use strict';
  if(window.__BC1719)return; window.__BC1719=true;
  function apply(){
    try{
      if(window.RPC_POR_TIPO && typeof window.RPC_POR_TIPO === 'object'){
        window.RPC_POR_TIPO.presentacion='crear_presentacion';
        return true;
      }
    }catch(e){}
    return false;
  }
  apply(); [300,800,1500,3000].forEach(function(ms){setTimeout(apply,ms);});
  window.__BC1719_verify=function(){return !!(window.RPC_POR_TIPO&&window.RPC_POR_TIPO.presentacion==='crear_presentacion')};
})();
