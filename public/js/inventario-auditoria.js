// BattleCruiser · auditoría física de inventario por almacén.
(function () {
  'use strict';
  if (window.__BC_INVENTORY_AUDIT_UI__) return;
  window.__BC_INVENTORY_AUDIT_UI__ = true;

  const $ = (id) => document.getElementById(id);
  const api = () => window.client || (typeof client !== 'undefined' ? client : null);
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const fmt = (value) => typeof window.numberFmt === 'function'
    ? window.numberFmt(value) : String(value == null ? 0 : value);
  const warehouses = () => (typeof _cache !== 'undefined' && Array.isArray(_cache.almacenes))
    ? _cache.almacenes.filter((w) => w && w.activo !== false && w.tipo === 'almacenamiento')
    : [];

  let currentAuditId = null;
  let currentAudit = null;
  let currentLines = [];
  let busy = false;

  function permitted(action) {
    return typeof window.tienePermiso !== 'function' || window.tienePermiso('auditoria', action);
  }

  function statusLabel(status) {
    return ({
      ABIERTA: 'En conteo',
      COMPLETADA: 'Completada',
      COMPLETADA_CON_DIFERENCIAS: 'Completada · diferencias',
      CANCELADA: 'Cancelada'
    })[status] || status || '—';
  }

  function showMessage(message, ok) {
    const host = $('inventario-auditoria-msg');
    if (!host) return;
    host.textContent = message || '';
    host.className = 'msg inv-audit-message' + (message ? (ok ? ' success' : ' error') : '');
  }

  function isMissingAuditRpc(error) {
    const message = [
      error && error.message,
      error && error.details,
      error && error.hint
    ].filter(Boolean).join(' ');
    return !!error && (
      error.code === 'PGRST202' ||
      (/could not find the function|schema cache/i.test(message) &&
        /inventario_auditoria_(listar|iniciar|detalle|guardar_conteos|finalizar|cancelar)/i.test(message))
    );
  }

  function auditErrorMessage(error, fallback) {
    if (isMissingAuditRpc(error)) {
      return 'El conteo físico aún no está habilitado en Supabase LIVE. La migración de esta función todavía no se ha aplicado; no inicies ni guardes un conteo hasta que se complete ese paso.';
    }
    return error && error.message ? error.message : fallback;
  }


  async function rpc(name, args) {
    const clientApi = api();
    if (!clientApi || typeof clientApi.rpc !== 'function') throw new Error('La conexión con Supabase no está lista.');
    const result = await clientApi.rpc(name, args || {});
    if (result && result.error) throw result.error;
    return result ? result.data : null;
  }

  async function ensureWarehouses() {
    if (!warehouses().length && typeof window.refrescarAlmacenes === 'function') {
      await window.refrescarAlmacenes();
    }
  }

  function renderShell() {
    const host = $('mando-auditoria-fisica');
    if (!host) return;
    host.innerHTML =
      '<div class="inv-audit-top">' +
        '<div><h3>Conteo físico</h3><p class="muted">Exclusivo para almacenes de almacenamiento. Mientras el conteo esté abierto, el inventario queda bloqueado.</p></div>' +
        '<button type="button" class="cc-accion" id="inv-audit-refresh">Actualizar</button>' +
      '</div>' +
      '<div class="inv-audit-start" id="inv-audit-start">' +
        '<label>Almacén<select id="inv-audit-warehouse"><option value="">Seleccionar almacén de almacenamiento…</option></select></label>' +
        '<button type="button" id="inv-audit-start-btn">Iniciar conteo físico</button>' +
      '</div>' +
      '<p class="inv-audit-policy muted">Cada producto se cuenta por separado. Un campo vacío significa «sin contar»; escribe 0 para registrar cero unidades. Las diferencias requieren motivo. Finalizar no modifica existencias automáticamente.</p>' +
      '<div id="inv-audit-history" class="inv-audit-history" aria-live="polite"></div>' +
      '<div id="inv-audit-detail" class="inv-audit-detail" aria-live="polite"></div>' +
      '<p id="inventario-auditoria-msg" class="msg inv-audit-message" role="status" aria-live="polite"></p>';

    const canStart = permitted('crear') || permitted('editar_any');
    $('inv-audit-start').hidden = !canStart;
    $('inv-audit-refresh').addEventListener('click', refreshAll);
    $('inv-audit-start-btn').addEventListener('click', startAudit);
    $('inv-audit-history').addEventListener('click', (event) => {
      const button = event.target.closest('[data-audit-open]');
      if (button) openAudit(button.dataset.auditOpen);
    });
    $('inv-audit-detail').addEventListener('click', async (event) => {
      const save = event.target.closest('#inv-audit-save');
      const finish = event.target.closest('#inv-audit-finish');
      const cancel = event.target.closest('#inv-audit-cancel');
      if (save) await saveCounts(false);
      if (finish) await saveCounts(true);
      if (cancel) await cancelAudit();
    });
  }

  function populateWarehouseSelect() {
    const select = $('inv-audit-warehouse');
    if (!select) return;
    const old = select.value;
    select.innerHTML = '<option value="">Seleccionar almacén de almacenamiento…</option>' +
      warehouses().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
        .map((w) => '<option value="' + esc(w.id) + '">' + esc(w.nombre) + '</option>').join('');
    if (warehouses().some((w) => String(w.id) === old)) select.value = old;
  }

  async function refreshAll() {
    try {
      showMessage('', true);
      await ensureWarehouses();
      populateWarehouseSelect();
      const rows = await rpc('inventario_auditoria_listar', { p_almacen_id: null });
      renderHistory(Array.isArray(rows) ? rows : []);
    } catch (error) {
      showMessage(auditErrorMessage(error, 'No se pudo cargar el historial de conteos.'), false);
    }
  }

  function renderHistory(rows) {
    const host = $('inv-audit-history');
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = '<p class="lista-estado">Todavía no hay conteos físicos registrados.</p>';
      return;
    }
    host.innerHTML = '<h4>Historial de conteos</h4>' + rows.map((row) => {
      const counts = fmt(row.contadas) + ' / ' + fmt(row.total_lineas) + ' contados';
      const diff = Number(row.diferencias || 0);
      return '<button type="button" class="inv-audit-history-item" data-audit-open="' + esc(row.id) + '">' +
        '<span><strong>' + esc(row.almacen || 'Almacén') + '</strong><small>' +
          esc(row.creado_en ? new Date(row.creado_en).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—') +
        '</small></span><span class="inv-audit-history-meta"><b>' + esc(statusLabel(row.estado)) +
          '</b><small>' + esc(counts) + (diff ? ' · ' + fmt(diff) + ' diferencias' : '') + '</small></span></button>';
    }).join('');
  }

  async function startAudit() {
    if (busy) return;
    const warehouseId = $('inv-audit-warehouse') && $('inv-audit-warehouse').value;
    if (!warehouseId) return showMessage('Selecciona un almacén de almacenamiento.', false);
    if (!window.confirm('¿Iniciar el conteo? Los movimientos de inventario de este almacén quedarán bloqueados hasta finalizarlo.')) return;
    busy = true;
    try {
      showMessage('Creando corte de referencia y bloqueando movimientos…', true);
      const id = await rpc('inventario_auditoria_iniciar', { p_almacen_id: warehouseId });
      currentAuditId = id;
      await refreshAll();
      await loadAuditDetail(id);
      showMessage('Conteo iniciado. El sistema ya está bloqueando movimientos de este almacén.', true);
    } catch (error) {
      showMessage(auditErrorMessage(error, 'No se pudo iniciar el conteo.'), false);
    } finally { busy = false; }
  }

  async function loadAuditDetail(id) {
    currentAuditId = id;
    const history = await rpc('inventario_auditoria_listar', { p_almacen_id: null });
    const row = (Array.isArray(history) ? history : []).find((item) => String(item.id) === String(id));
    const lines = await rpc('inventario_auditoria_detalle', { p_auditoria_id: id });
    currentAudit = row || null;
    currentLines = Array.isArray(lines) ? lines : [];
    renderDetail();
    showMessage('', true);
  }

  async function openAudit(id) {
    if (busy) return;
    busy = true;
    try { await loadAuditDetail(id); }
    catch (error) { showMessage(auditErrorMessage(error, 'No se pudo abrir el detalle del conteo.'), false); }
    finally { busy = false; }
  }

  function renderDetail() {
    const host = $('inv-audit-detail');
    if (!host) return;
    if (!currentAudit) { host.innerHTML = ''; return; }
    const open = currentAudit.estado === 'ABIERTA';
    const count = currentLines.filter((line) => line.cantidad_fisica != null).length;
    const differences = currentLines.filter((line) =>
      line.cantidad_fisica != null && Number(line.cantidad_fisica) !== Number(line.cantidad_sistema)).length;
    host.innerHTML =
      '<div class="inv-audit-detail-head"><div><h4>' + esc(currentAudit.almacen || 'Conteo físico') + '</h4>' +
        '<p class="muted">' + esc(statusLabel(currentAudit.estado)) + ' · ' + fmt(count) + ' / ' + fmt(currentLines.length) + ' productos contados' +
        (differences ? ' · ' + fmt(differences) + ' diferencias' : '') + '</p></div>' +
        '<span class="inv-audit-lock ' + (open ? 'is-open' : 'is-closed') + '">' + (open ? '🔒 Bloqueado' : 'Desbloqueado') + '</span></div>' +
      '<p class="muted inv-audit-help">' + (open
        ? 'Introduce la cantidad física. Para diferencias, explica el motivo antes de finalizar.'
        : 'Este expediente es histórico. Las cantidades del sistema y del conteo se conservan; no se aplicaron ajustes automáticos.') + '</p>' +
      '<div class="inv-audit-lines">' + currentLines.map((line) => {
        const hasCount = line.cantidad_fisica != null;
        const diff = hasCount && Number(line.cantidad_fisica) !== Number(line.cantidad_sistema);
        return '<article class="inv-audit-line" data-audit-line="' + esc(line.linea_id) + '">' +
          '<div class="inv-audit-line-main"><strong>' + esc(line.producto) + '</strong><small>' +
            esc(line.unidad || 'Unidad') + ' · Sistema: ' + esc(fmt(line.cantidad_sistema)) + '</small></div>' +
          (open
            ? '<label>Físico<input type="number" min="0" step="any" inputmode="decimal" data-audit-quantity value="' +
                (hasCount ? esc(line.cantidad_fisica) : '') + '" placeholder="Sin contar"></label>' +
              '<label class="inv-audit-reason">Motivo de diferencia<input type="text" maxlength="300" data-audit-reason value="' +
                esc(line.motivo || '') + '" placeholder="Obligatorio si no coincide"></label>'
            : '<div class="inv-audit-line-result"><b>' + (hasCount ? esc(fmt(line.cantidad_fisica)) : '—') +
                '</b><small>' + (diff ? 'Diferencia: ' + esc(fmt(Number(line.cantidad_fisica) - Number(line.cantidad_sistema))) : 'Sin diferencia') +
                (line.motivo ? ' · ' + esc(line.motivo) : '') + '</small></div>') +
        '</article>';
      }).join('') + '</div>' +
      (open ? '<div class="inv-audit-actions"><button type="button" class="cc-accion" id="inv-audit-save">Guardar conteos</button>' +
        '<button type="button" id="inv-audit-finish">Finalizar conteo</button>' +
        '<button type="button" id="inv-audit-cancel">Cancelar conteo</button></div>' : '');
  }

  function collectCounts() {
    const host = $('inv-audit-detail');
    if (!host) return [];
    const payload = [];
    host.querySelectorAll('[data-audit-line]').forEach((row) => {
      const quantity = row.querySelector('[data-audit-quantity]');
      if (!quantity || String(quantity.value).trim() === '') return;
      const value = Number(quantity.value);
      if (!Number.isFinite(value) || value < 0) throw new Error('Cada cantidad debe ser un número igual o mayor que cero.');
      const reason = row.querySelector('[data-audit-reason]');
      payload.push({
        linea_id: row.dataset.auditLine,
        cantidad_fisica: value,
        motivo: reason ? reason.value.trim() : ''
      });
    });
    return payload;
  }

  async function saveCounts(andFinish) {
    if (busy || !currentAuditId || !currentAudit || currentAudit.estado !== 'ABIERTA') return;
    busy = true;
    try {
      const counts = collectCounts();
      if (counts.length) {
        showMessage('Guardando conteos…', true);
        await rpc('inventario_auditoria_guardar_conteos', {
          p_auditoria_id: currentAuditId,
          p_conteos: counts
        });
      }
      if (andFinish) {
        if (!window.confirm('¿Finalizar? Debes haber contado todos los productos y explicar cada diferencia. El almacén se desbloqueará; no se cambiarán existencias.')) return;
        showMessage('Validando el conteo y liberando el almacén…', true);
        await rpc('inventario_auditoria_finalizar', { p_auditoria_id: currentAuditId });
      }
      await refreshAll();
      await loadAuditDetail(currentAuditId);
      showMessage(andFinish ? 'Conteo finalizado. Las diferencias quedaron documentadas y no se modificó el stock.' : 'Conteos guardados.', true);
    } catch (error) {
      showMessage(auditErrorMessage(error, 'No se pudo guardar el conteo.'), false);
    } finally { busy = false; }
  }

  async function cancelAudit() {
    if (busy || !currentAuditId || !currentAudit || currentAudit.estado !== 'ABIERTA') return;
    const reason = window.prompt('Motivo para cancelar este conteo físico:');
    if (reason == null) return;
    if (!reason.trim()) return showMessage('El motivo de cancelación es obligatorio.', false);
    if (!window.confirm('¿Cancelar el conteo y desbloquear el almacén? No se cambiarán existencias.')) return;
    busy = true;
    try {
      showMessage('Cancelando el conteo y liberando el almacén…', true);
      await rpc('inventario_auditoria_cancelar', {
        p_auditoria_id: currentAuditId,
        p_motivo: reason.trim()
      });
      await refreshAll();
      await loadAuditDetail(currentAuditId);
      showMessage('Conteo cancelado. El almacén fue desbloqueado sin modificar existencias.', true);
    } catch (error) {
      showMessage(auditErrorMessage(error, 'No se pudo cancelar el conteo.'), false);
    } finally { busy = false; }
  }

  function switchView(view) {
    const actions = $('mando-auditoria-acciones');
    const physical = $('mando-auditoria-fisica');
    const actionButton = $('mando-auditoria-vista-acciones');
    const physicalButton = $('mando-auditoria-vista-fisica');
    if (!actions || !physical) return;
    const showPhysical = view === 'fisica';
    actions.hidden = showPhysical;
    physical.hidden = !showPhysical;
    if (actionButton) actionButton.setAttribute('aria-pressed', showPhysical ? 'false' : 'true');
    if (physicalButton) physicalButton.setAttribute('aria-pressed', showPhysical ? 'true' : 'false');
    if (showPhysical) refreshAll();
  }

  function injectStyles() {
    if ($('inv-audit-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'inv-audit-ui-style';
    style.textContent =
      '#mando-auditoria-vistas{display:flex;gap:7px;margin:0 0 10px}' +
      '#mando-auditoria-vistas button{min-height:36px;padding:7px 13px;border-radius:8px;border:1px solid var(--gold-dim);background:var(--stone-2);color:var(--text)}' +
      '#mando-auditoria-vistas button[aria-pressed="true"]{background:var(--gold);color:#211605;border-color:transparent;font-weight:700}' +
      '#mando-auditoria-fisica[hidden],#mando-auditoria-acciones[hidden]{display:none!important}' +
      '.inv-audit-top,.inv-audit-detail-head{display:flex;align-items:center;justify-content:space-between;gap:10px}' +
      '.inv-audit-top h3,.inv-audit-detail-head h4{margin:0 0 4px}' +
      '.inv-audit-top p,.inv-audit-detail-head p{margin:0;font-size:.78rem}' +
      '.inv-audit-start{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;margin:12px 0}' +
      '.inv-audit-start label{display:grid;gap:4px;font-size:.76rem}' +
      '.inv-audit-start select,.inv-audit-line input{width:100%;min-width:0;box-sizing:border-box;min-height:40px;padding:8px 10px;border:1px solid var(--gold-dim);border-radius:7px;background:var(--void,#0d1b17);color:var(--text)}' +
      '.inv-audit-start select{background:linear-gradient(180deg,var(--gold-bright),var(--gold))!important;color:#211605!important;font-weight:700;color-scheme:light;cursor:pointer}' +
      '.inv-audit-start select option,.inv-audit-start select optgroup{background:#f3d27c!important;color:#211605!important;font-weight:600}' +
      '.inv-audit-start select:focus-visible{outline:2px solid var(--gold-bright);outline-offset:2px}' +
      '.inv-audit-start button,.inv-audit-actions button{min-height:40px;padding:8px 13px;border:0;border-radius:7px;background:linear-gradient(180deg,var(--gold-bright),var(--gold));color:#211605;font-weight:700}' +
      '.inv-audit-actions #inv-audit-cancel{background:transparent;border:1px solid rgba(190,80,80,.65);color:var(--danger,#d47b7b)}' +
      '.inv-audit-policy,.inv-audit-help{font-size:.76rem;line-height:1.45;margin:8px 0 12px}' +
      '.inv-audit-history{display:grid;gap:6px;margin:12px 0}' +
      '.inv-audit-history h4{margin:4px 0;font-size:.85rem}' +
      '.inv-audit-history-item{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;text-align:left;padding:10px;border:1px solid var(--gold-dim);border-radius:8px;background:var(--stone-2);color:var(--text)}' +
      '.inv-audit-history-item>span{display:grid;gap:3px;min-width:0}.inv-audit-history-item small{font-size:.7rem;color:var(--mist)}' +
      '.inv-audit-history-meta{text-align:right}.inv-audit-history-meta b{font-size:.75rem}.inv-audit-history-meta small{display:block}' +
      '.inv-audit-detail{margin-top:12px}.inv-audit-detail-head{padding:10px;background:var(--stone-2);border-radius:8px}' +
      '.inv-audit-detail-head h4{font-size:.9rem}.inv-audit-detail-head p{font-size:.72rem}' +
      '.inv-audit-lock{white-space:nowrap;font-size:.72rem;font-weight:700}.inv-audit-lock.is-open{color:var(--gold-bright)}' +
      '.inv-audit-lines{display:grid;gap:7px}' +
      '.inv-audit-line{display:grid;grid-template-columns:minmax(0,1fr) minmax(95px,130px);gap:7px;padding:9px;border:1px solid rgba(212,176,92,.18);border-radius:8px;background:var(--void,#0d1b17)}' +
      '.inv-audit-line-main{min-width:0;display:grid;gap:3px;align-content:center}.inv-audit-line-main strong{font-size:.82rem;overflow-wrap:anywhere}.inv-audit-line-main small,.inv-audit-line-result small{font-size:.7rem;color:var(--mist)}' +
      '.inv-audit-line label{display:grid;gap:3px;font-size:.7rem;color:var(--mist)}' +
      '.inv-audit-line .inv-audit-reason{grid-column:1/-1}.inv-audit-line-result{display:grid;gap:3px;align-content:center;text-align:right}' +
      '.inv-audit-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.inv-audit-actions #inv-audit-save{background:var(--stone-2);border:1px solid var(--gold-dim);color:var(--text)}' +
      '@media(max-width:520px){.inv-audit-start{grid-template-columns:1fr}.inv-audit-line{grid-template-columns:minmax(0,1fr) 105px}.inv-audit-line-main strong{font-size:.78rem}}';
    document.head.appendChild(style);
  }

  function init() {
    const host = $('mando-auditoria-fisica');
    if (!host || host.dataset.bcInventoryAuditBound === '1') return;
    host.dataset.bcInventoryAuditBound = '1';
    injectStyles();
    renderShell();
    const actionButton = $('mando-auditoria-vista-acciones');
    const physicalButton = $('mando-auditoria-vista-fisica');
    if (actionButton) actionButton.addEventListener('click', () => switchView('acciones'));
    if (physicalButton) physicalButton.addEventListener('click', () => switchView('fisica'));
    const mandoTab = document.querySelector('[data-tab="mando"]');
    if (mandoTab) mandoTab.addEventListener('click', () => {
      if ($('mando-auditoria-fisica') && !$('mando-auditoria-fisica').hidden) refreshAll();
    });
    switchView('acciones');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
