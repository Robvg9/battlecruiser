// BattleCruiser M18 — Unificación Turnos + Ciclos.
// El ciclo es el período; la sesión es el turno operativo real (día + mañana/tarde + trabajador).
(function(){
  'use strict';

  function esc(v){
    if(typeof escHtml==='function') return escHtml(v);
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});
  }
  function msg(t,ok){
    var el=document.getElementById('msg-ciclo-detalle');
    if(el){el.textContent=t;el.className='msg '+(ok?'ok':'error');}
  }
  function key(){return crypto.randomUUID();}
  function online(){return navigator.onLine!==false;}

  async function cargarSesiones(cicloId){
    if(!cicloId || !online()) return [];
    try{
      var r=await client.rpc('listar_sesiones_operativas',{p_ciclo_id:cicloId});
      if(r.error) throw r.error;
      return Array.isArray(r.data)?r.data:[];
    }catch(e){
      console.warn('[Battlecruiser] M18 sesiones:',e);
      return [];
    }
  }

  async function renderSesionesUnificadas(){
    var ciclo=window._cicloDetalleActual;
    if(!ciclo || !ciclo.id) return;
    var det=document.getElementById('ciclo-detalle');
    if(!det) return;
    var sesiones=await cargarSesiones(ciclo.id);
    var viejo=det.querySelector('.m18-sesiones-unificadas');
    if(viejo) viejo.remove();
    var box=document.createElement('div');
    box.className='cc-bloque m18-sesiones-unificadas';
    var html='<h4>Sesiones operativas</h4><p class="muted">Estas sesiones sustituyen conceptualmente a los antiguos turnos.</p>';
    if(!sesiones.length){html+='<p class="lista-estado">Sin sesiones.</p>';box.innerHTML=html;det.appendChild(box);return;}
    html+='<div class="lista">';
    sesiones.forEach(function(s){
      var acciones='';
      if(s.estado==='PENDIENTE' && typeof tienePermiso==='function' && tienePermiso('ciclos','crear')){
        acciones='<button type="button" class="cc-accion m18-iniciar" data-id="'+esc(s.id)+'">Abrir sesión</button>';
      } else if(s.estado==='EN_CURSO' && typeof tienePermiso==='function' && tienePermiso('ciclos','editar')){
        acciones='<button type="button" class="cc-accion m18-cerrar" data-id="'+esc(s.id)+'">Cerrar sesión</button>';
      }
      html+='<div class="lista-item rep-fila rep-estado-'+esc(String(s.estado||'').toLowerCase())+'">'
        +'<span class="rep-fila-principal"><span class="cc-asunto-tipo">Día '+esc(s.dia_n)+' · '+esc(s.bloque)+'</span>'
        +'<span class="muted">'+esc(s.fecha||'')+' · '+esc(s.estado||'')+' · '+esc(s.usuario_nombre||'Sin trabajador asignado')+'</span></span>'
        +acciones+'</div>';
    });
    html+='</div>';
    box.innerHTML=html;
    det.appendChild(box);
    box.addEventListener('click',async function(e){
      var b=e.target.closest('.m18-iniciar,.m18-cerrar');
      if(!b) return;
      b.disabled=true;
      try{
        var rpc=b.classList.contains('m18-iniciar')?'iniciar_sesion_operativa':'cerrar_sesion_operativa';
        var r=await client.rpc(rpc,{p_sesion_id:b.dataset.id,p_idempotency_key:key()});
        if(r.error){msg(r.error.message||'No se pudo actualizar la sesión.',false);return;}
        if(typeof marcarConectividadReal==='function') marcarConectividadReal('online');
        msg(b.classList.contains('m18-iniciar')?'✓ Sesión operativa abierta.':'✓ Sesión operativa cerrada.',true);
        if(typeof mostrarDetalleCiclo==='function') await mostrarDetalleCiclo(ciclo.id);
      }catch(err){msg('No se pudo actualizar la sesión.',false);}
      finally{b.disabled=false;if(typeof resetLoadingOverlay==='function')resetLoadingOverlay();}
    });
  }

  function ocultarTurnos(){
    var btn=document.querySelector('.tab-btn[data-tab="turnos"]');
    if(btn) btn.style.display='none';
    var panel=document.getElementById('tab-turnos');
    if(panel) panel.classList.remove('visible');
  }

  function iniciar(){
    ocultarTurnos();
    if(typeof MutationObserver==='function'){
      var target=document.getElementById('ciclo-detalle');
      if(target){
        var obs=new MutationObserver(function(){
          clearTimeout(target.__m18Timer);
          target.__m18Timer=setTimeout(renderSesionesUnificadas,0);
        });
        obs.observe(target,{childList:true,subtree:true});
      }
    }
    window.BattleCruiserM18={renderSesionesUnificadas,cargarSesiones};
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',iniciar,{once:true});
  else iniciar();
})();
