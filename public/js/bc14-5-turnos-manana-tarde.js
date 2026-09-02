(function(){
'use strict';
if(window.__BC145)return;window.__BC145=true;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
function install(){
 var hub=window.__BC_M33,api=window.BattleCruiserTurnoAPI;
 if(!hub||typeof hub.open!=='function'||!api||typeof api.obtenerExpedienteTurno!=='function'||hub.open.__bc145)return false;
 var old=hub.open;
 async function wrapped(id){
  var r=await old.apply(this,arguments);
  try{
   var raw=await api.obtenerExpedienteTurno(id),exp=Array.isArray(raw)?(raw[0]||{}):(raw||{}),ss=Array.isArray(exp.sesiones)?exp.sesiones:[];
   var body=document.getElementById('m33-bg')&&document.getElementById('m33-bg').querySelector('.m33-body');
   if(!body)return r;
   var host=body.querySelector('[data-bc14-turnos]');
   if(!host){host=document.createElement('div');host.setAttribute('data-bc14-turnos','1');host.className='bc14-turnos';body.appendChild(host);}
   var man=[],tar=[];
   ss.forEach(function(s){var b=String(s.bloque||s.turno||s.periodo||'').toUpperCase();(b.indexOf('TAR')>=0||b.indexOf('PM')>=0?tar:man).push(s);});
   function section(t,rows){return '<section class="bc14-turnos-sec"><h4>'+t+'</h4>'+(rows.length?rows.map(function(s){return '<div class="bc14-turno-row"><span>Día '+esc(s.numero_dia)+' · '+esc(s.fecha||'')+' · '+esc(s.usuario_nombre||'Sin asignar')+'</span><span>'+esc(s.estado||'PENDIENTE')+'</span></div>';}).join(''):'<div class="muted">Sin sesiones</div>')+'</section>';}
   host.innerHTML=section('Mañana',man)+section('Tarde',tar);
  }catch(e){console.warn('[BC] sesiones mañana/tarde',e);}
  return r;
 }
 wrapped.__bc145=true;hub.open=wrapped;return true;
}
function boot(){if(install())return;[200,500,1000,2000,4000].forEach(function(ms){setTimeout(install,ms);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
