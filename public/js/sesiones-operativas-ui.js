// BattleCruiser — Sesiones Operativas UI
// Extiende la UI existente de Ciclos sin crear un segundo sistema de turnos.
// Fuente de verdad backend: iniciar_sesion_operativa / cerrar_sesion_operativa.
(function(){
  'use strict';

  const RPC_INICIAR = 'iniciar_sesion_operativa';
  const RPC_CERRAR = 'cerrar_sesion_operativa';
  let inicializado = false;
  let observador = null;

  function key(){ return crypto.randomUUID(); }
  function esc(v){ return typeof escHtml === 'function' ? escHtml(v == null ? '' : v) : String(v == null ? '' : v); }
  function msg(text, ok){
    const el = document.getElementById('msg-sesiones-operativas');
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'error');
  }

  function permisosCrear(){
    return typeof tienePermiso === 'function' && tienePermiso('ciclos','crear');
  }
  function permisosEditar(){
    return typeof tienePermiso === 'function' && tienePermiso('ciclos','editar');
  }

  async function mutar(rpc, sesionId, observacion){
    if (!navigator.onLine) throw new Error('Las sesiones operativas requieren Internet.');
    const params = { p_sesion_id: sesionId, p_idempotency_key: key(), p_observacion: observacion || null };
    const r = await client.rpc(rpc, params);
    if (r && r.error) throw r.error;
    return r ? r.data : null;
  }

  function encontrarSesion(id){
    const det = document.getElementById('ciclo-detalle');
    if (!det) return null;
    return det.querySelector('[data-sesion-id="' + CSS.escape(id) + '"]');
  }

  async function abrirSesion(id, btn){
    if (!permisosCrear()) { msg('No tenés permiso para abrir sesiones.', false); return; }
    if (btn) btn.disabled = true;
    try {
      await mutar(RPC_INICIAR, id, null);
      msg('✓ Sesión abierta. Ya podés trabajar y registrar ventas.', true);
      if (typeof mostrarDetalleCiclo === 'function' && window._cicloActualId) await mostrarDetalleCiclo(window._cicloActualId);
    } catch(e) {
      msg('No se pudo abrir la sesión: ' + String(e && (e.message || e.details || e.code) || e), false);
    } finally { if (btn) btn.disabled = false; }
  }

  async function cerrarSesion(id, btn){
    if (!permisosEditar()) { msg('No tenés permiso para cerrar sesiones.', false); return; }
    if (!window.confirm('¿Cerrar esta sesión de trabajo? Al cerrarla ya no quedará disponible para registrar nuevas ventas en esta sesión.')) return;
    if (btn) btn.disabled = true;
    try {
      await mutar(RPC_CERRAR, id, null);
      msg('✓ Sesión cerrada.', true);
      if (typeof mostrarDetalleCiclo === 'function' && window._cicloActualId) await mostrarDetalleCiclo(window._cicloActualId);
    } catch(e) {
      msg('No se pudo cerrar la sesión: ' + String(e && (e.message || e.details || e.code) || e), false);
    } finally { if (btn) btn.disabled = false; }
  }

  function mejorarDetalle(){
    const det = document.getElementById('ciclo-detalle');
    if (!det) return;
    const lis = det.querySelectorAll('li.muted');
    lis.forEach(function(li){
      if (li.dataset.bcSesionUi === '1') return;
      const text = li.textContent || '';
      const m = text.match(/Día\s+([^·]+)\s+·\s+([^·]+)\s+·\s+([^·]+)\s+·\s+(.+)$/);
      if (!m) return;
      const dia = m[1].trim();
      const bloque = m[2].trim();
      const estado = m[4].trim();
      const ciclo = window._cicloDetalleActual;
      const sesiones = ciclo && Array.isArray(ciclo.sesiones) ? ciclo.sesiones : [];
      const s = sesiones.find(x => String(x.dia_n) === dia && String(x.bloque) === bloque);
      if (!s || !s.id) return;
      li.dataset.bcSesionUi = '1';
      li.dataset.sesionId = s.id;
      li.innerHTML = '<span>Día ' + esc(s.dia_n) + ' · ' + esc(s.bloque) + ' · ' + esc(s.fecha || '') + ' · <strong>' + esc(estado) + '</strong></span>';
      const actions = document.createElement('span');
      actions.className = 'btn-row bc-sesion-acciones';
      actions.style.cssText = 'display:inline-flex;gap:6px;margin-left:8px;flex-wrap:wrap;';
      if (estado === 'PENDIENTE' && permisosCrear()) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cc-accion'; b.dataset.bcSesionAbrir = s.id;
        b.textContent = 'Abrir sesión';
        actions.appendChild(b);
      } else if (estado === 'EN_CURSO' && permisosEditar()) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cc-accion'; b.dataset.bcSesionCerrar = s.id;
        b.textContent = 'Cerrar sesión';
        actions.appendChild(b);
      } else if (estado === 'COMPLETADA') {
        const span = document.createElement('span'); span.className='muted'; span.textContent='Sesión finalizada'; actions.appendChild(span);
      }
      if (actions.childNodes.length) li.appendChild(actions);
    });

    let m = document.getElementById('msg-sesiones-operativas');
    if (!m) {
      m = document.createElement('p'); m.id='msg-sesiones-operativas'; m.className='msg';
      det.appendChild(m);
    }
  }

  function init(){
    if (inicializado) return;
    const det = document.getElementById('ciclo-detalle');
    if (!det) return;
    inicializado = true;
    det.addEventListener('click', function(e){
      const a = e.target.closest('[data-bc-sesion-abrir]');
      if (a) { e.stopPropagation(); abrirSesion(a.dataset.bcSesionAbrir, a); return; }
      const c = e.target.closest('[data-bc-sesion-cerrar]');
      if (c) { e.stopPropagation(); cerrarSesion(c.dataset.bcSesionCerrar, c); }
    });
    observador = new MutationObserver(function(){ mejorarDetalle(); });
    observador.observe(det, {childList:true, subtree:true});
    mejorarDetalle();
  }

  function boot(){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else init();
  }
  boot();
})();
