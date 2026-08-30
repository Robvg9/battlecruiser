// BattleCruiser — M35 fix: cargar trabajadoras reales para asignación de sesiones
(function(){
'use strict';
if(window.__bcM35TurnoAsignacionesFix)return;window.__bcM35TurnoAsignacionesFix=true;
const ROOT_ID='ciclos-m18-root';
function root(){return document.getElementById(ROOT_ID)}
function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function normalize(x){if(Array.isArray(x))return x;if(x&&Array.isArray(x.data))return x.data;if(x&&Array.isArray(x.items))return x.items;return x?[x]:[]}
function eligible(list){return list.filter(u=>u&&u.activo!==false&&!u.archivado).filter(u=>{const r=String(u.rol||u.role||u.rol_nombre||'').trim().toLowerCase();return !r||r==='dependienta'||r==='dueño'||r==='dueno'});}
async function loadUsers(){const cached=window._usuariosCache;if(Array.isArray(cached)&&cached.length)return eligible(cached);if(typeof client==='undefined'||!client||!client.rpc)throw Error('Cliente Supabase no disponible.');const r=await client.rpc('listar_usuarios_admin',{p_incluir_archivados:false});if(r&&r.error)throw Error(r.error.message||String(r.error));const list=eligible(normalize(r&&r.data));window._usuariosCache=list;return list;}
async function populate(){const modal=document.getElementById('m33-bg');if(!modal||modal.dataset.m35Populated==='1')return;const selects=[...modal.querySelectorAll('select[data-m33-sid]')];if(!selects.length)return;modal.dataset.m35Populated='1';try{const users=await loadUsers();if(!users.length){selects.forEach(s=>{s.innerHTML='<option value="">No hay trabajadoras activas disponibles</option>';});return;}selects.forEach(s=>{const current=s.value;s.innerHTML='<option value="">Sin asignar aún</option>'+users.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nombre||u.email||u.id)+'</option>').join('');if(current)s.value=current;});}catch(e){modal.dataset.m35PopulateError='1';const p=modal.querySelector('.m33-body');if(p){let n=document.getElementById('m35-assign-error');if(!n){n=document.createElement('p');n.id='m35-assign-error';n.style.cssText='color:#f87171;margin-top:10px;font-size:.85rem';p.appendChild(n)}n.textContent='No se pudieron cargar las trabajadoras: '+(e.message||e)}}}
function boot(){const r=root();if(!r||r.dataset.m35Observer==='1')return;if(r.dataset)m35Observer='1';const obs=new MutationObserver(()=>{const modal=document.getElementById('m33-bg');if(modal&&modal.querySelector('select[data-m33-sid]')&&modal.dataset.m35Populated!=='1')populate()});obs.observe(r,{childList:true,subtree:true});window.__BC_M35_OBSERVER=obs;populate();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,800));else setTimeout(boot,800);
})();
