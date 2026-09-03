(function(){
'use strict';
if(window.__BC145)return;window.__BC145=true;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
function isAdmin(){try{var u=window._usuarioActual||window.__bcUser||{};var r=String(u.rol||u.role||u.nombre_rol||'').toLowerCase();return ['dueno','dueño','owner','admin','administrador'].indexOf(r)>=0||(typeof window.tienePermiso==='function'&&(window.tienePermiso('turnos','editar_any')||window.tienePermiso('ciclos','editar_any')||window.tienePermiso('usuarios','editar')));}catch(_){return false;}}
async function sesionesAutorizadas(id,sesiones){
 if(isAdmin())return sesiones;
 var uid=window._usuarioActualId||((window._usuarioActual||{}).id);
 if(!uid||typeof client==='undefined'||!client)return sesiones.filter(function(s){return String(s.usuario_id||'')===String(uid);});
 try{
  var q=await client.from('turno_asignaciones').select('turno_sesion_id').eq('turno_id',id).eq('usuario_id',uid).is('retirado_at',null);
  if(q.error)throw q.error;
  var ids=new Set((q.data||[]).map(function(x){return x.turno_sesion_id;}));
  return sesiones.filter(function(s){return ids.has(s.id)||String(s.usuario_id||'')===String(uid);});
 }catch(e){
  console.warn('[BC] asignaciones tarde',e);
  return sesiones.filter(function(s){return String(s.usuario_id||'')===String(uid);});
 }
}
function install(){
 var hub=window.__BC_M33,api=window.BattleCruiserTurnoAPI;
 if(!hub||typeof hub.open!=='function'||!api||typeof api.obtenerExpedienteTurno!=='function'||hub.open.__bc145)return false;
 var old=hub.open;
 async function wrapped(id){
  var r=await old.apply(this,arguments);
  try{
   var body=document.getElementById('m33-bg')&&document.getElementById('m33-bg').querySelector('.m33-body');
   if(!body)return r;
   if(Array.from(body.querySelectorAll('.m33-session,.bc14-turnos')).some(function(x){return /Tarde/i.test(x.textContent||'');}))return r;
   var raw=await api.obtenerExpedienteTurno(id),exp=Array.isArray(raw)?(raw[0]||{}):(raw||{}),ss=Array.isArray(exp.sesiones)?exp.sesiones:[];
   var tar=ss.filter(function(s){var b=String(s.bloque||s.turno||s.periodo||'').toUpperCase();return b.indexOf('TAR')>=0||b.indexOf('PM')>=0;});
   tar=await sesionesAutorizadas(id,tar);
   if(!tar.length)return r;
   var host=document.createElement('div');host.setAttribute('data-bc14-turnos','1');host.className='bc14-turnos';
   host.innerHTML='<section class="bc14-turnos-sec"><h4>Tarde</h4>'+tar.map(function(s){return '<div class="bc14-turno-row"><span>Día '+esc(s.numero_dia)+' · '+esc(s.fecha||'')+' · '+esc(s.usuario_nombre||'Sin asignar')+'</span><span>'+esc(s.estado||'PENDIENTE')+'</span></div>';}).join('')+'</section>';
   body.appendChild(host);
  }catch(e){console.warn('[BC] recuperación turno tarde',e);}
  return r;
 }
 wrapped.__bc145=true;hub.open=wrapped;return true;
}
function boot(){if(install())return;[200,500,1000,2000,4000].forEach(function(ms){setTimeout(install,ms);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();