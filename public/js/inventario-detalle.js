/* BattleCruiser — detalle accionable de inventario */
(function () {
  'use strict';
  const esc = v => typeof escHtml === 'function' ? escHtml(String(v ?? '—')) : String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const qtyFmt = v => typeof window.numberFmt === 'function'
    ? window.numberFmt(v)
    : new Intl.NumberFormat('es-ES', { useGrouping: true, maximumFractionDigits: 2 })
      .formatToParts(Number(v) || 0).map(p => p.type === 'group' ? '\u202f' : p.value).join('');
  const estadoLabel = estado => estado === 'agotado' ? '🔴 Agotado' : estado === 'bajo' ? '🟡 Bajo mínimo' : '🟢 Disponible';

  function ensureModal() {
    let m = document.getElementById('bc-inv-producto-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'bc-inv-producto-modal';
    m.className = 'hidden';
    m.innerHTML = '<div class="bc-inv-modal-backdrop"></div><section class="bc-inv-modal-card" role="dialog" aria-modal="true" tabindex="-1"><button type="button" class="bc-inv-modal-close" aria-label="Cerrar">×</button><h2></h2><div class="bc-inv-modal-body"></div></section>';
    document.body.appendChild(m);
    const close = () => m.classList.add('hidden');
    m.querySelector('.bc-inv-modal-close').onclick = close;
    m.querySelector('.bc-inv-modal-backdrop').onclick = close;
    return m;
  }

  function abrir(fila) {
    const modal = ensureModal();
    const body = modal.querySelector('.bc-inv-modal-body');
    const title = modal.querySelector('h2');
    const warehouses = Array.isArray(fila.almacenes) && fila.almacenes.length
      ? fila.almacenes
      : [{ almacen: fila.almacen, cantidad: fila.cantidad, minimo: fila.minimo, estado: fila.estado, unidad: fila.unidad, variantes: fila.variantes }];
    title.textContent = fila.producto || 'Producto';
    body.innerHTML = '<div class="bc-inv-product-status">' + estadoLabel(fila.estado) + '</div>' +
      warehouses.map(function (warehouse) {
        const variants = Array.isArray(warehouse.variantes) ? warehouse.variantes : [];
        return '<section class="bc-inv-warehouse-detail">' +
          '<div class="bc-inv-warehouse-heading"><strong>' + esc(warehouse.almacen || 'Almacén') + '</strong>' +
          '<span>' + esc(estadoLabel(warehouse.estado)) + '</span></div>' +
          '<div class="bc-inv-detail-row"><span>Existencias</span><strong>' +
          esc(qtyFmt(warehouse.cantidad) + ' ' + (warehouse.unidad || fila.unidad || 'u')) + '</strong></div>' +
          (warehouse.minimo != null
            ? '<div class="bc-inv-detail-row"><span>Mínimo</span><strong>' + esc(qtyFmt(warehouse.minimo)) + '</strong></div>'
            : '') +
          (variants.length
            ? '<div class="bc-inv-variants-title">Existencias por sabor / variante</div>' +
              variants.map(function (variant) {
                return '<div class="bc-inv-variant-row"><span>' + esc(variant.nombre || 'Variante') + '</span><strong>' +
                  esc(qtyFmt(variant.cantidad) + ' ' + (variant.unidad || warehouse.unidad || 'u')) + '</strong></div>';
              }).join('')
            : '') +
          '</section>';
      }).join('');
    modal.classList.remove('hidden');
    modal.querySelector('.bc-inv-modal-card').focus();
  }

  function bind() {
    const lista = document.getElementById('inv-detalle');
    if (!lista) { setTimeout(bind, 500); return; }
    if (lista.dataset.bcInvDetailBound === '1') return;
    lista.dataset.bcInvDetailBound = '1';
    const style = document.createElement('style');
    style.textContent = '#bc-inv-producto-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:10px}#bc-inv-producto-modal.hidden{display:none}.bc-inv-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72)}.bc-inv-modal-card{position:relative;width:min(540px,100%);max-height:88vh;overflow:auto;background:var(--void,#0c1c18);border:1px solid var(--gold,#c9a24d);border-radius:10px;padding:14px;color:var(--text,#eee);box-shadow:0 18px 60px rgba(0,0,0,.5)}.bc-inv-modal-card h2{margin:0 38px 9px 0;color:var(--gold,#c9a24d);font-size:1.2rem}.bc-inv-modal-close{position:absolute;right:9px;top:5px;border:0;background:none;color:var(--mist,#aaa);font-size:26px}.bc-inv-product-status{font-size:.76rem;color:var(--mist,#aaa);margin-bottom:8px}.bc-inv-warehouse-detail{padding:8px 0;border-top:1px solid rgba(201,162,77,.16)}.bc-inv-warehouse-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px}.bc-inv-warehouse-heading strong{font-size:.88rem}.bc-inv-warehouse-heading span{font-size:.68rem;color:var(--mist,#aaa);white-space:nowrap}.bc-inv-detail-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:.8rem}.bc-inv-detail-row span{color:var(--mist,#aaa)}.bc-inv-variants-title{padding-top:5px;font-size:.69rem;color:var(--gold,#c9a24d)}.bc-inv-variant-row{display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:.75rem;color:var(--mist,#aaa)}.bc-inv-variant-row strong{color:var(--text,#eee)}.rep-fila[data-inv-producto]{cursor:pointer}.rep-fila[data-inv-producto]:focus{outline:1px solid var(--gold,#c9a24d);outline-offset:2px}';

    document.head.appendChild(style);
    const render = () => {
      const filas = typeof _invFilas !== 'undefined' && Array.isArray(_invFilas) ? _invFilas : [];
      const rows = Array.from(lista.querySelectorAll('.rep-fila')).filter(x => !x.classList.contains('rep-totales'));
      rows.forEach((row, i) => {
        const fila = filas[i];
        if (!fila) return;
        row.dataset.invProducto = fila.producto_id || '';
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
      });
    };
    lista.addEventListener('click', e => {
      if (e.target.closest('.bc-m53-variant-details')) { e.stopPropagation(); return; }
      const row = e.target.closest('.rep-fila[data-inv-producto]');
      if (!row) return;
      const filas = typeof _invFilas !== 'undefined' ? _invFilas : [];
      const rows = Array.from(lista.querySelectorAll('.rep-fila[data-inv-producto]'));
      const f = filas[rows.indexOf(row)];
      if (f) abrir(f);
    });
    lista.addEventListener('keydown', e => {
      if (e.target.closest('.bc-m53-variant-details')) { e.stopPropagation(); return; }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.rep-fila[data-inv-producto]');
      if (!row) return;
      e.preventDefault();
      const filas = typeof _invFilas !== 'undefined' ? _invFilas : [];
      const rows = Array.from(lista.querySelectorAll('.rep-fila[data-inv-producto]'));
      const f = filas[rows.indexOf(row)];
      if (f) abrir(f);
    });
    new MutationObserver(render).observe(lista, { childList: true, subtree: true });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
