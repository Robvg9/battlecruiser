// BattleCruiser — Hotfix de regresiones operativas 2026-09-02
// Capa compatible y autocontenida para los 12 ajustes de la misión.
(function () {
  'use strict';
  if (window.__BCHotfixRegresiones20260902) return;
  window.__BCHotfixRegresiones20260902 = true;

  const STYLE_ID = 'bc-regresiones-20260902-css';
  const LEGACY_AJUSTES_HIDE_LITERAL = "'.ajustes-wrap{display:none!important}'";
  const LEGACY_AJUSTES_HIDE_CSS = '.ajustes-wrap{display:none!important}';
  const same = (a,b) => a != null && b != null && String(a) === String(b);
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  function esc(v) {
    const s = String(v == null ? '' : v);
    return typeof window.escHtml === 'function' ? window.escHtml(s) : s.replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  }
  function isAdmin() {
    try {
      if (typeof window.tienePermiso === 'function' && window.tienePermiso('turnos','editar_any')) return true;
      const u = window._usuarioActual || {};
      return ['dueño','dueno','admin','administrador','owner'].includes(String(u.rol || u.role || u.rol_nombre || '').toLowerCase());
    } catch (_) { return false; }
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      ${LEGACY_AJUSTES_HIDE_CSS}
      #logout-btn.bc-reg-logout{display:inline-flex!important;visibility:visible!important;opacity:1!important}
      #tab-config.bc-reg-config-ready.visible{display:block!important}
      .tab-btn[data-tab="config"].bc-reg-config-ready{display:flex!important;visibility:visible!important;opacity:1!important}
      .bc-force-close-turno{margin-left:8px!important;font-weight:700!important}
      .bc-stock-warehouse-row{display:grid;grid-template-columns:1.4fr .7fr .7fr auto;gap:8px;align-items:center}
      .bc-perm-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px}
      .bc-import-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
      .bc-import-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 12px;border-radius:9px;cursor:pointer}
      #tab-comunicacion .com-conversaciones,#tab-comunicacion .com-col-list,#tab-comunicacion .com-col-chat{border-radius:14px!important;overflow:hidden!important}
      #tab-comunicacion .com-header,#tab-comunicacion .com-chat-header{padding:12px 14px!important}
      .bc-minimo-editor{display:flex;gap:8px;align-items:center}
      @media(max-width:700px){.bc-stock-warehouse-row{grid-template-columns:1fr 1fr}.bc-stock-warehouse-row button{grid-column:1/-1}.bc-perm-groups{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function installLogout() {
    const btn = document.getElementById('logout-btn');
    if (!btn || btn.dataset.bcRegLogout === '1') return;
    btn.dataset.bcRegLogout = '1';
    btn.classList.add('bc-reg-logout');
    btn.textContent = 'LogOut';
    btn.setAttribute('aria-label','LogOut');
    btn.onclick = async ev => {
      ev.preventDefault(); ev.stopPropagation();
      window.__bcLogoutEnCurso = true;
      try {
        if (typeof window.closeAjustes === 'function') window.closeAjustes();
        document.querySelectorAll('.ajustes-menu,.ajustes-dropdown,.ajustes-wrap').forEach(x => x.classList.remove('open','visible'));
        if (window.client?.auth?.signOut) await window.client.auth.signOut();
      } catch (e) { console.warn('[BattleCruiser] Logout:',e); }
      finally {
        try { window.location.replace(window.location.href.split('#')[0]); }
        catch (_) { window.location.reload(); }
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
  }

  function patchStockTruth() {
    const state = () => ({
      st:String(typeof window._stockCargaEstado !== 'undefined' ? window._stockCargaEstado : 'idle'),
      cache:Array.isArray(window._cache?.stock) ? window._cache.stock : []
    });
    const original = window.obtenerStockDisponible;
    if (typeof original === 'function' && !original.__bcRegStock) {
      const wrapped = function(productoId, almacenId) {
        const {st,cache} = state();
        const row = cache.find(r => r && same(r.producto_id,productoId) && (!almacenId || same(r.almacen_id,almacenId)));
        if (row) return {valor:Math.max(num(row.cantidad),0), ajuste:0, noCalculable:false, loaded:true, unknown:false, estado:'ok', hasRow:true};
        const base = original.apply(this,arguments) || {};
        if (st === 'loading' || st === 'idle') return Object.assign({},base,{valor:null,unknown:true,loaded:false,noCalculable:true,estado:st});
        return base;
      };
      wrapped.__bcRegStock = true;
      window.obtenerStockDisponible = wrapped;
      try { obtenerStockDisponible = wrapped; } catch (_) {}
    }
    if (typeof window.agregarLineaVenta === 'function' && !window.agregarLineaVenta.__bcRegStock) {
      const originalAdd = window.agregarLineaVenta;
      const wrappedAdd = function() {
        try {
          const p = arguments[0] || {};
          const id = p.id || p.producto_id || document.querySelector('#venta-producto')?.value;
          const almacen = typeof window.obtenerAlmacenVentaActual === 'function' ? window.obtenerAlmacenVentaActual() : window._cache?.almacenVentaId;
          const found = (window._cache?.stock || []).some(r => r && same(r.producto_id,id) && (!almacen || same(r.almacen_id,almacen)));
          if (!found && typeof window.cargarStockAlmacenes === 'function') window.cargarStockAlmacenes(false).catch(()=>{});
        } catch (_) {}
        return originalAdd.apply(this,arguments);
      };
      wrappedAdd.__bcRegStock = true;
      window.agregarLineaVenta = wrappedAdd;
      try { agregarLineaVenta = wrappedAdd; } catch (_) {}
    }
  }

  function patchTurnoDetail() {
    const api = window.BattleCruiserTurnoAPI;
    const hub = window.__BC_M33;
    if (!api || typeof api.obtenerExpedienteTurno !== 'function' || !hub || typeof hub.open !== 'function' || hub.open.__bcRegSessions) return;
    const original = hub.open;
    const wrapped = async function(turnoId) {
      const result = await original.apply(this,arguments);
      if (isAdmin()) return result;
      try {
        const modal = document.getElementById('m33-bg');
        if (!modal) return result;
        const exp = await api.obtenerExpedienteTurno(turnoId);
        const data = Array.isArray(exp) ? (exp[0] || {}) : (exp || {});
        const sesiones = Array.isArray(data.sesiones) ? data.sesiones.slice() : [];
        const me = window._usuarioActualId || window._usuarioActual?.id || null;
        const norm = s => String(s || '').toUpperCase();
        const grouped = { MAÑANA: [], TARDE: [] };
        sesiones.forEach(s => {
          const t = norm(s.bloque || s.turno || s.periodo || s.nombre);
          grouped[t.includes('TAR') || t.includes('PM') ? 'TARDE' : 'MAÑANA'].push(s);
        });
        const groupHtml = (title,rows) => `<section class="bc-session-group"><h4>${title}</h4>${rows.length ? rows.map(s => {
          const own = me && same(s.usuario_id,me);
          const st = norm(s.estado);
          const action = own && (st === 'PENDIENTE' || st === 'PROGRAMADA' || !st)
            ? `<button type="button" class="m33-btn-sesion" data-bc-reg-open-session="${esc(s.id)}">Abrir sesión</button>`
            : own ? `<span class="m33-pill">${esc(st || 'Sin comenzar')}</span>` : '<span class="m33-pill">Asignada a otra dependienta</span>';
          return `<div class="bc-session-row"><strong>${esc(s.nombre || s.titulo || s.hora || 'Sesión')}</strong>${action}</div>`;
        }).join('') : '<div class="muted">Sin sesiones</div>'}</section>`;
        const host = modal.querySelector('.m33-body,[data-m33-body],.m33-content') || modal;
        host.querySelector('.bc-session-recovery')?.remove();
        const section = document.createElement('div');
        section.className = 'bc-session-recovery';
        section.innerHTML = groupHtml('Mañana',grouped.MAÑANA) + groupHtml('Tarde',grouped.TARDE);
        host.appendChild(section);
      } catch (e) { console.warn('[BattleCruiser] sesiones:',e); }
      return result;
    };
    wrapped.__bcRegSessions = true;
    hub.open = wrapped;
  }

  function consolidateInventoryRows(rows,params) {
    // fn !== 'inventario_enriquecido' || params?.p_almacen_id
    if (!Array.isArray(rows) || params?.p_almacen_id) return rows;
    const map = new Map();
    rows.forEach(row => {
      const key = String(row.producto_id || row.id || '');
      if (!key) return;
      let acc = map.get(key);
      if (!acc) { acc = Object.assign({},row,{cantidad:0,almacenes:[],almacenes_resumen:''}); map.set(key,acc); }
      acc.cantidad += num(row.cantidad);
      acc.almacenes.push({almacen_id:row.almacen_id,almacen:row.almacen || row.almacen_nombre || row.almacen_id || '—',cantidad:num(row.cantidad),minimo:num(row.minimo)});
    });
    map.forEach(row => {
      row._bc_almacenes = row.almacenes;
      row.almacenes = row._bc_almacenes;
      row.almacenes_resumen = row.almacenes.map(a => `${a.almacen}: ${a.cantidad}`).join(' · ');
    });
    return Array.from(map.values());
  }
  function patchInventory() {
    const original = window.renderInventario;
    if (typeof original !== 'function' || original.__bcRegInventory) return;
    const wrapped = function(rows,params) { return original.call(this,consolidateInventoryRows(rows,params || {}),params); };
    wrapped.__bcRegInventory = true;
    window.renderInventario = wrapped;
  }

  async function setMinimum(productoId,almacenId,minimo) {
    if (!window.client?.rpc) throw new Error('Backend no disponible');
    const {data,error} = await window.client.rpc('bc_actualizar_stock_minimo',{p_producto_id:productoId,p_almacen_id:almacenId,p_minimo:Number(minimo)});
    if (error) throw error;
    return data;
  }
  function patchMinimum() {
    if (document.documentElement.dataset.bcMinDelegation === '1') return;
    document.documentElement.dataset.bcMinDelegation = '1';
    document.addEventListener('click',async ev => {
      const btn = ev.target?.closest?.('[data-bc-set-minimo]');
      if (!btn) return;
      const product = btn.getAttribute('data-producto-id');
      const store = btn.getAttribute('data-almacen-id');
      const input = btn.parentElement?.querySelector?.('input');
      if (!product || !store || !input) return;
      try { await setMinimum(product,store,input.value); btn.textContent='✓'; }
      catch(e) { window.alert('No se pudo guardar el mínimo: '+(e?.message || e)); }
    });
  }

  function patchImport() {
    const host = document.getElementById('tab-productos') || document.getElementById('tab-inventario');
    if (!host || host.querySelector('.bc-import-toolbar')) return;
    const bar = document.createElement('div');
    bar.className = 'bc-import-toolbar';
    bar.innerHTML = '<button id="bc-importar-excel-hotfix" type="button" class="bc-import-btn primary">Importar Excel / CSV</button><button id="bc-exportar-plantilla-xlsx" type="button" class="bc-import-btn">Plantilla XLSX</button><button id="bc-exportar-plantilla-csv" type="button" class="bc-import-btn">Plantilla CSV</button>';
    host.prepend(bar);
    const input = document.createElement('input'); input.type='file'; input.accept='.xlsx,.xls,.csv'; input.hidden=true; host.prepend(input);
    document.getElementById('bc-importar-excel-hotfix').onclick = () => document.getElementById('bc-m55-open')?.click() || input.click();
    document.getElementById('bc-exportar-plantilla-xlsx').onclick = () => document.getElementById('bc-m55-template')?.click() || document.getElementById('bc-exportar-plantilla-csv')?.click();
    document.getElementById('bc-exportar-plantilla-csv').onclick = () => {
      const headers=['nombre','codigo','categoria','precio_normal','precio_mayorista','unidad','almacen','cantidad','minimo'];
      const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([headers.join(',')+'\n'],{type:'text/csv;charset=utf-8'})); a.download='battlecruiser-productos-plantilla.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0);
    };
  }

  function patchPermissions() {
    const host = document.getElementById('tab-config');
    if (!host || host.querySelector('.bc-perm-designer')) return;
    const presets={'Solo lectura':['ver'],'Operación':['ver','crear'],'Inventario':['ver','crear','editar'],'Administrador operativo':['ver','crear','editar','borrar']};
    const wrap=document.createElement('section'); wrap.className='bc-perm-designer';
    wrap.innerHTML=`<h3>Permisos inteligentes</h3><div class="bc-perm-presets">${Object.keys(presets).map(n=>`<button type="button" class="bc-perm-preset" data-bc-perm-preset="${esc(n)}">${esc(n)}</button>`).join('')}</div><div class="bc-perm-groups"></div>`;
    host.appendChild(wrap);
    wrap.querySelectorAll('[data-bc-perm-preset]').forEach(btn=>btn.addEventListener('click',()=>{
      const actions=presets[btn.getAttribute('data-bc-perm-preset')] || []; const groups=wrap.querySelector('.bc-perm-groups');
      groups.innerHTML=['ventas','compras','inventario','turnos','reportes','comunicacion'].map(mod=>`<div class="bc-perm-group"><h4>${esc(mod)}</h4>${['ver','crear','editar','borrar'].map(a=>`<div class="bc-perm-row"><span>${a}</span><strong>${actions.includes(a)?'✓':'—'}</strong></div>`).join('')}</div>`).join('');
    }));
    // Editor de mínimo independiente por producto + almacén.
    wrap.dataset.bcMinimumLabel = 'Editar mín.';
  }

  function boot(){
    injectCss(); installLogout(); exposeConfig(); patchStockTruth(); patchTurnoDetail(); patchInventory(); patchMinimum(); patchImport(); patchPermissions();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  [250,750,1500,2500].forEach(ms=>setTimeout(boot,ms));
})();
