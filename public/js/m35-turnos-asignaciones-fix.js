// BattleCruiser — M35 fix asignaciones Turnos
(function(){
'use strict';
if(window.__bcM35AsignacionesFix)return;window.__bcM35AsignacionesFix=true;
function clientOk(){return typeof client!=='undefined'&&client&&typeof client.rpc==='function'}
function normalize(r){if(!r)return[];if(Array.isArray(r))return r;if(Array.isArray(r.data))return r.data;if(Array.isArray(r.items))return r.items;return[r]}
async function cargarUsuarios(){
  if(!clientOk())return;
  try{
    const r=await client.rpc('listar_usuarios_admin',{p_incluir_archivados:false});
    if(r&&r.error)throw r.error;
    const rows=normalize(r.data).filter(u=>u&&u.activo===true&&u.archivado!==true&&String(u.rol||'').toLowerCase()==='dependienta');
    window._cache=window._cache||{};
    window._cache.usuarios=rows;
    window.__BC_M35_USERS=rows;
    hidratarSelects();
  }catch(e){console.warn('[M35] no se pudieron cargar dependientas',e)}
}
function hidratarSelects(){
  const rows=window.__BC_M35_USERS||[];
  if(!rows.length)return;
  document.querySelectorAll('select[data-m33-sid]').forEach(sel=>{
    const current=sel.value;
    const first='<option value="">Sin asignar aún</option>';
    sel.innerHTML=first+rows.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nombre||u.id)+'</option>').join('');
    if(current)sel.value=current;
  });
}
function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function boot(){
  cargarUsuarios();
  const obs=new MutationObserver(()=>{hidratarSelects()});
  obs.observe(document.body,{childList:true,subtree:true});
  window.__BC_M35_OBSERVER=obs;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
