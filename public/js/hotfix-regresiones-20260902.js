// BattleCruiser — Hotfix de regresiones operativas 2026-09-02
// Alcance: Turnos, logout, stock POS, force-close admin, Inventario, Configuración,
// Comunicación, importación Excel y permisos. Capa final: no reactiva módulos legacy.
(function () {
  'use strict';
  if (window.__BCHotfixRegresiones20260902) return;
  window.__BCHotfixRegresiones20260902 = true;

  const STYLE_ID = 'bc-regresiones-20260902-css';

  function esc(v) {
    if (typeof window.escHtml === 'function') return window.escHtml(String(v == null ? '' : v));
    return String(v == null ? '' : v).replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  }
  function same(a, b) { return a != null && b != null && String(a) === String(b); }
  function isAdmin() {
    try {
      if (typeof window.tienePermiso === 'function' && window.tienePermiso('turnos', 'editar_any')) return true;
      if (typeof window.BattleCruiserTurnoAPI?.actorIsAdmin === 'function') return false;
      const u = window._usuarioActual;
      const r = String(u && (u.rol || u.role || u.rol_nombre) || '').toLowerCase();
      return ['dueño','dueno','admin','administrador'].includes(r);
    } catch (e) { return false; }
  }

  function css() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      /* 2 + 8: shell/navigation */
      '.ajustes-wrap{display:none!important}',
      '#ajustes-btn,#ajustes-menu{display:none!important}',
      '#logout-btn.bc-reg-logout{display:inline-flex!important;visibility:visible!important;opacity:1!important}',
      '#tab-config.bc-reg-config-ready{display:block}',
      '.tab-btn[data-tab="config"].bc-reg-config-ready{display:flex!important;visibility:visible!important;opacity:1!important}',
      /* 4: admin-only force close */
      '.bc-force-close-turno{margin-left:8px!important;border:1px solid rgba(210,82,92,.7)!important;background:rgba(120,20,30,.22)!important;color:#f0b0b6!important;font-weight:700!important}',
      /* 6: per-warehouse minimum editor */
      '.bc-minimo-editor{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-top:8px}',
      '.bc-minimo-editor input{width:110px;padding:8px;border-radius:8px;border:1px solid rgba(212,176,92,.3);background:var(--void,#0e1614);color:var(--text,#eee)}',
      '.bc-stock-by-warehouse{margin-top:12px;display:grid;gap:7px}',
      '.bc-stock-warehouse-row{display:grid;grid-template-columns:1.4fr .7fr .7fr auto;gap:8px;align-items:center;padding:8px 10px;border:1px solid rgba(212,176,92,.13);border-radius:8px;background:rgba(255,255,255,.025)}',
      /* 9 communication: cleaner app-like shell */
      '#tab-comunicacion .com-layout,#tab-comunicacion .com-shell{gap:12px!important}',
      '#tab-comunicacion .com-conversaciones,#tab-comunicacion .com-col-list{border:1px solid rgba(212,176,92,.14)!important;border-radius:14px!important;background:rgba(7,18,15,.58)!important;overflow:hidden!important}',
      '#tab-comunicacion .com-col-chat{border:1px solid rgba(212,176,92,.14)!important;border-radius:14px!important;background:rgba(7,18,15,.42)!important;overflow:hidden!important}',
      '#tab-comunicacion .com-header,#tab-comunicacion .com-chat-header{padding:12px 14px!important;border-bottom:1px solid rgba(212,176,92,.12)!important;background:rgba(24,49,42,.5)!important}',
      '#tab-comunicacion .com-lista,.com-conversaciones .lista,.com-col-list .lista{padding:7px!important}',
      '#tab-comunicacion .com-conv-item,#tab-comunicacion .com-conversacion,.com-col-list .lista-item{margin:3px 0!important;border-radius:10px!important;border:1px solid transparent!important}',
      '#tab-comunicacion .com-conv-item.active,#tab-comunicacion .com-conversacion.active,.com-col-list .lista-item.active{border-color:rgba(212,176,92,.3)!important;background:rgba(212,176,92,.08)!important}',
      '#tab-comunicacion .com-mensajes{padding:14px!important;scrollbar-width:thin!important}',
      '#tab-comunicacion .com-mensaje{max-width:min(78%,620px)!important;margin:5px 0!important;padding:9px 12px!important;border-radius:12px!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(255,255,255,.06)!important}',
      '#tab-comunicacion #form-mensaje.com-input-bar{position:sticky!important;bottom:0!important;z-index:3!important}',
      /* 10: Excel import area */
      '.bc-import-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}',
      '.bc-import-note{font-size:.74rem;color:var(--mist,#aaa);margin:0 0 9px}',
      '.bc-import-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 12px;border-radius:9px;border:1px solid var(--gold-dim,#8f773b);background:var(--stone-2,#2a302b);color:var(--text,#eee);cursor:pointer}',
      '.bc-import-btn.primary{background:linear-gradient(180deg,var(--gold-bright,#e4c66d),var(--gold,#c9a24d));color:#211605;font-weight:700;border:0}',
      /* 12: permission designer */
      '.bc-perm-designer{margin-top:10px;padding:12px;border:1px solid rgba(212,176,92,.13);border-radius:12px;background:rgba(255,255,255,.018)}',
      '.bc-perm-presets{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px}',
      '.bc-perm-preset{padding:7px 10px;border-radius:8px;border:1px solid rgba(212,176,92,.22);background:rgba(212,176,92,.05);color:var(--text,#eee);cursor:pointer;font-size:.75rem}',
      '.bc-perm-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px}',
      '.bc-perm-group{padding:10px;border-radius:10px;border:1px solid rgba(212,176,92,.1);background:rgba(8,20,17,.45)}',
      '.bc-perm-group h4{margin:0 0 8px;font-size:.76rem;color:var(--gold-bright,#e4c66d)}',
      '.bc-perm-row{display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:.74rem;color:var(--mist,#aaa)}',
      '@media(max-width:700px){.bc-stock-warehouse-row{grid-template-columns:1fr 1fr}.bc-stock-warehouse-row button{grid-column:1/-1}.bc-perm-groups{grid-template-columns:1fr}}
    ].join('');
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------
   * 2 + 8 — Logout is a real hard auth boundary; Settings is a section.
   * ------------------------------------------------------------------ */
  function installLogout() {
    const btn = document.getElementById('logout-btn');
    if (!btn || btn.dataset.bcRegLogout === '1') return;
    btn.dataset.bcRegLogout = '1';
    btn.classList.add('bc-reg-logout');
    btn.textContent = 'LogOut';
    btn.setAttribute('aria-label', 'LogOut');
    btn.onclick = async function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      window.__bcLogoutEnCurso = true;
      try {
        if (typeof window.closeAjustes === 'function') window.closeAjustes();
        document.querySelectorAll('.ajustes-menu,.ajustes-dropdown,.ajustes-wrap').forEach(x => x.classList.remove('open','visible'));
        if (window.client && window.client.auth && typeof window.client.auth.signOut === 'function') {
          await window.client.auth.signOut();
        }
      } catch (e) {
        console.warn('[BattleCruiser] Logout:', e);
      } finally {
        // Hard navigation prevents stale app-shell / drawer DOM from becoming the login background.
        try { window.location.replace(window.location.href.split('#')[0]); } catch (e2) { window.location.reload(); }
      }
    };
  }

  function exposeConfig() {
    const panel = document.getElementById('tab-config');
    const button = document.querySelector('.tab-btn[data-tab="config"]');
    if (!panel || !button) return;
    panel.classList.add('bc-reg-config-ready');
    button.classList.add('bc-reg-config-ready');
    button.classList.remove('hidden','bc-config-tab-hidden');
    button.removeAttribute('aria-hidden');
    button.tabIndex = 0;
    // Hide the old drawer trigger while preserving the existing internal controls inside Configuración.
    const old = document.querySelector('.ajustes-wrap');
    if (old) old.setAttribute('aria-hidden','true');
  }

  /* ------------------------------------------------------------------
   * 3 — POS stock truth: do not manufacture zero while cache is loading.
   * ------------------------------------------------------------------ */
  function patchStockTruth() {
    const ready = () => {
      const st = String(typeof window._stockCargaEstado !== 'undefined' ? window._stockCargaEstado : 'idle');
      const cache = window._cache && Array.isArray(window._cache.stock) ? window._cache.stock : [];
      return { st, cache };
    };
    const orig = window.obtenerStockDisponible;
    if (typeof orig === 'function' && !orig.__bcRegStock) {
      const wrapped = function (productoId, almacenId) {
        const { st, cache } = ready();
        const row = cache.find(s => s && same(s.producto_id, productoId) && same(s.almacen_id, almacenId));
        if (row) {
          const cant = Number(row.cantidad);
          return { valor: Number.isFinite(cant) ? Math.max(cant, 0) : 0, ajuste: 0, noCalculable:false, loaded:true, unknown:false, estado:'ok', hasRow:true };
        }
        // Keep unknown truth distinct from zero truth.
        const base = orig.apply(this, arguments) || {};
        if (st === 'loading' || st === 'idle') return Object.assign({}, base, { valor:null, unknown:true, loaded:false, noCalculable:true, estado:st });
        return base;
      };
      wrapped.__bcRegStock = true;
      window.obtenerStockDisponible = wrapped;
      try { obtenerStockDisponible = wrapped; } catch (e) {}
    }

    // Make product cards display “…” instead of a false 0 until warehouse stock is known.
    const renderCard = window.actualizarStockDisponibleUI;
    if (typeof renderCard === 'function' && !renderCard.__bcRegStockUi) {
      const wrapped = function () {
        try {
          const state = ready();
          if (state.st === 'idle' || state.st === 'loading') {
            document.querySelectorAll('[data-producto-id],[data-product-id]').forEach(card => {
              const id = card.getAttribute('data-producto-id') || card.getAttribute('data-product-id');
              const info = card.querySelector('.stock,.producto-stock,.stock-disponible,[data-stock]');
              if (info && id && !state.cache.some(s => s && same(s.producto_id,id))) info.textContent = 'Stock: …';
            });
          }
        } catch (e) {}
        return renderCard.apply(this, arguments);
      };
      wrapped.__bcRegStockUi = true;
      window.actualizarStockDisponibleUI = wrapped;
      try { actualizarStockDisponibleUI = wrapped; } catch (e) {}
    }

    if (typeof window.agregarLineaVenta === 'function' && !window.agregarLineaVenta.__bcRegStock) {
      const add = window.agregarLineaVenta;
      const wrapped = function () {
        const args = arguments;
        try {
          const p = args[0];
          const id = p && (p.id || p.producto_id) || document.querySelector('#venta-producto')?.value;
          const almacen = typeof window.obtenerAlmacenVentaActual === 'function' ? window.obtenerAlmacenVentaActual() : (window._cache?.almacenVentaId || null);
          const row = (window._cache?.stock || []).find(s => s && same(s.producto_id,id) && (!almacen || same(s.almacen_id,almacen)));
          if (!row && typeof window.cargarStockAlmacenes === 'function') window.cargarStockAlmacenes(false).catch(()=>{});
        } catch (e) {}
        return add.apply(this, args);
      };
      wrapped.__bcRegStock = true;
      window.agregarLineaVenta = wrapped;
      try { agregarLineaVenta = wrapped; } catch (e) {}
    }
  }

  /* ------------------------------------------------------------------
   * 1 — Dependienta: show ALL sessions grouped morning/afternoon. Action
   * only appears on sessions assigned to current user.
   * ------------------------------------------------------------------ */
  function patchTurnoDetail() {
    const API = window.BattleCruiserTurnoAPI;
    if (!API || typeof API.obtenerExpedienteTurno !== 'function') return;
    const hub = window.__BC_M33;
    if (!hub || typeof hub.open !== 'function' || hub.open.__bcRegSessions) return;
    const orig = hub.open;
    const wrapped = async function (turnoId) {
      const result = await orig.apply(this, arguments);
      try {
        if (isAdmin()) return result;
        const ov = document.getElementById('m33-bg');
        if (!ov) return result;
        const exp = await API.obtenerExpedienteTurno(turnoId);
        const data = Array.isArray(exp) ? (exp[0] || {}) : (exp || {});
        const sesiones = Array.isArray(data.sesiones) ? data.sesiones.slice() : [];
        if (!sesiones.length) return result;
        const me = window._usuarioActualId || window._usuarioActual?.id || null;
        const norm = s => String(s || '').toUpperCase().trim();
        const bloque = s => norm(s).includes('TAR') || norm(s).includes('PM') || norm(s).includes('TARDE') ? 'TARDE' : 'MAÑANA';
        const labelState = s => {
          const st = norm(s.estado);
          if (st === 'EN_CURSO') return 'En curso';
          if (st === 'COMPLETADA') return 'Completada';
          if (st === 'PENDIENTE' || st === 'PROGRAMADA') return 'Sin comenzar';
          return st || '—';
        };
        const grouped = { MAÑANA: [], TARDE: [] };
        sesiones.forEach(s => grouped[bloque(s)].push(s));
        Object.values(grouped).forEach(a => a.sort((x,y) => (Number(x.numero_dia||x.dia_n||0)-Number(y.numero_dia||y.dia_n||0))));
        const renderGroup = (title, rows) => '<section class="bc-session-group"><h4 style="margin:16px 0 8px">'+title+'</h4>'+(
          rows.length ? rows.map(s => {
            const own = me && same(s.usuario_id, me);
            const st = norm(s.estado);
            const action = own && (st === 'PENDIENTE' || st === 'PROGRAMADA' || !st) ? '<button type="button" class="m33-btn-sesion" data-bc-reg-open-session="'+esc(s.id)+'">Abrir sesión</button>' : (own ? '<span class="m33-pill">'+esc(labelState(s))+'</span>' : '<span class="m33-pill">Asignada a otra dependienta</span>');
            return '<div class="m33-session"><div class="m33-session-row"><div><b>Día '+esc(s.numero_dia||s.dia_n||'—')+' · '+esc(s.bloque||title)+'</b><div class="m33-muted">'+esc(s.fecha||'')+' · '+esc(labelState(s))+'</div></div><div>'+action+'</div></div></div>';
          }).join('') : '<div class="m33-muted">No hay sesiones en este bloque.</div>'
        )+'</section>';
        const body = ov.querySelector('.m33-body');
        if (!body) return result;
        body.innerHTML = '<div class="m33-summary"><div class="m33-box"><span>Sesiones</span><b>'+sesiones.length+'</b></div><div class="m33-box"><span>Mañana</span><b>'+grouped['MAÑANA'].length+'</b></div><div class="m33-box"><span>Tarde</span><b>'+grouped['TARDE'].length+'</b></div></div>'+renderGroup('Mañana', grouped['MAÑANA'])+renderGroup('Tarde', grouped['TARDE']);
        body.querySelectorAll('[data-bc-reg-open-session]').forEach(btn => btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const r = await window.client.rpc('bc_iniciar_turno_sesion_secuencial', { p_turno_sesion_id: btn.getAttribute('data-bc-reg-open-session') });
            if (r?.error) throw r.error;
            await wrapped(turnoId);
          } catch (e) { alert(e.message || String(e)); btn.disabled = false; }
        }));
      } catch (e) { console.warn('[BattleCruiser] sesiones AM/PM:', e); }
      return result;
    };
    wrapped.__bcRegSessions = true;
    hub.open = wrapped;
  }

  /* ------------------------------------------------------------------
   * 4 — Admin-only force close. Backend enforces the same rule.
   * ------------------------------------------------------------------ */
  function installForceClose() {
    if (!isAdmin()) return;
    const modal = document.getElementById('m33-bg');
    if (!modal || modal.querySelector('.bc-force-close-turno')) return;
    const foot = modal.querySelector('.m33-foot');
    if (!foot) return;
    const turnId = window.__BC_M33_ACTIVE_TURNO_ID || window.__bcM33TurnoId || null;
    // Fallback: infer from M33 global if available.
    const id = turnId || modal.getAttribute('data-turno-id');
    if (!id) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'bc-force-close-turno'; b.textContent = 'Forzar cierre';
    b.dataset.bcForceClose = id;
    b.onclick = async function () {
      if (!isAdmin()) return;
      const motivo = window.prompt('Motivo del cierre forzado:', 'Cierre forzado por ADMIN');
      if (motivo === null) return;
      b.disabled = true;
      try {
        const r = await window.client.rpc('bc_forzar_cierre_turno_admin', { p_turno_id:id, p_motivo:motivo });
        if (r?.error) throw r.error;
        if (typeof window.refrescarTurnos === 'function') await window.refrescarTurnos();
        if (typeof window.__BC_M33?.open === 'function') window.__BC_M33.open(id);
      } catch (e) {
        alert('No se pudo forzar el cierre: ' + (e.message || e));
        b.disabled = false;
      }
    };
    const side = foot.firstElementChild || foot;
    side.appendChild(b);
  }

  /* ------------------------------------------------------------------
   * 6 — Inventory minimums + 11 aggregate product cards.
   * We intercept the read result only for the unfiltered inventory view.
   * ------------------------------------------------------------------ */
  function patchInventoryRpc() {
    const c = window.client;
    if (!c || typeof c.rpc !== 'function' || c.rpc.__bcRegInventory) return;
    const orig = c.rpc.bind(c);
    const wrapped = async function (fn, params) {
      const r = await orig(fn, params);
      if (fn !== 'inventario_enriquecido' || params?.p_almacen_id || !r || !Array.isArray(r.data)) return r;
      const rows = r.data;
      const by = new Map();
      rows.forEach(row => {
        const key = String(row.producto_id || row.id || row.producto || '');
        if (!by.has(key)) {
          by.set(key, Object.assign({}, row, {
            cantidad: 0,
            valor_inventario: 0,
            minimo: null,
            _bc_almacenes: []
          }));
        }
        const agg = by.get(key);
        agg.cantidad += Number(row.cantidad) || 0;
        agg.valor_inventario += Number(row.valor_inventario) || 0;
        if (row.minimo != null) agg.minimo = agg.minimo == null ? Number(row.minimo) : Math.min(agg.minimo, Number(row.minimo));
        agg._bc_almacenes.push({
          id: row.almacen_id,
          nombre: row.almacen || row.almacen_nombre || row.almacen_id || 'Almacén',
          cantidad: Number(row.cantidad) || 0,
          minimo: row.minimo == null ? 0 : Number(row.minimo),
          valor: Number(row.valor_inventario) || 0
        });
      });
      const aggregated = Array.from(by.values()).map(row => {
        row.almacenes = row._bc_almacenes;
        row.almacenes_resumen = row._bc_almacenes.map(a => a.nombre+': '+a.cantidad+' u').join(' · ');
        delete row._bc_almacenes;
        return row;
      });
      return Object.assign({}, r, { data: aggregated });
    };
    wrapped.__bcRegInventory = true;
    c.rpc = wrapped;
  }

  function patchInventoryCardRendering() {
    const list = document.getElementById('inv-detalle');
    if (!list || list.dataset.bcRegInvRender === '1') return;
    list.dataset.bcRegInvRender = '1';
    const paint = () => {
      list.querySelectorAll('.bc-m53-card').forEach(card => {
        const id = card.getAttribute('data-inv-producto');
        const rows = window._invFilas || [];
        const row = rows.find(x => same(x.producto_id,id));
        if (!row || !Array.isArray(row.almacenes) || card.querySelector('.bc-stock-by-warehouse')) return;
        const holder = document.createElement('div');
        holder.className = 'bc-stock-by-warehouse';
        holder.innerHTML = row.almacenes.map(a => '<div class="bc-stock-warehouse-row"><span>'+esc(a.nombre)+'</span><strong>'+esc(a.cantidad)+' u</strong><span>mín '+esc(a.minimo)+'</span><button type="button" class="bc-mini-edit" data-pid="'+esc(row.producto_id)+'" data-aid="'+esc(a.id)+'" data-min="'+esc(a.minimo)+'">Editar mín.</button></div>').join('');
        card.appendChild(holder);
      });
    };
    new MutationObserver(paint).observe(list, { childList:true, subtree:true });
    paint();
    list.addEventListener('click', async e => {
      const b = e.target.closest('.bc-mini-edit');
      if (!b) return;
      if (!isAdmin() && !(typeof window.tienePermiso === 'function' && window.tienePermiso('stock','editar'))) { alert('No tenés permiso para editar mínimos de stock.'); return; }
      const value = window.prompt('Stock mínimo para este almacén:', b.dataset.min || '0');
      if (value === null) return;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) { alert('El mínimo debe ser un número mayor o igual a 0.'); return; }
      try {
        const r = await window.client.rpc('bc_actualizar_stock_minimo', { p_producto_id:b.dataset.pid, p_almacen_id:b.dataset.aid, p_minimo:n });
        if (r?.error) throw r.error;
        b.dataset.min = String(n);
        b.parentElement.querySelector('span:nth-child(3)').textContent = 'mín '+n;
      } catch (err) { alert('No se pudo guardar el mínimo: '+(err.message||err)); }
    });
  }

  /* ------------------------------------------------------------------
   * 10 — Excel import: strengthen existing M55 so buttons are always present.
   * ------------------------------------------------------------------ */
  function installImportToolbar() {
    const tab = document.getElementById('tab-productos');
    if (!tab || tab.querySelector('.bc-import-toolbar')) return;
    const host = tab.querySelector('#form-producto')?.parentElement || tab.firstElementChild || tab;
    const bar = document.createElement('div');
    bar.className = 'bc-import-toolbar';
    bar.innerHTML = '<div><button type="button" class="bc-import-btn primary" id="bc-importar-excel-hotfix">📥 Importar Excel/CSV</button><p class="bc-import-note">Usa la misma plantilla exportada por BattleCruiser; permite .xlsx, .xls y .csv.</p></div><button type="button" class="bc-import-btn" id="bc-exportar-plantilla-xlsx">⬇ Plantilla Excel</button><button type="button" class="bc-import-btn" id="bc-exportar-plantilla-csv">⬇ Plantilla CSV</button>';
    host.parentNode.insertBefore(bar, host);
    bar.querySelector('#bc-importar-excel-hotfix').onclick = () => {
      const old = document.querySelector('input[type=file][accept*="xls"], input[type=file][accept*="csv"]');
      if (old) { old.click(); return; }
      const input = document.createElement('input'); input.type='file'; input.accept='.xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'; input.hidden=true; document.body.appendChild(input); input.click();
      input.addEventListener('change', () => { if (input.files[0] && typeof window.procesarArchivoProductos === 'function') window.procesarArchivoProductos(input.files[0]); input.remove(); }, {once:true});
    };
    function downloadBlob(name, content, type) {
      const blob = new Blob([content], {type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);
    }
    bar.querySelector('#bc-exportar-plantilla-csv').onclick = () => {
      const header = 'nombre,categoria,unidad,precio_normal,precio_mayorista,activo\n';
      downloadBlob('battlecruiser-productos-plantilla.csv', header, 'text/csv;charset=utf-8');
    };
    bar.querySelector('#bc-exportar-plantilla-xlsx').onclick = async () => {
      try {
        if (typeof window.XLSX === 'undefined' && typeof window.loadSheetJS === 'function') await window.loadSheetJS();
        if (window.XLSX) {
          const ws = window.XLSX.utils.aoa_to_sheet([['nombre','categoria','unidad','precio_normal','precio_mayorista','activo'],['Ejemplo producto','Bebidas','unidad',0,0,true]]);
          const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb,ws,'Productos'); window.XLSX.writeFile(wb,'battlecruiser-productos-plantilla.xlsx');
        } else throw new Error('Librería Excel no disponible');
      } catch (e) { alert('No se pudo crear XLSX; descargaremos CSV compatible con Excel.'); bar.querySelector('#bc-exportar-plantilla-csv').click(); }
    };
  }

  /* ------------------------------------------------------------------
   * 12 — Smart role-permission designer layered over current matrix.
   * ------------------------------------------------------------------ */
  function enhancePermissionPanel() {
    document.querySelectorAll('.rol-permisos-panel').forEach(panel => {
      if (panel.querySelector('.bc-perm-designer')) return;
      const checks = Array.from(panel.querySelectorAll('input.permiso-check'));
      if (!checks.length) return;
      const map = {};
      checks.forEach(c => { map[c.dataset.seccion+'|'+c.dataset.accion] = c; });
      const groupDefs = {
        'Operación diaria':['ventas','turnos','comunicacion','entregas_caja'],
        'Inventario':['productos','categorias','almacenes','stock','transferencias','presentaciones','unidades'],
        'Administración':['usuarios','auditoria','ciclos','reportes'],
        'Finanzas':['gastos','mermas','reinversiones']
      };
      const designer = document.createElement('div'); designer.className='bc-perm-designer';
      const presets = document.createElement('div'); presets.className='bc-perm-presets';
      [['Solo lectura', c => c.dataset.accion==='ver'],['Operación', c => ['ventas','turnos','comunicacion'].includes(c.dataset.seccion) && ['ver','crear','editar'].includes(c.dataset.accion)],['Inventario', c => ['productos','categorias','almacenes','stock','transferencias','presentaciones','unidades'].includes(c.dataset.seccion) && ['ver','crear','editar'].includes(c.dataset.accion)],['Administrador operativo', c => ['ver','crear','editar','editar_any'].includes(c.dataset.accion) && !['auditoria','usuarios'].includes(c.dataset.seccion)]].forEach(([name,pred])=>{ const b=document.createElement('button'); b.type='button'; b.className='bc-perm-preset'; b.textContent=name; b.onclick=()=>checks.forEach(c=>{ if(!c.disabled && c.offsetParent!==null) c.checked=pred(c); }); presets.appendChild(b); });
      const groups = document.createElement('div'); groups.className='bc-perm-groups';
      Object.entries(groupDefs).forEach(([title,secs])=>{
        const g=document.createElement('div'); g.className='bc-perm-group'; g.innerHTML='<h4>'+esc(title)+'</h4>';
        secs.forEach(sec=>{ const relevant=checks.filter(c=>c.dataset.seccion===sec); if(!relevant.length) return; const row=document.createElement('div'); row.className='bc-perm-row'; row.innerHTML='<span>'+esc(sec)+'</span><span>'+relevant.filter(c=>c.checked).length+'/'+relevant.length+'</span>'; g.appendChild(row); });
        groups.appendChild(g);
      });
      designer.appendChild(presets); designer.appendChild(groups);
      const hint=document.createElement('p'); hint.className='bc-import-note'; hint.textContent='Usa un perfil como punto de partida y luego ajusta permisos individuales. El botón Guardar permisos existente sigue siendo la autoridad de persistencia.'; designer.appendChild(hint);
      panel.prepend(designer);
    });
  }

  function boot() {
    css(); installLogout(); exposeConfig(); patchStockTruth(); patchTurnoDetail(); patchInventoryRpc(); patchInventoryCardRendering(); installImportToolbar(); enhancePermissionPanel();
    installForceClose();
    // Some owners render asynchronously; retry only while the relevant surfaces exist.
    setTimeout(() => { installLogout(); exposeConfig(); installImportToolbar(); enhancePermissionPanel(); patchInventoryCardRendering(); installForceClose(); }, 250);
    setTimeout(() => { exposeConfig(); enhancePermissionPanel(); installForceClose(); }, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
  window.addEventListener('load', () => { boot(); });
})();