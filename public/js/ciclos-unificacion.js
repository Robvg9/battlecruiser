// BattleCruiser M21 — compatibilidad de navegación.
// El backend conserva los nombres técnicos ciclo/sesión; la UI visible la gobierna M21 como Turnos.
(function(){
  'use strict';
  function bridge(){
    if(window.BattleCruiserM21&&typeof window.BattleCruiserM21.home==='function'){
      window.refrescarCiclos=window.BattleCruiserM21.home;
      window.refrescarTurnos=window.BattleCruiserM21.home;
      return true;
    }
    return false;
  }
  function init(){
    if(bridge())return;
    let n=0;
    const timer=setInterval(function(){if(bridge()||++n>100)clearInterval(timer)},50);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
