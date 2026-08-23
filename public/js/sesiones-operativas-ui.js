// BattleCruiser — Sesiones Operativas UI
// Extiende la UI existente de Ciclos sin crear un segundo sistema de turnos.
// Fuente de verdad backend: iniciar_sesion_operativa / cerrar_sesion_operativa.
(function(){
  'use strict';
  const RPC_INICIAR='iniciar_sesion_operativa';
  const RPC_CERRAR='cerrar_sesion_operativa';
  let inicializado=false, observador=null, procesando=false;
  function key(){return crypto.randomUUID();}
  function esc(v){return typeof escHtml==='function'?escHtml(v==null?'':v):String(v==null?'':v);}
  function msg(text,ok){const el=document.getElementById('msg-sesiones-operativas');if(!el)return;el.textContent=text;el.className='msg '+(ok?'ok':'error');}
  function permisosCrear(){return typeof tienePermiso==='function'&&tienePermiso('ciclos','crear');}
  function permisosEditar(){return typeof tienePermiso==='function'&&tienePermiso('ciclos','editar');}
  function cicloIdActual(){const det=document.getElementById('ciclo-detalle');if(!det)return null;const el=det.querySelector('[data-id]');return el?el.getAttribute('data-id'):null;}
  function yaProcesado(det){const lis=Array.from(det.querySelectorAll('li.muted'));return lis.length>0&&lis.every(li=>li.dataset.bcSesionUi==='1');}
  async function cargarSesiones(cicloId){if(!cicloId||!navigator.onLine)return [];const r=await client.rpc('listar_sesiones_operativas',{p_ciclo_id:cicloId,p_almacen_id:null,p_fecha:null,p_estado:null});if(r&&r.error)throw r.error;const d=r?r.data:[];return Array.isArray(d)?d:(d?[d]:[]);}
  async function mutar(rpc,sesionId){if(!navigator.onLine)throw new Error('Las sesiones operativas requieren Internet.');const r=await client.rpc(rpc,{p_sesion_id:sesionId,p_idempotency_key:key(),p_observacion:null});if(r&&r.error)throw r.error;return r?r.data:null;}
  async function abrirSesion(id,btn){if(!permisosCrear()){msg('No tenés permiso para abrir sesiones.',false);return;}if(btn)btn.disabled=true;try{await mutar(RPC_INICIAR,id);msg('✓ Sesión abierta. Ya podés trabajar y registrar ventas.',true);const cid=cicloIdActual();if(cid&&typeof mostrarDetalleCiclo==='function')await mostrarDetalleCiclo(cid);}catch(e){msg('No se pudo abrir la sesión: '+String(e&&(e.message||e.details||e.code)||e),false);}finally{if(btn)btn.disabled=false;}}
  async function cerrarSesion(id,btn){if(!permisosEditar()){msg('No tenés permiso para cerrar sesiones.',false);return;}if(!window.confirm('¿Cerrar esta sesión de trabajo? Al cerrarla ya no quedará disponible para registrar nuevas ventas en esta sesión.'))return;if(btn)btn.disabled=true;try{await mutar(RPC_CERRAR,id);msg('✓ Sesión cerrada.',true);const cid=cicloIdActual();if(cid&&typeof mostrarDetalleCiclo==='function')await mostrarDetalleCiclo(cid);}catch(e){msg('No se pudo cerrar la sesión: '+String(e&&(e.message||e.details||e.code)||e),false);}finally{if(btn)btn.disabled=false;}}
  async function mejorarDetalle(){
    if(procesando)return;const det=document.getElementById('ciclo-detalle');if(!det||yaProcesado(det))return;
    const cicloId=cicloIdActual();if(!cicloId)return;procesando=true;
    try{
      const sesiones=await cargarSesiones(cicloId);if(!sesiones.length)return;
      const byKey=new Map(sesiones.map(s=>[String(s.dia_n)+'|'+String(s.bloque),s]));
      const cicloActivo=!!det.querySelector('#btn-iniciar-validacion');
      det.querySelectorAll('li.muted').forEach(function(li){
        if(li.dataset.bcSesionUi==='1')return;const text=li.textContent||'';const m=text.match(/Día\s+([^·]+)\s+·\s+([^·]+)\s+·\s+([^·]+)\s+·\s+(.+)$/);if(!m)return;
        const s=byKey.get(m[1].trim()+'|'+m[2].trim());if(!s||!s.id)return;const estado=String(s.estado||m[4].trim());
        li.dataset.bcSesionUi='1';li.dataset.sesionId=s.id;li.innerHTML='<span>Día '+esc(s.dia_n)+' · '+esc(s.bloque)+' · '+esc(s.fecha||'')+' · <strong>'+esc(estado)+'</strong></span>';
        const actions=document.createElement('span');actions.className='btn-row bc-sesion-acciones';actions.style.cssText='display:inline-flex;gap:6px;margin-left:8px;flex-wrap:wrap;';
        if(estado==='PENDIENTE'&&cicloActivo&&permisosCrear()){const b=document.createElement('button');b.type='button';b.className='cc-accion';b.dataset.bcSesionAbrir=s.id;b.textContent='Abrir sesión';actions.appendChild(b);}
        else if(estado==='EN_CURSO'&&permisosEditar()){const b=document.createElement('button');b.type='button';b.className='cc-accion';b.dataset.bcSesionCerrar=s.id;b.textContent='Cerrar sesión';actions.appendChild(b);}
        else if(estado==='COMPLETADA'){const span=document.createElement('span');span.className='muted';span.textContent='Sesión finalizada';actions.appendChild(span);}
        if(actions.childNodes.length)li.appendChild(actions);
      });
      let m=document.getElementById('msg-sesiones-operativas');if(!m){m=document.createElement('p');m.id='msg-sesiones-operativas';m.className='msg';det.appendChild(m);}
    }finally{procesando=false;}
  }
  function init(){if(inicializado)return;const det=document.getElementById('ciclo-detalle');if(!det)return;inicializado=true;det.addEventListener('click',function(e){const a=e.target.closest('[data-bc-sesion-abrir]');if(a){e.stopPropagation();abrirSesion(a.dataset.bcSesionAbrir,a);return;}const c=e.target.closest('[data-bc-sesion-cerrar]');if(c){e.stopPropagation();cerrarSesion(c.dataset.bcSesionCerrar,c);}});observador=new MutationObserver(function(){mejorarDetalle();});observador.observe(det,{childList:true,subtree:true});mejorarDetalle();}
  function boot(){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();}boot();
})();
