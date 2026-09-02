// BattleCruiser — Inventario inmediato 2026-09-02
(function () {
  'use strict';
  if (window.__BCInventarioInmediato20260902) return;
  window.__BCInventarioInmediato20260902 = true;

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function cacheRows() {
    const c = window._cache || {};
    const stock = Array.isArray(c.stock) ? c.stock : [];
    const products = Array.isArray(c.productos) ? c.productos : [];
    const stores = Array.isArray(c.almacenes) ? c.almacenes : [];
    if (!stock.length) return [];
    const pMap = new Map(products.map(p => [String(p.id), p]));
    const aMap = new Map(stores.map(a => [String(a.id), a]));
    return stock.map(s => {
      const p = pMap.get(String(s.producto_id));
      const a = aMap.get(String(s.almacen_id));
      const cantidad = num(s.cantidad);
      const minimo = num(s.minimo);
      const estado = cantidad <= 0 ? 'agotado' : cantidad <= minimo ? 'bajo' : 'normal';
      return {
        producto_id: s.producto_id,
        producto: p?.nombre || s.producto || '—',
        almacen_id: s.almacen_id,
        almacen: a?.nombre || s.almacen || s.almacen_id || '—',
        cantidad,
        minimo,
        estado,
        valor_inventario: cantidad * num(p?.precio_normal)
      };
    });
  }

  function patch() {
    if (typeof window.refrescarInventario !== 'function' || window.refrescarInventario.__bcImmediate) return;
    const original = window.refrescarInventario;
    const wrapped = function () {
      const cached = cacheRows();
      if (cached.length && typeof window.renderInventario === 'function') {
        // First paint is synchronous/local; remote refresh continues below.
        window.renderInventario(cached);
      }
      try {
        const list = document.getElementById('inv-detalle');
        const originalHtml = list ? list.innerHTML : '';
        const observer = list ? new MutationObserver(() => {
          if (!list) return;
          const text = list.textContent || '';
          if (text.includes('Cargando inventario')) {
            if (cached.length) window.renderInventario(cached);
            else observer.disconnect();
          }
        }) : null;
        if (observer) observer.observe(list, {childList:true, subtree:true});
        const p = original.apply(this, arguments);
        Promise.resolve(p).finally(() => observer && observer.disconnect());
        return p;
      } catch (e) {
        return original.apply(this, arguments);
      }
    };
    wrapped.__bcImmediate = true;
    window.refrescarInventario = wrapped;
  }
  patch();
  setTimeout(patch, 300);
  setTimeout(patch, 900);
})();