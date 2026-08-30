// BattleCruiser — M35.2 fix asignaciones Turnos
(function(){
'use strict';
if(window.__bcM35AsignacionesFix)return;window.__bcM35AsignacionesFix=true;
let users=[];
function clientOk(){return typeof client!=='undefined'&&client&&typeof client.rpc==='function'}
function normalize(r){if(!r)return[];if(Array.isArray(r))return r;if(Array.isArray(r.data))return r.data;if(Array.isArray(r.items))return r.items;return[r]}
function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
async function cargarUsuarios(){
 if(!clientOk())return;
 try{
  const r=await client.rpc('listar_usuarios_admin',{p_incluir_archivados:false});
  if(r&&r.error)throw r.error;
  users=normalize(r.data).filter(u=>u&&u.activo===true&&u.archivado!==true&&String(u.rol||'').toLowerCase()==='dependienta');
  hydrate();
 }catch(e){console.warn('[M35] no se pudieron cargar dependientas',e)}
}
function hydrate(){
 if(!users.length)return;
 document.querySelectorAll('select[data-m33-sid]').forEach(sel=>{
  if(sel.dataset.m35Hydrated==='1' && sel.options.length===users.length+1)return;
  const current=sel.value;
  const html='<option value="">Sin asignar aún</option>'+users.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nombre||u.id)+'</option>').join('');
  sel.innerHTML=html;
  if(current)sel.value=current;
  sel.dataset.m35Hydrated='1';
 });
}
function boot(){
 cargarUsuarios();
 const obs=new MutationObserver(()=>hydrate());
 obs.observe(document.body,{childList:true,subtree:true});
 window.__BC_M35_OBSERVER=obs;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
