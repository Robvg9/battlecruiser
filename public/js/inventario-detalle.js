/* BattleCruiser — detalle accionable de inventario */
(function () {
  'use strict';
  const esc = v => typeof escHtml === 'function' ? escHtml(String(v ?? '—')) : String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moneySafe = v => typeof money === 'function' ? '$' + money(v) : String(v ?? '—');

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
    const estado = fila.estado === 'agotado' ? '🔴 Agotado' : fila.estado === 'bajo' ? '🟡 Bajo mínimo' : '🟢 Normal';
    title.textContent = fila.producto || 'Producto';
    body.innerHTML = [
      ['Almacén', fila.almacen],
      ['Estado', estado],
      ['Cantidad', (fila.cantidad ?? 0) + ' unidades'],
      ['Mínimo', fila.minimo ?? '—'],
      ['Costo promedio', moneySafe(fila.costo_promedio)],
      ['Valor del inventario', moneySafe(fila.valor_inventario)],
      ['Producto ID', fila.producto_id]
    ].map(([k,v]) => '<div class="bc-inv-detail-row"><span>' + esc(k) + '</span><strong>' + esc(v) + '</strong></div>').join('');
    modal.classList.remove('hidden');
    modal.querySelector('.bc-inv-modal-card').focus();
  }

  function bind() {
    const lista = document.getElementById('inv-detalle');
    if (!lista) { setTimeout(bind, 500); return; }
    if (lista.dataset.bcInvDetailBound === '1') return;
    lista.dataset.bcInvDetailBound = '1';
    const style = document.createElement('style');
    style.textContent = '#bc-inv-producto-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:12px}#bc-inv-producto-modal.hidden{display:none}.bc-inv-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72)}.bc-inv-modal-card{position:relative;width:min(620px,100%);max-height:90vh;overflow:auto;background:var(--void,#0c1c18);border:1px solid var(--gold,#c9a24d);border-radius:10px;padding:18px;color:var(--text,#eee);box-shadow:0 18px 60px rgba(0,0,0,.5)}.bc-inv-modal-card h2{margin:0 40px 16px 0;color:var(--gold,#c9a24d)}.bc-inv-modal-close{position:absolute;right:10px;top:7px;border:0;background:none;color:var(--mist,#aaa);font-size:28px}.bc-inv-detail-row{display:grid;grid-template-columns:1fr 1.5fr;gap:12px;padding:10px 0;border-bottom:1px solid rgba(201,162,77,.12)}.bc-inv-detail-row span{color:var(--mist,#aaa)}@media(max-width:560px){.bc-inv-detail-row{grid-template-columns:1fr;gap:3px}}.rep-fila[data-inv-producto]{cursor:pointer}.rep-fila[data-inv-producto]:focus{outline:1px solid var(--gold,#c9a24d);outline-offset:2px}';
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
    lista.addEventListener('click', e => { const row = e.target.closest('.rep-fila[data-inv-producto]'); if (!row) return; const filas = typeof _invFilas !== 'undefined' ? _invFilas : []; const rows = Array.from(lista.querySelectorAll('.rep-fila[data-inv-producto]')); const f = filas[rows.indexOf(row)]; if (f) abrir(f); });
    lista.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const row = e.target.closest('.rep-fila[data-inv-producto]'); if (!row) return; e.preventDefault(); const filas = typeof _invFilas !== 'undefined' ? _invFilas : []; const rows = Array.from(lista.querySelectorAll('.rep-fila[data-inv-producto]')); const f = filas[rows.indexOf(row)]; if (f) abrir(f); });
    new MutationObserver(render).observe(lista, { childList: true, subtree: true });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
