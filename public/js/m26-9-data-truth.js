// BattleCruiser — M26.9-FE estable: datos de Ventas sin polling
(function () {
  'use strict';
  var FLAG = '__bcM269stable';
  if (window[FLAG]) return;
  window[FLAG] = true;

  function sameId(a, b) { return a != null && b != null && String(a) === String(b); }
  function stockState() { return typeof _stockCargaEstado === 'string' ? _stockCargaEstado : 'idle'; }
  function ensureCache() {
    if (typeof _cache === 'undefined') window._cache = { productos: [], almacenes: [], stock: [], ventas: [], transferencias: [], vales: [] };
    _cache.productos = _cache.productos || [];
    _cache.almacenes = _cache.almacenes || [];
    _cache.stock = _cache.stock || [];
  }

  function patchStock() {
    if (typeof obtenerStockDisponible !== 'function' || obtenerStockDisponible.__bcM269stable) return;
    var original = obtenerStockDisponible;
    window.obtenerStockDisponible = function (productoId, almacenId) {
      ensureCache();
      var st = stockState();
      if (st === 'idle' || st === 'loading') return { valor: 0, ajuste: 0, noCalculable: true, loaded: false, unknown: true, estado: st };
      var row = (_cache.stock || []).find(function (s) { return s && sameId(s.producto_id, productoId) && sameId(s.almacen_id, almacenId); });
      var real = row ? Number(row.cantidad) || 0 : 0;
      var adj = { ajuste: 0, noCalculable: false };
      try { if (typeof ajustePendiente === 'function') adj = ajustePendiente(productoId, almacenId) || adj; } catch (e) {}
      return { valor: Math.max(real + (Number(adj.ajuste) || 0), 0), ajuste: Number(adj.ajuste) || 0, noCalculable: !!adj.noCalculable, loaded: true, unknown: false, estado: st, hasRow: !!row };
    };
    window.obtenerStockDisponible.__bcM269stable = true;
    
    if (typeof stockTotalProducto === 'function' && !stockTotalProducto.__bcM269stable) {
      window.stockTotalProducto = function (productoId) {
        return (_cache.stock || []).filter(function (s) { return sameId(s.producto_id, productoId); }).reduce(function (n, s) { return n + (Number(s.cantidad) || 0); }, 0);
      };
      window.stockTotalProducto.__bcM269stable = true;
    }
  }

  function patchAddAndQty() {
    if (typeof agregarLineaVenta === 'function' && !agregarLineaVenta.__bcM269stable) {
      var add = agregarLineaVenta;
      window.agregarLineaVenta = function () {
        if (stockState() === 'idle' || stockState() === 'loading') {
          if (typeof cargarStockAlmacenes === 'function') cargarStockAlmacenes(false).catch(function () {});
          if (typeof setMsg === 'function') setMsg('msg-venta-linea', 'Cargando stock del almacén…', false);
          return false;
        }
        return add.apply(this, arguments);
      };
      window.agregarLineaVenta.__bcM269stable = true;
    }
    if (typeof actualizarCantidadLinea === 'function' && !actualizarCantidadLinea.__bcM269stable) {
      var qty = actualizarCantidadLinea;
      window.actualizarCantidadLinea = function (idx, cantidad) {
        if ((stockState() === 'idle' || stockState() === 'loading') && Number(cantidad) > 0) {
          if (typeof cargarStockAlmacenes === 'function') cargarStockAlmacenes(false).catch(function () {});
          if (typeof setMsg === 'function') setMsg('msg-venta-linea', 'Cargando stock…', false);
          return;
        }
        return qty.apply(this, arguments);
      };
      window.actualizarCantidadLinea.__bcM269stable = true;
    }
  }

  function syncProductsIntoVenta() {
    ensureCache();
    if (!Array.isArray(window.ventaProductosLista) || !window.ventaProductosLista.length) window.ventaProductosLista = _cache.productos.slice();
    if (window.ventaProductosPrecios && Array.isArray(_cache.productos)) {
      _cache.productos.forEach(function (p) {
        window.ventaProductosPrecios[p.id] = { nombre: p.nombre, precio_normal: p.precio_normal, precio_mayorista: p.precio_mayorista };
      });
    }
  }

  function renderVentasSafe() {
    try { if (typeof renderCatalogoGrid === 'function') renderCatalogoGrid(); } catch (e) {}
    try { if (typeof renderCatalogoCategorias === 'function') renderCatalogoCategorias(); } catch (e) {}
    try { if (typeof actualizarStockDisponibleUI === 'function') actualizarStockDisponibleUI(); } catch (e) {}
  }

  async function ensureVentasDataReady() {
    ensureCache();
    var tasks = [];
    if (!_cache.productos.length && typeof cargarProductos === 'function') {
      tasks.push(Promise.resolve(cargarProductos()).then(function (rows) {
        if (Array.isArray(rows)) { _cache.productos = rows; syncProductsIntoVenta(); }
      }));
    } else {
      syncProductsIntoVenta();
    }
    if (stockState() !== 'ok' && typeof cargarStockAlmacenes === 'function') {
      tasks.push(Promise.resolve(cargarStockAlmacenes(stockState() === 'error')).catch(function () {}));
    }
    if ((typeof ventaCategoriasLista === 'undefined' || !Array.isArray(ventaCategoriasLista) || !ventaCategoriasLista.length) && typeof cargarCategorias === 'function') {
      tasks.push(Promise.resolve(cargarCategorias()).then(function (rows) {
        window.ventaCategoriasLista = (Array.isArray(rows) ? rows : []).filter(function (c) { return c && c.id != null && c.nombre && c.activo !== false; });
      }).catch(function () {}));
    }
    await Promise.all(tasks);
    syncProductsIntoVenta();
    renderVentasSafe();
  }

  function patchRefreshVentas() {
    if (typeof refrescarVentas !== 'function' || refrescarVentas.__bcM269stable) return;
    var original = refrescarVentas;
    window.refrescarVentas = async function () {
      var r = await original.apply(this, arguments);
      await ensureVentasDataReady();
      return r;
    };
    window.refrescarVentas.__bcM269stable = true;
  }

  function bindVentasTab() {
    var tabs = document.getElementById('tabs');
    if (!tabs || tabs.dataset.bcM269stable === '1') return;
    tabs.dataset.bcM269stable = '1';
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn[data-tab="ventas"]');
      if (!btn) return;
      ensureVentasDataReady().catch(function () {});
    }, true);
    var tab = document.getElementById('tab-ventas');
    if (tab && tab.classList.contains('visible')) ensureVentasDataReady().catch(function () {});
  }

  function boot() {
    ensureCache();
    patchStock();
    patchAddAndQty();
    patchRefreshVentas();
    bindVentasTab();
    if (typeof window.actualizarStockDisponibleUI === 'function' && !window.actualizarStockDisponibleUI.__bcM269stable) {
      var original = window.actualizarStockDisponibleUI;
      window.actualizarStockDisponibleUI = function () {
        var info = document.getElementById('venta-stock-disponible');
        var st = stockState();
        if (info && (st === 'idle' || st === 'loading')) info.textContent = 'Stock: cargando…';
        return original.apply(this, arguments);
      };
      window.actualizarStockDisponibleUI.__bcM269stable = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 350); });
  else setTimeout(boot, 350);
})();
