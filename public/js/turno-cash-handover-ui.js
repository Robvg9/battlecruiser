// BattleCruiser · conciliación de dinero entregado por responsable y contado por ADMIN.
// El backend es la fuente de verdad; este módulo solo consume RPCs autenticadas.
(function () {
  'use strict';
  if (window.__BC5_CASH_HANDOVER_UI__) return;
  window.__BC5_CASH_HANDOVER_UI__ = true;

  const PANEL_ID = 'bc5-cash-handover-panel';
  const STYLE_ID = 'bc5-cash-handover-style';
  const state = { rows: [], loading: false, firstLoad: true, previous: new Map(), busy: new Set() };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function amount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    try { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    catch (_) { return n.toFixed(2); }
  }
  function date(value) {
    if (!value) return 'Fecha no disponible';
    const d = new Date(value + (String(value).length === 10 ? 'T12:00:00' : ''));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('es-ES');
  }
  function rpc(name, args) {
    // core.js exposes Supabase as a top-level lexical const, not window.client.
    if (typeof client === 'undefined' || !client || typeof client.rpc !== 'function') {
      return Promise.reject(new Error('Cliente del servidor no disponible.'));
    }
    return client.rpc(name, args || {}).then(function (response) {
      if (response && response.error) throw response.error;
      return response ? response.data : null;
    });
  }
  function list(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.items)) return value.items;
    return [];
  }
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + PANEL_ID + '{display:none;margin:0 0 14px;padding:12px;border:1px solid rgba(201,162,77,.38);border-radius:10px;background:var(--panel-bg,#171c24);color:var(--text,#f5f5f5)}',
      '#' + PANEL_ID + '.visible{display:block}',
      '#' + PANEL_ID + ' .bc5-cash-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}',
      '#' + PANEL_ID + ' .bc5-cash-head h3{font-size:.92rem;margin:0;letter-spacing:.04em}',
      '#' + PANEL_ID + ' .bc5-cash-head button,#' + PANEL_ID + ' .bc5-cash-card button{min-height:34px;padding:7px 10px;border:1px solid rgba(201,162,77,.45);border-radius:7px;background:rgba(201,162,77,.1);color:inherit;font-weight:600}',
      '#' + PANEL_ID + ' .bc5-cash-card{padding:10px 0;border-top:1px solid rgba(255,255,255,.09)}',
      '#' + PANEL_ID + ' .bc5-cash-card:first-of-type{border-top:0}',
      '#' + PANEL_ID + ' .bc5-cash-meta{font-size:.77rem;opacity:.7;line-height:1.45}',
      '#' + PANEL_ID + ' .bc5-cash-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}',
      '#' + PANEL_ID + ' .bc5-cash-value{padding:7px;border-radius:7px;background:rgba(255,255,255,.045);min-width:0}',
      '#' + PANEL_ID + ' .bc5-cash-value small{display:block;font-size:.68rem;opacity:.65}',
      '#' + PANEL_ID + ' .bc5-cash-value b{display:block;font-size:.9rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}',
      '#' + PANEL_ID + ' .bc5-cash-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;margin-top:8px}',
      '#' + PANEL_ID + ' .bc5-cash-form label{display:block;font-size:.75rem}',
      '#' + PANEL_ID + ' .bc5-cash-form input{box-sizing:border-box;width:100%;min-height:38px;margin-top:4px;padding:8px;border:1px solid rgba(255,255,255,.2);border-radius:7px;background:rgba(0,0,0,.18);color:inherit;font:inherit}',
      '#' + PANEL_ID + ' .bc5-cash-status{font-size:.78rem;margin-top:7px;line-height:1.4}',
      '#' + PANEL_ID + ' .bc5-cash-status.warn{color:#f5c66c}',
      '#' + PANEL_ID + ' .bc5-cash-status.ok{color:#86efac}',
      '#' + PANEL_ID + ' .bc5-cash-status.error{color:#fca5a5}',
      '#bc5-cash-handover-toast{position:fixed;z-index:12000;left:12px;right:12px;bottom:16px;max-width:560px;margin:auto;padding:12px 14px;border:1px solid rgba(201,162,77,.65);border-radius:9px;background:#17211e;color:#fff;box-shadow:0 10px 36px rgba(0,0,0,.35);font-size:.86rem;line-height:1.4}',
      '@media(min-width:720px){#' + PANEL_ID + '{max-width:900px}#' + PANEL_ID + ' .bc5-cash-card{display:grid;grid-template-columns:minmax(0,1fr) minmax(270px,.7fr);column-gap:14px}#' + PANEL_ID + ' .bc5-cash-values,#' + PANEL_ID + ' .bc5-cash-form,#' + PANEL_ID + ' .bc5-cash-status{grid-column:2}}',
      '@media(max-width:420px){#' + PANEL_ID + ' .bc5-cash-values{grid-template-columns:1fr 1fr}#' + PANEL_ID + ' .bc5-cash-form{grid-template-columns:1fr}#' + PANEL_ID + ' .bc5-cash-form button{width:100%}}'
    ].join('');
    document.head.appendChild(style);
  }
  function panel() {
    let host = document.getElementById(PANEL_ID);
    if (host) return host;
    const tab = document.getElementById('tab-resumen');
    if (!tab) return null;
    host = document.createElement('section');
    host.id = PANEL_ID;
    host.setAttribute('aria-live', 'polite');
    host.innerHTML = '<div class="bc5-cash-head"><h3>ENTREGAS DE EFECTIVO</h3><button type="button" data-bc5-cash-refresh>Actualizar</button></div><div data-bc5-cash-list></div>';
    const anchor = document.getElementById('cc-atencion');
    const block = anchor && anchor.closest('.cc-bloque');
    if (block && block.parentNode) block.parentNode.insertBefore(host, block.nextSibling);
    else tab.insertBefore(host, tab.firstChild);
    host.addEventListener('click', onPanelClick);
    return host;
  }
  function toast(message) {
    const old = document.getElementById('bc5-cash-handover-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'bc5-cash-handover-toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    window.setTimeout(function () { if (el.isConnected) el.remove(); }, 7500);
  }
  function rowHtml(row) {
    const status = String(row.estado_aprobacion || '').toUpperCase();
    const pending = status === 'ESPERANDO_APROBACION' || status === 'PENDIENTE';
    const discrepancy = status === 'CON_DIFERENCIA';
    const completed = String(row.estado_sesion || '').toUpperCase() === 'COMPLETADA';
    const id = esc(row.declaracion_id);
    const details = esc(row.almacen_nombre || 'Almacén') + ' · Día ' + esc(row.numero_dia || '—') +
      ' · ' + esc(row.bloque === 'JORNADA' ? 'Jornada completa' : row.bloque || 'Sesión') +
      ' · ' + esc(date(row.fecha));
    let actions = '';
    if (pending && completed) {
      actions = '<form class="bc5-cash-form" data-bc5-cash-form="' + id + '">' +
        '<label>Dinero contado por el dueño (CUP)<input type="number" min="0" step="0.01" inputmode="decimal" required data-bc5-cash-amount placeholder="0.00"><input type="text" maxlength="1000" data-bc5-cash-observation placeholder="Observación del conteo (opcional)"></label>' +
        '<button type="submit">Registrar conteo</button></form>' +
        '<div class="bc5-cash-status" data-bc5-cash-msg></div>';
    } else if (pending) {
      actions = '<div class="bc5-cash-status warn">La responsable todavía no ha completado la sesión. El conteo se habilitará después del cierre confirmado.</div>';
    } else if (discrepancy) {
      actions = '<div class="bc5-cash-status warn">Diferencia pendiente de revisión. No se ha descontado ni ajustado dinero automáticamente.</div>' +
        (row.diferencia_id ? '<button type="button" data-bc5-cash-resolve="' + esc(row.diferencia_id) + '">Revisar y resolver diferencia</button>' : '');
    }
    return '<article class="bc5-cash-card" data-bc5-cash-id="' + id + '">' +
      '<div><b>' + esc(row.responsable_nombre || 'Responsable') + '</b><div class="bc5-cash-meta">' + details + '</div>' +
      '<div class="bc5-cash-meta">Estado de sesión: ' + esc(row.estado_sesion || '—') + '</div></div>' +
      '<div><div class="bc5-cash-values"><div class="bc5-cash-value"><small>Declarado</small><b>' + amount(row.monto_declarado) + '</b></div>' +
      '<div class="bc5-cash-value"><small>Contado por dueño</small><b>' + amount(row.monto_contado) + '</b></div>' +
      '<div class="bc5-cash-value"><small>Diferencia</small><b>' + amount(row.diferencia) + '</b></div></div>' +
      '<div class="bc5-cash-meta">Estado de entrega: ' + esc(status === 'ESPERANDO_APROBACION' ? 'Pendiente de contar' : discrepancy ? 'Diferencia pendiente' : status) + '</div>' +
      actions + '</div></article>';
  }
  function render(rows) {
    const host = panel();
    if (!host) return;
    const listHost = host.querySelector('[data-bc5-cash-list]');
    state.rows = rows;
    if (!rows.length) {
      host.classList.remove('visible');
      listHost.innerHTML = '';
      return;
    }
    host.classList.add('visible');
    listHost.innerHTML = rows.map(rowHtml).join('');
  }
  function notifyChanges(rows) {
    const current = new Map();
    rows.forEach(function (row) {
      const id = String(row.declaracion_id || '');
      const status = String(row.estado_aprobacion || '');
      current.set(id, status);
      if (!state.firstLoad && state.previous.has(id) && state.previous.get(id) !== status && status === 'CON_DIFERENCIA') {
        toast('Hay una diferencia en el dinero contado de ' + (row.responsable_nombre || 'una responsable') +
          ': declarado ' + amount(row.monto_declarado) + ', contado ' + amount(row.monto_contado) + '.');
      } else if (!state.firstLoad && !state.previous.has(id) && status === 'ESPERANDO_APROBACION') {
        toast('Dinero entregado pendiente de contar · ' + (row.responsable_nombre || 'Responsable') +
          ' · ' + (row.almacen_nombre || 'Almacén') + ' · ' + amount(row.monto_declarado) + ' CUP.');
      }
    });
    state.previous = current;
    state.firstLoad = false;
  }
  async function refresh() {
    if (state.loading || navigator.onLine === false || document.visibilityState === 'hidden') return;
    state.loading = true;
    try {
      const rows = list(await rpc('bc5_listar_dinero_pendiente_contar'));
      notifyChanges(rows);
      render(rows);
    } catch (error) {
      // A non-admin account is expected to be denied. Do not expose an admin-only panel.
      const host = document.getElementById(PANEL_ID);
      if (host) host.classList.remove('visible');
      const code = error && (error.code || error.status);
      if (code !== '42501' && code !== 'PGRST301') {
        console.warn('[BC5 cash handover] No se pudo actualizar el panel:', error && error.message ? error.message : error);
      }
    } finally {
      state.loading = false;
    }
  }
  async function onPanelClick(event) {
    const refreshButton = event.target.closest('[data-bc5-cash-refresh]');
    if (refreshButton) { await refresh(); return; }
    const resolveButton = event.target.closest('[data-bc5-cash-resolve]');
    if (resolveButton) {
      const differenceId = resolveButton.dataset.bc5CashResolve;
      const comment = window.prompt('Describe brevemente la revisión de esta diferencia:');
      if (comment == null) return;
      resolveButton.disabled = true;
      try {
        await rpc('bc_aprobar_diferencia', { p_diferencia_id: differenceId, p_comentario: comment });
        toast('Diferencia revisada y registrada. La declaración conserva el conteo original.');
        await refresh();
      } catch (error) {
        alert('No se pudo resolver la diferencia: ' + (error && error.message ? error.message : error));
        resolveButton.disabled = false;
      }
    }
  }
  async function onPanelSubmit(event) {
    const form = event.target.closest('[data-bc5-cash-form]');
    if (!form) return;
    event.preventDefault();
    const id = form.dataset.bc5CashForm;
    if (!id || state.busy.has(id)) return;
    const input = form.querySelector('[data-bc5-cash-amount]');
    const msg = form.querySelector('[data-bc5-cash-msg]');
    const value = input ? input.value.trim() : '';
    const amountValue = Number(value);
    const observation = form.querySelector('[data-bc5-cash-observation]');
    if (value === '' || !Number.isFinite(amountValue) || amountValue < 0) {
      if (msg) { msg.className = 'bc5-cash-status error'; msg.textContent = 'Introduce un importe válido, incluido 0 si corresponde.'; }
      return;
    }
    if (!window.confirm('¿Confirmas que este es el efectivo contado físicamente por ti? El registro no se podrá sobrescribir.')) return;
    state.busy.add(id);
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (msg) { msg.className = 'bc5-cash-status'; msg.textContent = 'Guardando conteo y verificando con el servidor…'; }
    try {
      const result = await rpc('bc5_contar_dinero_entregado', {
        p_declaracion_id: id,
        p_monto_contado: amountValue,
        p_observacion: observation ? observation.value.trim() || null : null
      });
      if (result && result.estado === 'APROBADA') {
        toast('Conteo confirmado: declarado y recibido coinciden (' + amount(result.monto_contado) + ' CUP).');
      } else {
        toast('Diferencia registrada: ' + amount(result && result.diferencia) + ' CUP. Queda pendiente de revisión.');
      }
      await refresh();
    } catch (error) {
      if (msg) { msg.className = 'bc5-cash-status error'; msg.textContent = 'No se guardó: ' + (error && error.message ? error.message : error); }
      if (button) button.disabled = false;
    } finally {
      state.busy.delete(id);
    }
  }
  function boot() {
    injectStyle();
    panel();
    document.addEventListener('submit', onPanelSubmit);
    document.addEventListener('click', function (event) {
      const tab = event.target.closest('.tab-btn[data-tab="resumen"]');
      if (tab) window.setTimeout(refresh, 150);
    });
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    refresh();
    window.setInterval(refresh, 45000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();