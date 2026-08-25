// BattleCruiser M27.3-FE — Cierre de sesión operativa + entrega de caja + recepción
// v9.2.96
// Fuente de verdad: declarar_entrega_caja → cerrar_sesion_operativa
// Recepción: registrar_recepcion_entrega_caja (una sola acción de usuario).
// Si el backend deja CONTADA, se completa APROBADA/RECHAZADA con revisar_entrega_caja
// de forma silenciosa (sin segunda UI de aprobación para el receptor ni el emisor).
(function () {
  'use strict';
  if (window.__BC_M273__) return;
  window.__BC_M273__ = true;

  var MODAL_ID = 'bc-m273-modal';
  var BTN_ID = 'bc-m273-cerrar-sesion-btn';
  var CC_BLOCK_ID = 'bc-m273-cc-entregas';
  var NOTIF_ID = 'bc-m273-notif';
  var LS_NOTIF = 'bc-m273-notif-emisor-v1';
  var busy = false;

  function esc(v) {
    return typeof escHtml === 'function' ? escHtml(v == null ? '' : v) : String(v == null ? '' : v);
  }
  function moneyFmt(n) {
    var x = Number(n);
    if (!isFinite(x)) return '0.00';
    try {
      if (typeof money === 'function') return money(x);
    } catch (e) {}
    return x.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function uuid() {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
  }
  function uid() {
    try {
      if (typeof _usuarioActual !== 'undefined' && _usuarioActual && _usuarioActual.id) return _usuarioActual.id;
    } catch (e) {}
    return null;
  }
  function unombre() {
    try {
      if (typeof _usuarioActual !== 'undefined' && _usuarioActual) {
        return _usuarioActual.nombre || _usuarioActual.email || 'Usuario';
      }
    } catch (e) {}
    return 'Usuario';
  }
  function turno() {
    try {
      if (typeof _turnoActual !== 'undefined' && _turnoActual) return _turnoActual;
    } catch (e) {}
    try {
      if (window._turnoActual) return window._turnoActual;
    } catch (e2) {}
    return null;
  }
  function online() {
    return typeof navigator !== 'undefined' && navigator.onLine !== false;
  }
  function can(sec, act) {
    return typeof tienePermiso === 'function' && tienePermiso(sec, act);
  }

  function injectCss() {
    if (document.getElementById('bc-m273-css')) return;
    var s = document.createElement('style');
    s.id = 'bc-m273-css';
    s.textContent = [
      '#logout-btn{display:none!important}',
      '#' + BTN_ID + '{display:block;width:100%;margin:14px 0 8px;padding:14px 16px;border-radius:10px;',
      'border:1px solid rgba(180,40,40,.55);background:linear-gradient(180deg,rgba(140,28,28,.92),rgba(90,16,16,.95));',
      'color:#f5d0d0;font-weight:700;font-size:15px;letter-spacing:.02em;cursor:pointer;text-align:center}',
      '#' + BTN_ID + ':hover{border-color:rgba(220,60,60,.7);background:linear-gradient(180deg,rgba(160,36,36,.95),rgba(100,18,18,.98))}',
      '#' + BTN_ID + ':disabled{opacity:.55;cursor:wait}',
      '#' + BTN_ID + '.hidden{display:none!important}',
      '#' + MODAL_ID + '-backdrop{position:fixed;inset:0;background:rgba(4,12,10,.6);z-index:9600;display:flex;align-items:center;justify-content:center;padding:16px}',
      '#' + MODAL_ID + '{width:min(440px,96vw);max-height:92dvh;overflow:auto;border-radius:14px;',
      'background:linear-gradient(180deg,rgba(16,34,30,.99),rgba(8,18,15,.99));border:1px solid rgba(201,162,77,.28);',
      'box-shadow:0 20px 48px rgba(0,0,0,.5);padding:20px 18px 18px;color:var(--text,#e8e4d8)}',
      '#' + MODAL_ID + ' h3{margin:0 0 8px;font-family:Cormorant Garamond,serif;font-size:1.35rem;color:var(--gold-bright,#e8c86a)}',
      '#' + MODAL_ID + ' .bc-m273-lead{margin:0 0 14px;font-size:13.5px;color:var(--mist,#a8b0a4);line-height:1.4}',
      '#' + MODAL_ID + ' label{display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--gold-dim,#b89a4a);margin-bottom:6px}',
      '#' + MODAL_ID + ' input[type=number],#' + MODAL_ID + ' input[type=text]{width:100%;box-sizing:border-box;padding:16px 14px;font-size:1.35rem;',
      'border-radius:10px;border:1px solid rgba(201,162,77,.28);background:var(--void,#0a1411);color:var(--text,#e8e4d8);font-weight:600}',
      '#' + MODAL_ID + ' .bc-m273-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}',
      '#' + MODAL_ID + ' .bc-m273-actions button{flex:1 1 120px;padding:12px 14px;border-radius:10px;font-weight:600;cursor:pointer;font-size:14px}',
      '#' + MODAL_ID + ' .bc-m273-cancel{background:transparent;border:1px solid rgba(255,255,255,.15);color:var(--mist,#a8b0a4)}',
      '#' + MODAL_ID + ' .bc-m273-ok{background:rgba(201,162,77,.2);border:1px solid rgba(201,162,77,.45);color:var(--gold-bright,#e8c86a)}',
      '#' + MODAL_ID + ' .bc-m273-danger{background:rgba(140,28,28,.85);border:1px solid rgba(200,60,60,.5);color:#f5d0d0}',
      '#' + MODAL_ID + ' .bc-m273-msg{margin-top:12px;font-size:13px;min-height:1.2em}',
      '#' + MODAL_ID + ' .bc-m273-msg.ok{color:#9dcc9a}',
      '#' + MODAL_ID + ' .bc-m273-msg.err{color:#e8a0a0}',
      '#' + MODAL_ID + ' .bc-m273-diff{margin-top:12px;padding:12px;border-radius:10px;border:1px solid rgba(200,120,40,.4);background:rgba(80,40,10,.25)}',
      '#' + MODAL_ID + ' .bc-m273-okbox{margin-top:12px;padding:12px;border-radius:10px;border:1px solid rgba(80,160,80,.4);background:rgba(20,60,30,.3)}',
      '#' + CC_BLOCK_ID + '{margin-top:12px}',
      '#' + CC_BLOCK_ID + ' .bc-m273-card{padding:12px 14px;border-radius:10px;border:1px solid rgba(201,162,77,.25);',
      'background:rgba(12,28,24,.55);margin-bottom:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}',
      '#' + CC_BLOCK_ID + ' .bc-m273-card strong{display:block;font-size:14px}',
      '#' + CC_BLOCK_ID + ' .bc-m273-card small{display:block;font-size:12px;color:var(--mist,#a8b0a4);margin-top:2px}',
      '#' + NOTIF_ID + '{position:fixed;bottom:18px;right:18px;z-index:9700;max-width:min(360px,92vw);padding:14px 16px;',
      'border-radius:12px;border:1px solid rgba(200,120,40,.45);background:rgba(40,24,8,.96);color:#f0e0c0;',
      'box-shadow:0 12px 32px rgba(0,0,0,.4);font-size:13.5px;line-height:1.4}',
      '#' + NOTIF_ID + ' button{margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);',
      'background:transparent;color:inherit;cursor:pointer;font-size:12px}',
      '@media(max-width:480px){#' + MODAL_ID + '{width:100%;max-height:100dvh;border-radius:0;min-height:100dvh}}'
    ].join('');
    document.head.appendChild(s);
  }

  function closeModal() {
    var b = document.getElementById(MODAL_ID + '-backdrop');
    if (b) b.remove();
  }

  function openModal(html) {
    closeModal();
    var back = document.createElement('div');
    back.id = MODAL_ID + '-backdrop';
    back.setAttribute('role', 'presentation');
    var panel = document.createElement('div');
    panel.id = MODAL_ID;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = html;
    back.appendChild(panel);
    back.addEventListener('click', function (e) {
      if (e.target === back) closeModal();
    });
    document.body.appendChild(back);
    var first = panel.querySelector('input,button');
    if (first) setTimeout(function () { try { first.focus(); } catch (e) {} }, 30);
    return panel;
  }

  function parseMonto(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().replace(/\s/g, '').replace(/,/g, '');
    if (s === '') return null;
    if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    if (!isFinite(n) || n < 0) return null;
    return n;
  }

  function sesionIdsFromTurno(t) {
    if (!t) return { sesionId: null, cicloId: null, turnoId: null, almacenId: null };
    return {
      sesionId: t.sesion_id || t.sesion_ciclo_id || t.sesiones_ciclo_id || null,
      cicloId: t.ciclo_id || t.ciclo_operativo_id || null,
      turnoId: t.id || t.turno_id || null,
      almacenId: t.almacen_id || null
    };
  }

  async function resolverContextoCierre() {
    var t = turno();
    if (!t || String(t.estado || '').toUpperCase() !== 'ABIERTO') return null;
    var ctx = sesionIdsFromTurno(t);
    if (!ctx.cicloId && ctx.sesionId && online()) {
      try {
        var r = await client.rpc('listar_sesiones_operativas', {
          p_ciclo_id: null,
          p_almacen_id: ctx.almacenId || null,
          p_fecha: null,
          p_estado: 'EN_CURSO'
        });
        var list = r && r.data ? (Array.isArray(r.data) ? r.data : [r.data]) : [];
        var me = uid();
        var mine = list.find(function (s) {
          var assigned = s.usuario_id || s.trabajador_id || s.responsable_id;
          return String(s.id) === String(ctx.sesionId) ||
            (me && assigned && String(assigned) === String(me) && String(s.estado || '').toUpperCase() === 'EN_CURSO');
        });
        if (mine) {
          ctx.sesionId = mine.id || ctx.sesionId;
          ctx.cicloId = mine.ciclo_id || ctx.cicloId;
          ctx.almacenId = mine.almacen_id || ctx.almacenId;
        }
      } catch (e) {}
    }
    if (!ctx.sesionId && online()) {
      try {
        var r2 = await client.rpc('listar_sesiones_operativas', {
          p_ciclo_id: ctx.cicloId || null,
          p_almacen_id: ctx.almacenId || null,
          p_fecha: null,
          p_estado: 'EN_CURSO'
        });
        var list2 = r2 && r2.data ? (Array.isArray(r2.data) ? r2.data : [r2.data]) : [];
        var me2 = uid();
        var mine2 = list2.find(function (s) {
          var assigned = s.usuario_id || s.trabajador_id || s.responsable_id;
          return me2 && assigned && String(assigned) === String(me2);
        }) || list2[0];
        if (mine2) {
          ctx.sesionId = mine2.id;
          ctx.cicloId = mine2.ciclo_id || ctx.cicloId;
          ctx.almacenId = mine2.almacen_id || ctx.almacenId;
        }
      } catch (e2) {}
    }
    if (!ctx.cicloId || !ctx.sesionId) return null;
    return ctx;
  }

  async function declararYCerrar(monto, msgEl, btnOk) {
    if (busy) return;
    if (!online()) {
      if (msgEl) {
        msgEl.className = 'bc-m273-msg err';
        msgEl.textContent = 'Necesitas conexión para cerrar esta sesión.';
      }
      return;
    }
    var ctx = await resolverContextoCierre();
    if (!ctx) {
      if (msgEl) {
        msgEl.className = 'bc-m273-msg err';
        msgEl.textContent = 'No hay una sesión operativa propia abierta para cerrar.';
      }
      return;
    }
    busy = true;
    if (btnOk) btnOk.disabled = true;
    try {
      var rDecl = await client.rpc('declarar_entrega_caja', {
        p_ciclo_id: ctx.cicloId,
        p_monto_declarado: monto,
        p_sesion_id: ctx.sesionId,
        p_turno_id: ctx.turnoId || null,
        p_almacen_id: ctx.almacenId || null,
        p_idempotency_key: uuid()
      });
      if (rDecl && rDecl.error) throw rDecl.error;

      var rClose = await client.rpc('cerrar_sesion_operativa', {
        p_sesion_id: ctx.sesionId,
        p_idempotency_key: uuid(),
        p_observacion: null
      });
      if (rClose && rClose.error) throw rClose.error;

      if (typeof window.__BC_M25_refrescarTurno === 'function') {
        try { await window.__BC_M25_refrescarTurno(); } catch (e) {}
      } else if (typeof refrescarTurnoActual === 'function') {
        try { await refrescarTurnoActual(); } catch (e2) {}
      }
      try {
        if (typeof actualizarPanelAlmacenVenta === 'function') actualizarPanelAlmacenVenta();
      } catch (e3) {}

      openModal(
        '<h3>✓ Sesión cerrada</h3>' +
        '<p class="bc-m273-lead">La sesión operativa quedó cerrada en el servidor.</p>' +
        '<div class="bc-m273-okbox"><strong>Dinero declarado:</strong> $' + esc(moneyFmt(monto)) + '</div>' +
        '<div class="bc-m273-actions"><button type="button" class="bc-m273-ok" id="bc-m273-done">Entendido</button></div>'
      );
      var done = document.getElementById('bc-m273-done');
      if (done) done.onclick = function () {
        closeModal();
        updateCerrarBtn();
        cargarEntregasPendientes();
      };
    } catch (e) {
      var m = String((e && (e.message || e.details || e.code)) || e);
      if (msgEl) {
        msgEl.className = 'bc-m273-msg err';
        msgEl.textContent = 'No se pudo cerrar: ' + m;
      }
      if (btnOk) btnOk.disabled = false;
    } finally {
      busy = false;
    }
  }

  function abrirModalCierre() {
    if (!online()) {
      openModal(
        '<h3>Cerrar sesión actual</h3>' +
        '<p class="bc-m273-lead">Necesitas conexión para cerrar esta sesión.</p>' +
        '<div class="bc-m273-actions"><button type="button" class="bc-m273-cancel" id="bc-m273-cancel">Cerrar</button></div>'
      );
      document.getElementById('bc-m273-cancel').onclick = closeModal;
      return;
    }
    openModal(
      '<h3>Cerrar sesión actual</h3>' +
      '<p class="bc-m273-lead">Antes de cerrar debes declarar cuánto dinero entregas. El monto es obligatorio.</p>' +
      '<label for="bc-m273-monto">Dinero entregado</label>' +
      '<input id="bc-m273-monto" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" autocomplete="off">' +
      '<div class="bc-m273-actions">' +
      '<button type="button" class="bc-m273-cancel" id="bc-m273-cancel">Cancelar</button>' +
      '<button type="button" class="bc-m273-danger" id="bc-m273-ok">Declarar dinero y cerrar sesión</button>' +
      '</div>' +
      '<p class="bc-m273-msg" id="bc-m273-msg"></p>'
    );
    document.getElementById('bc-m273-cancel').onclick = closeModal;
    document.getElementById('bc-m273-ok').onclick = function () {
      var msgEl = document.getElementById('bc-m273-msg');
      var inp = document.getElementById('bc-m273-monto');
      var monto = parseMonto(inp && inp.value);
      if (monto === null) {
        if (msgEl) {
          msgEl.className = 'bc-m273-msg err';
          msgEl.textContent = 'Ingresá un monto válido (número ≥ 0).';
        }
        if (inp) inp.focus();
        return;
      }
      declararYCerrar(monto, msgEl, document.getElementById('bc-m273-ok'));
    };
  }

  function ensureCerrarBtn() {
    var tab = document.getElementById('tab-ventas');
    if (!tab) return null;
    var btn = document.getElementById(BTN_ID);
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.className = 'hidden';
    btn.textContent = '🔴 Cerrar sesión actual';
    btn.setAttribute('aria-label', 'Cerrar sesión operativa actual declarando el dinero entregado');
    var conf = document.getElementById('btn-confirmar-venta');
    if (conf && conf.parentNode) {
      conf.parentNode.insertBefore(btn, conf.nextSibling);
    } else {
      tab.appendChild(btn);
    }
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      abrirModalCierre();
    });
    return btn;
  }

  function updateCerrarBtn() {
    var btn = ensureCerrarBtn();
    if (!btn) return;
    var t = turno();
    var abierto = !!(t && String(t.estado || '').toUpperCase() === 'ABIERTO');
    btn.classList.toggle('hidden', !abierto);
  }

  async function listarDeclaradas() {
    if (!online() || typeof client === 'undefined') return [];
    try {
      var r = await client.rpc('listar_entregas_caja', {
        p_ciclo_id: null,
        p_almacen_id: null,
        p_estado: 'DECLARADA'
      });
      if (r && r.error) {
        try { console.warn('[M27.3] listar_entregas_caja', r.error); } catch (e) {}
        return [];
      }
      var d = r ? r.data : [];
      if (typeof d === 'string') {
        try { d = JSON.parse(d); } catch (e2) { d = []; }
      }
      return Array.isArray(d) ? d : (d ? [d] : []);
    } catch (e) {
      return [];
    }
  }

  async function sesionesUsuarioActual() {
    if (!online()) return [];
    var me = uid();
    if (!me) return [];
    try {
      var r = await client.rpc('listar_sesiones_operativas', {
        p_ciclo_id: null,
        p_almacen_id: null,
        p_fecha: null,
        p_estado: null
      });
      var d = r && r.data ? (Array.isArray(r.data) ? r.data : [r.data]) : [];
      return d.filter(function (s) {
        var a = s.usuario_id || s.trabajador_id || s.responsable_id;
        return a && String(a) === String(me);
      });
    } catch (e) {
      return [];
    }
  }

  function entregaVisibleParaMi(entrega, misSesiones) {
    var me = uid();
    if (!me) return false;
    if (entrega.declarado_por && String(entrega.declarado_por) === String(me)) return false;
    var ciclo = entrega.ciclo_id;
    var alm = entrega.almacen_id;
    if (!misSesiones || !misSesiones.length) {
      // sin asignaciones propias: solo admin/editar entregas puede ver (no inventar)
      return can('entregas_caja', 'editar') || can('entregas_caja', 'editar_any');
    }
    return misSesiones.some(function (s) {
      if (ciclo && s.ciclo_id && String(s.ciclo_id) === String(ciclo)) return true;
      if (alm && s.almacen_id && String(s.almacen_id) === String(alm)) return true;
      return false;
    });
  }

  async function cargarEntregasPendientes() {
    var host = ensureCcBlock();
    if (!host) return;
    if (!online()) {
      host.innerHTML = '<p class="lista-estado muted">Sin conexión — no se pueden cargar entregas de caja.</p>';
      return;
    }
    host.innerHTML = '<p class="lista-estado muted">Cargando entregas…</p>';
    var list = await listarDeclaradas();
    var mis = await sesionesUsuarioActual();
    var visible = list.filter(function (e) { return entregaVisibleParaMi(e, mis); });
    // también notificaciones al emisor (diferencias ya recibidas)
    tryShowEmisorNotif();
    if (!visible.length) {
      host.innerHTML = '<p class="lista-estado">Sin entregas de caja pendientes para vos.</p>';
      return;
    }
    host.innerHTML = '';
    visible.forEach(function (e) {
      var card = document.createElement('div');
      card.className = 'bc-m273-card';
      card.innerHTML =
        '<div><strong>💰 Entrega de caja pendiente</strong>' +
        '<small>' + esc(e.declarado_nombre || 'Trabajador') + ' declaró: $' + esc(moneyFmt(e.monto_declarado)) +
        '. La entrega debe ser contada.</small></div>' +
        '<button type="button" class="cc-accion" data-m273-revisar="' + esc(e.id) + '">Revisar entrega</button>';
      host.appendChild(card);
    });
  }

  function ensureCcBlock() {
    var atencion = document.getElementById('cc-atencion');
    var parent = atencion && atencion.parentNode;
    if (!parent) {
      var tab = document.getElementById('tab-resumen');
      if (!tab) return null;
      parent = tab;
    }
    var block = document.getElementById(CC_BLOCK_ID);
    if (block) return block;
    var wrap = document.createElement('div');
    wrap.className = 'cc-bloque';
    wrap.innerHTML = '<h3>Entregas de caja</h3><div id="' + CC_BLOCK_ID + '"></div>';
    if (atencion && atencion.parentNode === parent) {
      parent.insertBefore(wrap, atencion);
    } else {
      parent.insertBefore(wrap, parent.firstChild);
    }
    return document.getElementById(CC_BLOCK_ID);
  }

  async function obtenerEntrega(id) {
    var r = await client.rpc('obtener_entrega_caja', { p_entrega_id: id });
    if (r && r.error) throw r.error;
    var d = r ? r.data : null;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch (e) {}
    }
    return d;
  }

  async function completarEstadoBackend(entregaId, contado, declarado) {
    // Una sola decisión de usuario; si el backend quedó en CONTADA, cerrar a APROBADA/RECHAZADA sin UI extra.
    var diff = Number(contado) - Number(declarado);
    try {
      if (Math.abs(diff) < 0.0001) {
        await client.rpc('revisar_entrega_caja', {
          p_entrega_id: entregaId,
          p_decision: 'aprobar',
          p_comentario: null,
          p_idempotency_key: uuid()
        });
      } else {
        await client.rpc('revisar_entrega_caja', {
          p_entrega_id: entregaId,
          p_decision: 'rechazar',
          p_comentario: 'Diferencia en recepción: declarado ' + declarado + ', contado ' + contado + ', diferencia ' + diff,
          p_idempotency_key: uuid()
        });
        pushNotifEmisor(entregaId, declarado, contado, diff);
      }
    } catch (e) {
      // Si revisar falla (permisos editar_any), la recepción ya quedó CONTADA con diferencia registrada.
      try { console.warn('[M27.3] completar estado', e); } catch (x) {}
      if (Math.abs(diff) >= 0.0001) pushNotifEmisor(entregaId, declarado, contado, diff);
    }
  }

  function pushNotifEmisor(entregaId, declarado, contado, diff) {
    try {
      var raw = localStorage.getItem(LS_NOTIF) || '[]';
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) arr = [];
      arr.push({
        id: entregaId,
        declarado: declarado,
        contado: contado,
        diferencia: diff,
        ts: Date.now(),
        visto: false
      });
      localStorage.setItem(LS_NOTIF, JSON.stringify(arr.slice(-20)));
    } catch (e) {}
  }

  function tryShowEmisorNotif() {
    var me = uid();
    if (!me) return;
    try {
      var arr = JSON.parse(localStorage.getItem(LS_NOTIF) || '[]');
      if (!Array.isArray(arr)) return;
      var pending = arr.filter(function (n) { return !n.visto; });
      if (!pending.length) return;
      // Solo mostrar si el usuario actual fue el emisor de alguna; se verifica al abrir con listado propio
      listarMisDeclaradasRecientes().then(function (mis) {
        var ids = {};
        (mis || []).forEach(function (e) { ids[String(e.id)] = true; });
        var hit = pending.find(function (n) { return ids[String(n.id)]; });
        if (!hit) return;
        showToastNotif(hit);
        hit.visto = true;
        try {
          localStorage.setItem(LS_NOTIF, JSON.stringify(arr));
        } catch (e) {}
      });
    } catch (e) {}
  }

  async function listarMisDeclaradasRecientes() {
    if (!online()) return [];
    try {
      var r = await client.rpc('listar_entregas_caja', { p_ciclo_id: null, p_almacen_id: null, p_estado: null });
      var d = r && r.data ? (Array.isArray(r.data) ? r.data : [r.data]) : [];
      var me = uid();
      return d.filter(function (e) {
        return e.declarado_por && String(e.declarado_por) === String(me);
      });
    } catch (e) {
      return [];
    }
  }

  function showToastNotif(n) {
    var old = document.getElementById(NOTIF_ID);
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = NOTIF_ID;
    el.innerHTML =
      '<strong>⚠ Entrega de caja recibida con diferencia</strong><br>' +
      'Declaraste: $' + esc(moneyFmt(n.declarado)) + '<br>' +
      'Recibieron: $' + esc(moneyFmt(n.contado)) + '<br>' +
      'Diferencia: $' + esc(moneyFmt(n.diferencia)) +
      '<br><button type="button" id="bc-m273-notif-x">Entendido</button>';
    document.body.appendChild(el);
    var x = document.getElementById('bc-m273-notif-x');
    if (x) x.onclick = function () { el.remove(); };
  }

  function abrirRecepcion(entregaId) {
    if (!online()) {
      openModal(
        '<h3>Entrega de caja</h3><p class="bc-m273-lead">Necesitas conexión para registrar la recepción.</p>' +
        '<div class="bc-m273-actions"><button type="button" class="bc-m273-cancel" id="bc-m273-cancel">Cerrar</button></div>'
      );
      document.getElementById('bc-m273-cancel').onclick = closeModal;
      return;
    }
    openModal('<h3>Entrega de caja</h3><p class="bc-m273-lead">Cargando…</p>');
    obtenerEntrega(entregaId).then(function (e) {
      if (!e) {
        openModal('<h3>Entrega de caja</h3><p class="bc-m273-msg err">No se encontró la entrega.</p>' +
          '<div class="bc-m273-actions"><button type="button" class="bc-m273-cancel" id="bc-m273-cancel">Cerrar</button></div>');
        document.getElementById('bc-m273-cancel').onclick = closeModal;
        return;
      }
      var declarado = Number(e.monto_declarado) || 0;
      openModal(
        '<h3>Entrega de caja</h3>' +
        '<p class="bc-m273-lead">Declarado por: <strong>' + esc(e.declarado_nombre || '—') + '</strong><br>' +
        'Monto declarado: <strong>$' + esc(moneyFmt(declarado)) + '</strong></p>' +
        '<label for="bc-m273-contado">¿Cuánto recibiste?</label>' +
        '<input id="bc-m273-contado" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" autocomplete="off">' +
        '<div class="bc-m273-actions">' +
        '<button type="button" class="bc-m273-cancel" id="bc-m273-cancel">Cancelar</button>' +
        '<button type="button" class="bc-m273-ok" id="bc-m273-recv">Confirmar recepción</button>' +
        '</div>' +
        '<p class="bc-m273-msg" id="bc-m273-msg"></p>'
      );
      document.getElementById('bc-m273-cancel').onclick = closeModal;
      document.getElementById('bc-m273-recv').onclick = function () {
        var msgEl = document.getElementById('bc-m273-msg');
        var inp = document.getElementById('bc-m273-contado');
        var contado = parseMonto(inp && inp.value);
        if (contado === null) {
          if (msgEl) {
            msgEl.className = 'bc-m273-msg err';
            msgEl.textContent = 'Ingresá cuánto recibiste (número ≥ 0).';
          }
          return;
        }
        confirmarRecepcion(e, contado, msgEl, document.getElementById('bc-m273-recv'));
      };
    }).catch(function (err) {
      openModal(
        '<h3>Entrega de caja</h3><p class="bc-m273-msg err">' + esc(String(err && err.message || err)) + '</p>' +
        '<div class="bc-m273-actions"><button type="button" class="bc-m273-cancel" id="bc-m273-cancel">Cerrar</button></div>'
      );
      document.getElementById('bc-m273-cancel').onclick = closeModal;
    });
  }

  async function confirmarRecepcion(entrega, contado, msgEl, btn) {
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    var declarado = Number(entrega.monto_declarado) || 0;
    var diff = contado - declarado;
    try {
      var r = await client.rpc('registrar_recepcion_entrega_caja', {
        p_entrega_id: entrega.id,
        p_monto_contado: contado,
        p_observacion_conteo: null,
        p_idempotency_key: uuid()
      });
      if (r && r.error) throw r.error;
      await completarEstadoBackend(entrega.id, contado, declarado);

      if (Math.abs(diff) < 0.0001) {
        openModal(
          '<h3>✓ Entrega aprobada</h3>' +
          '<div class="bc-m273-okbox">' +
          'Declarado: $' + esc(moneyFmt(declarado)) + '<br>' +
          'Recibido: $' + esc(moneyFmt(contado)) + '<br>' +
          'Diferencia: $0' +
          '</div>' +
          '<div class="bc-m273-actions"><button type="button" class="bc-m273-ok" id="bc-m273-done">Entendido</button></div>'
        );
      } else {
        openModal(
          '<h3>⚠ Diferencia detectada</h3>' +
          '<div class="bc-m273-diff">' +
          'Declarado: $' + esc(moneyFmt(declarado)) + '<br>' +
          'Contado: $' + esc(moneyFmt(contado)) + '<br>' +
          'Diferencia: $' + esc(moneyFmt(diff)) +
          '</div>' +
          '<p class="bc-m273-lead">La diferencia queda registrada. El emisor recibirá una notificación informativa (sin nueva aprobación).</p>' +
          '<div class="bc-m273-actions"><button type="button" class="bc-m273-danger" id="bc-m273-done">Confirmar diferencia</button></div>'
        );
      }
      var done = document.getElementById('bc-m273-done');
      if (done) done.onclick = function () {
        closeModal();
        cargarEntregasPendientes();
      };
    } catch (e) {
      if (msgEl) {
        msgEl.className = 'bc-m273-msg err';
        msgEl.textContent = 'No se pudo registrar: ' + String(e && (e.message || e.details) || e);
      }
      if (btn) btn.disabled = false;
    } finally {
      busy = false;
    }
  }

  function wireCcClicks() {
    var tab = document.getElementById('tab-resumen');
    if (!tab || tab.dataset.m273Bound === '1') return;
    tab.dataset.m273Bound = '1';
    tab.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-m273-revisar]');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      abrirRecepcion(b.getAttribute('data-m273-revisar'));
    });
  }

  function patchRefrescos() {
    if (typeof window.refrescarCentroControl === 'function' && !window.refrescarCentroControl.__m273) {
      var orig = window.refrescarCentroControl;
      var wrapped = async function () {
        var ret = await orig.apply(this, arguments);
        try { await cargarEntregasPendientes(); } catch (e) {}
        tryShowEmisorNotif();
        return ret;
      };
      wrapped.__m273 = true;
      window.refrescarCentroControl = wrapped;
    }
    if (typeof window.__BC_M25_refrescarTurno === 'function' && !window.__BC_M25_refrescarTurno.__m273) {
      var o2 = window.__BC_M25_refrescarTurno;
      var w2 = async function () {
        var r = await o2.apply(this, arguments);
        updateCerrarBtn();
        return r;
      };
      w2.__m273 = true;
      window.__BC_M25_refrescarTurno = w2;
    }
  }

  function wireAjustesLogout() {
    // Asegura que el botón de Ajustes exista; ui-ajustes-panel se parchea aparte.
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('#bc-aj-logout');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      doLogoutGlobal();
    }, true);
  }

  async function doLogoutGlobal() {
    try {
      if (typeof resetearNavegacionParaNuevaSesion === 'function') resetearNavegacionParaNuevaSesion();
    } catch (e) {}
    try {
      if (typeof limpiarContextoUsuario === 'function') limpiarContextoUsuario();
    } catch (e2) {}
    try {
      window._turnoActual = null;
      if (typeof _turnoActual !== 'undefined') _turnoActual = null;
    } catch (e3) {}
    var ue = document.getElementById('user-email');
    if (ue) ue.textContent = '';
    try {
      await client.auth.signOut();
    } catch (e4) {
      try { console.warn('[M27.3] signOut', e4); } catch (x) {}
    }
  }

  // Exponer para el panel de Ajustes
  window.__BC_M273_logout = doLogoutGlobal;

  function boot() {
    injectCss();
    ensureCerrarBtn();
    updateCerrarBtn();
    wireCcClicks();
    wireAjustesLogout();
    patchRefrescos();
    setTimeout(function () {
      updateCerrarBtn();
      cargarEntregasPendientes();
      patchRefrescos();
    }, 900);
    setTimeout(function () {
      updateCerrarBtn();
      cargarEntregasPendientes();
    }, 2500);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        updateCerrarBtn();
        cargarEntregasPendientes();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
