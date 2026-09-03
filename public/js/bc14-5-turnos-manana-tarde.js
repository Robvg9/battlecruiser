(function(){
'use strict';
if(window.__BC145)return;window.__BC145=true;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
function admin(){
 try{
  var u=window._usuarioActual||window.__bcUser||{};var r=String(u.rol||u.role||u.nombre_rol||'').toLowerCase();
  return ['dueno','dueño','owner','admin','administrador'].indexOf(r)>=0 || (typeof window.tienePermiso==='function'&&(window.tienePermiso('turnos','editar_any')||window.tienePermiso('ciclos','editar_any')||window.tienePermiso('usuarios','editar')));
 }catch(_){return false;}
}
function install(){
 var hub=window.__BC_M33,api=window.BattleCruiserTurnoAPI;
 if(!admin()||!hub||typeof hub.open!=='function'||!api||typeof api.obtenerExpedienteTurno!=='function'||hub.open.__bc145)return false;
 var old=hub.open;
 async function wrapped(id){
  var r=await old.apply(this,arguments);
  try{
   var body=document.getElementById('m33-bg')&&document.getElementById('m33-bg').querySelector('.m33-body');
   if(!body)return r;
   var hasTarde=Array.from(body.querySelectorAll('.m33-session')).some(function(x){return /Tarde/i.test(x.textContent||'');});
   if(hasTarde)return r;
   var raw=await api.obtenerExpedienteTurno(id),exp=Array.isArray(raw)?(raw[0]||{}):(raw||{}),ss=Array.isArray(exp.sesiones)?exp.sesiones:[];
   var tar=[];ss.forEach(function(s){var b=String(s.bloque||s.turno||s.periodo||'').toUpperCase();if(b.indexOf('TAR')>=0||b.indexOf('PM')>=0)tar.push(s);});
   if(!tar.length)return r;
   var host=document.createElement('div');host.setAttribute('data-bc14-turnos','1');host.className='bc14-turnos';
   function section(rows){return '<section class="bc14-turnos-sec"><h4>Tarde</h4>'+rows.map(function(s){return '<div class="bc14-turno-row"><span>Día '+esc(s.numero_dia)+' · '+esc(s.fecha||'')+' · '+esc(s.usuario_nombre||'Sin asignar')+'</span><span>'+esc(s.estado||'PENDIENTE')+'</span></div>';}).join('')+'</section>';}
   host.innerHTML=section(tar);body.appendChild(host);
  }catch(e){console.warn('[BC] recuperación turno tarde',e);}
  return r;
 }
 wrapped.__bc145=true;hub.open=wrapped;return true;
}
function boot(){if(install())return;[200,500,1000,2000,4000].forEach(function(ms){setTimeout(install,ms);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
