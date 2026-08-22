/* BattleCruiser M18.1 — Ciclos UX simplificado.
 * Capa de presentación sobre los RPC existentes. No reemplaza ciclos.js.
 * Objetivo: almacén → ciclo → sesiones → sesión activa → cierre.
 */
(function () {
  'use strict';

  const RPC = {
    listarCiclos: 'listar_ciclos_operativos',
    crearCiclo: 'crear_ciclo_operativo',
    iniciarCiclo: 'iniciar_ciclo_operativo',
    iniciarValidacion: 'iniciar_validacion_ciclo_operativo',
    finalizarCiclo: 'finalizar_ciclo_operativo',
    listarSesiones: 'listar_sesiones_operativas',
    iniciarSesion: 'iniciar_sesion_operativa',
    cerrarSesion: 'cerrar_sesion_operativa'
  };

  const state = { ciclo: null, sesiones: [], almacenId: null, paso: 1 };
  let ready = false;

  function esc(v) {
    if (typeof escHtml === 'function') return escHtml(v == null ? '' : String(v));
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function fmtDate(v) {
    if (!v) return '—';
    if (typeof fechaCorta === 'function') return fechaCorta(v);
    return String(v).split('-').reverse().join('/');
  }
  function labelEstado(s) {
    return ({PLANIFICADO:'Planificado',ACTIVO:'Activo',EN_VALIDACION:'En validación',VALIDADO:'Validado',ARCHIVADO:'Archivado',PENDIENTE:'Pendiente',EN_CURSO:'En curso',COMPLETADA:'Completada',CANCELADA:'Cancelada'})[s] || s || '—';
  }
  function setHtml(html) {
    const root = document.getElementById('ciclos-m18-root');
    if (root) root.innerHTML = html;
  }
  function msg(text, ok) {
    const el = document.getElementById('m18-msg');
    if (el) { el.textContent = text || ''; el.className = 'm18-msg ' + (ok ? 'ok' : 'error'); }
  }
  function uuid() { return crypto.randomUUID(); }

  async function rpc(name, params) {
    try {
      if (typeof showLoading === 'function') showLoading();
      const r = await client.rpc(name, params || {});
      if (r && !r.error && typeof marcarConectividadReal === 'function') marcarConectividadReal('online');
      return r;
    } catch (e) {
      if (typeof esErrorDeRed === 'function' && esErrorDeRed(e) && typeof marcarConectividadReal === 'function') marcarConectividadReal('offline');
      return { data: null, error: e };
    } finally {
      if (typeof resetLoadingOverlay === 'function') resetLoadingOverlay();
      else if (typeof hideLoading === 'function') hideLoading();
    }
  }

  function activeCycle(cycles, almacenId) {
    return (cycles || []).find(c => c.almacen_id === almacenId && ['ACTIVO','EN_VALIDACION'].includes(c.estado)) ||
      (cycles || []).filter(c => c.almacen_id === almacenId && !['ARCHIVADO','VALIDADO'].includes(c.estado)).sort((a,b) => String(b.inicio_plan).localeCompare(String(a.inicio_plan)))[0] || null;
  }

  function renderStyles() {
    if (document.getElementById('m18-ciclos-style')) return;
    const s = document.createElement('style'); s.id = 'm18-ciclos-style';
    s.textContent = `
      #tab-ciclos .mando-filtros,#tab-ciclos > .cc-bloque,#tab-ciclos > #ciclo-detalle,#tab-ciclos > #msg-ciclos{display:none!important}
      .m18-wrap{max-width:760px;margin:0 auto}.m18-step{display:flex;gap:8px;align-items:center;margin:0 0 16px}.m18-step span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--gold-dim);color:var(--gold);font-family:'IBM Plex Mono',monospace}.m18-step strong{font-size:14px}.m18-card{border:1px solid var(--gold-dim);background:var(--stone);border-radius:10px;padding:16px;margin:10px 0}.m18-card h4{margin:0 0 7px}.m18-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;font-size:13px}.m18-meta b{color:var(--gold)}.m18-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.m18-actions button{min-height:42px}.m18-back{background:transparent!important}.m18-session{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--gold-dim);padding:12px 0}.m18-session:first-child{border-top:0}.m18-session small{display:block;color:var(--mist)}.m18-status{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mist);font-family:'IBM Plex Mono',monospace}.m18-msg{min-height:20px;margin-top:10px}.m18-msg.error{color:#d98b7f}.m18-msg.ok{color:#8fc79d}.m18-empty{padding:18px;text-align:center;color:var(--mist)}
      @media(max-width:600px){.m18-meta{grid-template-columns:1fr}.m18-session{align-items:flex-start;flex-direction:column}}
    `; document.head.appendChild(s);
  }

  async function getCycles() {
    const r = await rpc(RPC.listarCiclos, {p_almacen_id:null,p_estado:null});
    if (r.error) throw r.error;
    const d = r.data;
    return Array.isArray(d) ? d : (d && Array.isArray(d.ciclos) ? d.ciclos : d ? [d] : []);
  }
  async function getSessions(cicloId) {
    const r = await rpc(RPC.listarSesiones, {p_ciclo_id:cicloId,p_almacen_id:null,p_fecha:null,p_estado:null});
    if (r.error) throw r.error;
    return Array.isArray(r.data) ? r.data : (r.data ? [r.data] : []);
  }

  function almacenes() {
    return ((_cache && _cache.almacenes) || []).filter(a => a.activo !== false);
  }

  async function home() {
    state.paso = 1;
    const as = almacenes();
    let cycles = [];
    try { cycles = await getCycles(); } catch(e) { setHtml('<div class="m18-empty">No se pudieron cargar los ciclos. Revisá la conexión.</div>'); return; }
    const cards = as.map(a => {
      const c = activeCycle(cycles, a.id);
      return `<div class="m18-card"><h4>🏪 ${esc(a.nombre || a.id)}</h4>${c ? `<div class="m18-meta"><div>Estado<br><b>${esc(labelEstado(c.estado))}</b></div><div>Periodo<br><b>${esc(fmtDate(c.inicio_plan))} → ${esc(fmtDate(c.fin_plan))}</b></div></div><div class="m18-actions"><button class="cc-accion" data-m18-enter="${esc(c.id)}">Entrar al ciclo</button></div>` : `<p class="muted">No hay ciclo activo o planificado.</p><div class="m18-actions"><button class="cc-accion" data-m18-create="${esc(a.id)}">Crear ciclo</button></div>`}</div>`;
    }).join('');
    setHtml(`<div class="m18-step"><span>1</span><strong>Ciclo actual</strong></div>${cards || '<div class="m18-empty">No hay almacenes disponibles.</div>'}<p id="m18-msg" class="m18-msg"></p>`);
  }

  async function createCycle(almacenId) {
    const hoy = new Date(); const iso = new Date(hoy.getTime()-hoy.getTimezoneOffset()*60000).toISOString().slice(0,10);
    setHtml(`<div class="m18-step"><span>1</span><strong>Crear ciclo</strong></div><div class="m18-card"><h4>Nuevo ciclo</h4><label class="muted">Inicio<br><input id="m18-inicio" type="date" value="${iso}"></label><br><br><label class="muted">Días<br><input id="m18-dias" type="number" min="1" max="31" value="1"></label><div class="m18-actions"><button class="cc-accion m18-back" data-m18-home>← Volver</button><button class="cc-accion" data-m18-save="${esc(almacenId)}">Crear ciclo</button></div><p id="m18-msg" class="m18-msg"></p></div>`);
  }

  async function saveCycle(almacenId) {
    const inicio = document.getElementById('m18-inicio')?.value;
    const dias = Number(document.getElementById('m18-dias')?.value || 0);
    if (!inicio || !Number.isInteger(dias) || dias < 1 || dias > 31) { msg('Indicá una fecha y entre 1 y 31 días.', false); return; }
    const r = await rpc(RPC.crearCiclo,{p_almacen_id:almacenId,p_inicio_plan:inicio,p_cantidad_dias:dias,p_idempotency_key:uuid()});
    if (r.error) { msg(String(r.error.message || r.error), false); return; }
    await enter(r.data?.id || r.data?.id_ciclo);
  }

  async function enter(cicloId) {
    let cycles = []; try { cycles = await getCycles(); } catch(e) { msg('No se pudo cargar el ciclo.',false); return; }
    const c = cycles.find(x => x.id === cicloId) || activeCycle(cycles, state.almacenId);
    if (!c) { await home(); return; }
    state.ciclo = c; state.almacenId = c.almacen_id; state.paso = 2;
    renderCycle(c);
  }

  function renderCycle(c) {
    const puedeIniciar = c.estado === 'PLANIFICADO';
    const puedeValidar = c.estado === 'ACTIVO';
    const puedeFinalizar = c.estado === 'EN_VALIDACION';
    setHtml(`<div class="m18-step"><span>2</span><strong>Tu ciclo</strong></div><div class="m18-card"><h4>${esc(c.almacen_nombre || 'Almacén')}</h4><div class="m18-meta"><div>Estado<br><b>${esc(labelEstado(c.estado))}</b></div><div>Periodo<br><b>${esc(fmtDate(c.inicio_plan))} → ${esc(fmtDate(c.fin_plan))}</b></div></div><div class="m18-actions">${puedeIniciar?'<button class="cc-accion" data-m18-start-cycle>Iniciar ciclo</button>':''}<button class="cc-accion" data-m18-sessions>Ver sesiones</button>${puedeValidar?'<button class="cc-accion" data-m18-validate>Pasar a validación</button>':''}${puedeFinalizar?'<button class="cc-accion" data-m18-finish>Finalizar ciclo</button>':''}<button class="cc-accion m18-back" data-m18-home>← Ciclos</button></div><p id="m18-msg" class="m18-msg"></p></div>`);
  }

  async function cycleMutation(name) {
    const r = await rpc(name,{p_ciclo_id:state.ciclo.id,p_idempotency_key:uuid()});
    if (r.error) { msg(String(r.error.message || r.error),false); return false; }
    await enter(state.ciclo.id); return true;
  }

  async function sessions() {
    if (!state.ciclo) return home();
    let ss=[]; try { ss=await getSessions(state.ciclo.id); } catch(e) { msg('No se pudieron cargar las sesiones.',false); return; }
    state.sesiones=ss; state.paso=3;
    const rows=ss.map(s=>`<div class="m18-session"><div><b>${s.bloque==='MANANA'?'☀️ Mañana':'🌙 Tarde'}</b><small>Día ${esc(s.dia_n)} · ${esc(fmtDate(s.fecha))}${s.usuario_nombre?' · '+esc(s.usuario_nombre):''}</small><span class="m18-status">${esc(labelEstado(s.estado))}</span></div><div class="m18-actions">${s.estado==='PENDIENTE'?`<button class="cc-accion" data-m18-start-session="${esc(s.id)}">Abrir sesión</button>`:''}${s.estado==='EN_CURSO'?`<button class="cc-accion" data-m18-work-session="${esc(s.id)}">Entrar</button><button class="cc-accion" data-m18-close-session="${esc(s.id)}">Cerrar</button>`:''}</div></div>`).join('');
    setHtml(`<div class="m18-step"><span>3</span><strong>Sesiones</strong></div><div class="m18-card"><h4>${esc(state.ciclo.almacen_nombre || 'Almacén')}</h4>${rows || '<div class="m18-empty">No hay sesiones.</div>'}<div class="m18-actions"><button class="cc-accion m18-back" data-m18-cycle>← Ciclo</button></div><p id="m18-msg" class="m18-msg"></p></div>`);
  }

  async function startSession(id) {
    const r=await rpc(RPC.iniciarSesion,{p_sesion_id:id,p_idempotency_key:uuid(),p_observacion:null});
    if(r.error){msg(String(r.error.message||r.error),false);return;}
    await sessions();
    await workSession(id);
  }
  async function workSession(id) {
    const s=state.sesiones.find(x=>x.id===id) || (await getSessions(state.ciclo.id)).find(x=>x.id===id);
    if(!s)return sessions();
    state.paso=4;
    setHtml(`<div class="m18-step"><span>4</span><strong>Sesión activa</strong></div><div class="m18-card"><h4>${s.bloque==='MANANA'?'☀️ Mañana':'🌙 Tarde'} · ${esc(fmtDate(s.fecha))}</h4><div class="m18-meta"><div>Trabajador<br><b>${esc(s.usuario_nombre||'—')}</b></div><div>Almacén<br><b>${esc(s.almacen_nombre||state.ciclo.almacen_nombre||'—')}</b></div></div><div class="m18-actions"><button class="cc-accion" data-m18-tab="ventas">Ventas</button><button class="cc-accion" data-m18-tab="movimientos">Movimientos</button><button class="cc-accion" data-m18-tab="resumen">Caja / Centro de Control</button><button class="cc-accion" data-m18-close-session="${esc(id)}">Cerrar sesión</button></div><p id="m18-msg" class="m18-msg"></p></div>`);
  }
  async function closeSession(id){
    const r=await rpc(RPC.cerrarSesion,{p_sesion_id:id,p_idempotency_key:uuid(),p_observacion:null});
    if(r.error){msg(String(r.error.message||r.error),false);return;}
    await sessions();
  }

  async function refresh() {
    renderStyles();
    const tab=document.getElementById('tab-ciclos');
    if(!tab)return;
    const oldTurnos=document.querySelector('#tabs [data-tab="turnos"]'); if(oldTurnos) oldTurnos.style.display='none';
    const root=document.getElementById('ciclos-m18-root'); if(!root)return;
    await home();
  }

  function bind() {
    if(ready)return; ready=true;
    document.addEventListener('click',async e=>{
      const t=e.target.closest('[data-m18-enter]'); if(t){e.preventDefault();await enter(t.dataset.m18Enter);return;}
      t=e.target.closest('[data-m18-create]'); if(t){e.preventDefault();await createCycle(t.dataset.m18Create);return;}
      t=e.target.closest('[data-m18-save]'); if(t){e.preventDefault();await saveCycle(t.dataset.m18Save);return;}
      t=e.target.closest('[data-m18-home]'); if(t){e.preventDefault();await home();return;}
      t=e.target.closest('[data-m18-sessions]'); if(t){e.preventDefault();await sessions();return;}
      t=e.target.closest('[data-m18-cycle]'); if(t){e.preventDefault();await renderCycle(state.ciclo);return;}
      t=e.target.closest('[data-m18-start-cycle]'); if(t){e.preventDefault();await cycleMutation(RPC.iniciarCiclo);return;}
      t=e.target.closest('[data-m18-validate]'); if(t){e.preventDefault();await cycleMutation(RPC.iniciarValidacion);return;}
      t=e.target.closest('[data-m18-finish]'); if(t){e.preventDefault();await cycleMutation(RPC.finalizarCiclo);return;}
      t=e.target.closest('[data-m18-start-session]'); if(t){e.preventDefault();await startSession(t.dataset.m18StartSession);return;}
      t=e.target.closest('[data-m18-work-session]'); if(t){e.preventDefault();await workSession(t.dataset.m18WorkSession);return;}
      t=e.target.closest('[data-m18-close-session]'); if(t){e.preventDefault();await closeSession(t.dataset.m18CloseSession);return;}
      t=e.target.closest('[data-m18-tab]'); if(t){e.preventDefault();const b=document.querySelector(`#tabs [data-tab="${t.dataset.m18Tab}"]`);if(b)b.click();return;}
      const tabBtn=e.target.closest('#tabs [data-tab="ciclos"]'); if(tabBtn){setTimeout(refresh,0);}
    });
    const old=window.refrescarCiclos;
    window.refrescarCiclos=refresh;
    // Si navegación ya estaba inicializada antes de esta capa, el click anterior sigue siendo válido.
    if(old) window._battlecruiserRefrescarCiclosLegacy=old;
  }

  function init(){
    const tab=document.getElementById('tab-ciclos'); if(!tab)return;
    if(!document.getElementById('ciclos-m18-root')){
      tab.innerHTML='<div class="pendientes-header"><h3>Ciclos Operativos</h3><span id="ciclos-conn-info" class="muted"></span></div><p class="muted">Una guía simple: ciclo → sesión → trabajar → cerrar.</p><div id="ciclos-m18-root" class="m18-wrap"></div>';
    }
    bind();
    refresh();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
