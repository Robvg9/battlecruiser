// BattleCruiser — 17.4: las sesiones de Tarde deben ser visibles en el expediente
(function(){
  'use strict';
  if(window.__BC174)return; window.__BC174=true;
  function boot(){
    var hub=window.__BC_M33,api=window.BattleCruiserTurnoAPI;
    if(!hub||typeof hub.open!=='function'||!api||typeof api.obtenerExpedienteTurno!=='function')return false;
    if(hub.open.__bc174)return true;
    var old=hub.open;
    async function wrapped(id){
      var r=await old.apply(this,arguments);
      try{
        var body=document.getElementById('m33-bg')?.querySelector('.m33-body');
        if(!body)return r;
        if(body.querySelector('[data-bc174-tarde]'))return r;
        var raw=await api.obtenerExpedienteTurno(id),exp=Array.isArray(raw)?(raw[0]||{}):(raw||{}),ss=Array.isArray(exp.sesiones)?exp.sesiones:[];
        var tarde=ss.filter(function(s){var b=String(s.bloque||s.turno||s.periodo||'').toUpperCase();return /TAR|PM/.test(b);});
        if(!tarde.length)return r;
        var host=document.createElement('div');host.className='bc14-turnos';host.setAttribute('data-bc174-tarde','1');
        host.innerHTML='<section class="bc14-turnos-sec"><h4>Tarde</h4>'+tarde.map(function(s){
          var usr=s.usuario_nombre||s.nombre_usuario||'Sin asignar';
          return '<div class="bc14-turno-row"><span>Día '+String(s.numero_dia||'—')+' · '+String(s.fecha||'')+' · '+String(usr)+'</span><span>'+String(s.estado||'PENDIENTE')+'</span></div>';
        }).join('')+'</section>';
        body.appendChild(host);
      }catch(e){console.warn('[BC174] tarde visible',e);}
      return r;
    }
    wrapped.__bc174=true;hub.open=wrapped;return true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){[0,300,800,1500,3000].forEach(function(ms){setTimeout(boot,ms);});},{once:true});else [0,300,800,1500,3000].forEach(function(ms){setTimeout(boot,ms);});
  window.__BC174_verify=function(){return{patched:!!(window.__BC_M33&&window.__BC_M33.open&&window.__BC_M33.open.__bc174)}};
})();