// BattleCruiser — M26.9-FE: fuente única productos/stock + estados NOT_LOADED
// Reutiliza: _cache, withCache, cargarProductos, cargarStockAlmacenes,
// obtenerStockDisponible, renderCatalogoGrid, refrescarVentas, ventaLineas.
// NO reescribe ventas.js/almacenes.js. NO toca Supabase/RLS.
(function () {
  "use strict";

  var FLAG = "__bcM269";

  function sameId(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  function stockEstadoGlobal() {
    if (typeof _stockCargaEstado === "string") return _stockCargaEstado;
    return "idle";
  }

  function ensureCache() {
    if (typeof _cache === "undefined") {
      try {
        window._cache = { productos: [], almacenes: [], stock: [], ventas: [], transferencias: [], vales: [] };
      } catch (e) {}
    }
    if (!_cache.stock) _cache.stock = [];
    if (!_cache.productos) _cache.productos = [];
    if (!_cache.almacenes) _cache.almacenes = [];
  }

  function patchObtenerStock() {
    if (typeof obtenerStockDisponible !== "function") return;
    if (obtenerStockDisponible[FLAG]) return;

    var orig = obtenerStockDisponible;
    window.obtenerStockDisponible = function (producto_id, almacen_id) {
      ensureCache();
      var st = stockEstadoGlobal();

      if (st === "idle" || st === "loading") {
        return {
          valor: 0,
          ajuste: 0,
          noCalculable: true,
          loaded: false,
          unknown: true,
          estado: st,
        };
      }

      try {
        var fila = (_cache.stock || []).find(function (s) {
          return s && sameId(s.producto_id, producto_id) && sameId(s.almacen_id, almacen_id);
        });
        var real = fila ? Number(fila.cantidad) : 0;
        var adj = { ajuste: 0, noCalculable: false };
        if (typeof ajustePendiente === "function") {
          try {
            adj = ajustePendiente(producto_id, almacen_id) || adj;
          } catch (e) {}
        }
        return {
          valor: Math.max(real + (adj.ajuste || 0), 0),
          ajuste: adj.ajuste || 0,
          noCalculable: !!adj.noCalculable,
          loaded: true,
          unknown: false,
          estado: st,
          hasRow: !!fila,
        };
      } catch (e2) {
        return orig.apply(this, arguments);
      }
    };
    window.obtenerStockDisponible[FLAG] = true;
  }

  function patchAgregarLinea() {
    if (typeof agregarLineaVenta !== "function" || agregarLineaVenta[FLAG]) return;
    var orig = agregarLineaVenta;
    window.agregarLineaVenta = function (producto_id, cantidad, almacen_id) {
      ensureCache();
      var st = stockEstadoGlobal();
      if (st === "idle" || st === "loading") {
        if (typeof cargarStockAlmacenes === "function") {
          try {
            cargarStockAlmacenes(false);
          } catch (e) {}
        }
        if (typeof setMsg === "function") {
          setMsg(
            "msg-venta-linea",
            "Cargando stock del almacén… esperá un momento e intentá de nuevo.",
            false
          );
        }
        return false;
      }
      return orig.apply(this, arguments);
    };
    window.agregarLineaVenta[FLAG] = true;
  }

  function patchActualizarCantidad() {
    if (typeof actualizarCantidadLinea !== "function") return;
    if (actualizarCantidadLinea[FLAG]) return;
    var prev = actualizarCantidadLinea;
    window.actualizarCantidadLinea = function (idx, nuevaCantidad) {
      var st = stockEstadoGlobal();
      if ((st === "idle" || st === "loading") && nuevaCantidad > 0) {
        if (typeof cargarStockAlmacenes === "function") {
          try {
            cargarStockAlmacenes(false);
          } catch (e) {}
        }
        if (typeof setMsg === "function") {
          setMsg(
            "msg-venta-linea",
            "Cargando stock… no se puede validar cantidad todavía.",
            false
          );
        }
        if (typeof renderVentaLineas === "function") renderVentaLineas();
        return;
      }
      return prev.apply(this, arguments);
    };
    window.actualizarCantidadLinea[FLAG] = true;
  }

  function patchRenderCatalogo() {
    if (typeof renderCatalogoGrid !== "function" || renderCatalogoGrid[FLAG]) return;
    var orig = renderCatalogoGrid;
    window.renderCatalogoGrid = function () {
      ensureCache();
      var grid = document.getElementById("catalogo-grid");
      var lista =
        typeof ventaProductosLista !== "undefined" && Array.isArray(ventaProductosLista)
          ? ventaProductosLista
          : _cache.productos || [];

      if ((!lista || lista.length === 0) && (_cache.productos || []).length > 0) {
        try {
          if (typeof ventaProductosLista !== "undefined") {
            ventaProductosLista = _cache.productos.slice();
            lista = ventaProductosLista;
          }
        } catch (e) {}
        lista = _cache.productos || [];
      }

      if (!lista || lista.length === 0) {
        if (grid) {
          grid.innerHTML = '<p class="lista-estado">Cargando productos…</p>';
        }
        if (typeof cargarProductos === "function") {
          Promise.resolve(cargarProductos())
            .then(function (p) {
              if (Array.isArray(p) && p.length) {
                _cache.productos = p;
                try {
                  if (typeof ventaProductosLista !== "undefined") ventaProductosLista = p;
                } catch (e2) {}
                try {
                  orig.apply(this, arguments);
                } catch (e3) {}
              } else if (grid) {
                grid.innerHTML =
                  '<p class="lista-estado">No hay productos activos cargados todavía.</p>';
              }
            })
            .catch(function () {
              if (grid)
                grid.innerHTML =
                  '<p class="lista-estado">No se pudieron cargar los productos.</p>';
            });
        }
        return;
      }

      try {
        if (typeof catalogoCategoriaActiva === "undefined" || catalogoCategoriaActiva == null) {
          catalogoCategoriaActiva = "";
        }
      } catch (e4) {}

      return orig.apply(this, arguments);
    };
    window.renderCatalogoGrid[FLAG] = true;
  }

  function patchRefrescarVentas() {
    if (typeof refrescarVentas !== "function" || refrescarVentas[FLAG]) return;
    var orig = refrescarVentas;
    window.refrescarVentas = async function () {
      var r = await orig.apply(this, arguments);
      ensureCache();
      try {
        if (typeof ventaProductosPrecios !== "undefined") {
          (_cache.productos || []).forEach(function (p) {
            if (!ventaProductosPrecios[p.id]) {
              ventaProductosPrecios[p.id] = {
                nombre: p.nombre,
                precio_normal: p.precio_normal,
                precio_mayorista: p.precio_mayorista,
              };
            }
          });
        }
        if (typeof ventaProductosLista !== "undefined") {
          if (!ventaProductosLista || !ventaProductosLista.length) {
            ventaProductosLista = (_cache.productos || []).slice();
          }
        }
      } catch (e) {}

      var st = stockEstadoGlobal();
      if (st !== "ok" && typeof cargarStockAlmacenes === "function") {
        try {
          await cargarStockAlmacenes(st === "error");
        } catch (e2) {}
      }
      if (typeof renderCatalogoGrid === "function") {
        try {
          renderCatalogoGrid();
        } catch (e3) {}
      }
      if (typeof actualizarStockDisponibleUI === "function") {
        try {
          actualizarStockDisponibleUI();
        } catch (e4) {}
      }
      return r;
    };
    window.refrescarVentas[FLAG] = true;
  }

  function patchStockUI() {
    if (typeof actualizarStockDisponibleUI !== "function" || actualizarStockDisponibleUI[FLAG])
      return;
    var orig = actualizarStockDisponibleUI;
    window.actualizarStockDisponibleUI = function () {
      var infoEl = document.getElementById("venta-stock-disponible");
      var st = stockEstadoGlobal();
      if (st === "idle" || st === "loading") {
        if (infoEl) {
          infoEl.textContent = "Stock: cargando…";
          infoEl.className = "msg";
        }
        if (typeof cargarStockAlmacenes === "function" && st === "idle") {
          try {
            cargarStockAlmacenes(false);
          } catch (e) {}
        }
      }
      return orig.apply(this, arguments);
    };
    window.actualizarStockDisponibleUI[FLAG] = true;
  }

  function ensureVentasDataReady() {
    ensureCache();
    var needsProductos = !(_cache.productos && _cache.productos.length);
    var st = stockEstadoGlobal();
    var needsStock = st !== "ok";

    var tasks = [];
    if (needsProductos && typeof cargarProductos === "function") {
      tasks.push(
        Promise.resolve(cargarProductos()).then(function (p) {
          if (Array.isArray(p)) {
            _cache.productos = p;
            try {
              if (typeof ventaProductosLista !== "undefined") ventaProductosLista = p;
              if (typeof ventaProductosPrecios !== "undefined") {
                p.forEach(function (x) {
                  ventaProductosPrecios[x.id] = {
                    nombre: x.nombre,
                    precio_normal: x.precio_normal,
                    precio_mayorista: x.precio_mayorista,
                  };
                });
              }
            } catch (e) {}
          }
        })
      );
    }
    if (needsStock && typeof cargarStockAlmacenes === "function") {
      tasks.push(Promise.resolve(cargarStockAlmacenes(st === "error")));
    }
    return Promise.all(tasks).then(function () {
      if (typeof renderCatalogoGrid === "function") {
        try {
          renderCatalogoGrid();
        } catch (e) {}
      }
      if (typeof renderCatalogoCategorias === "function") {
        try {
          renderCatalogoCategorias();
        } catch (e2) {}
      }
    });
  }

  function wireTabVentas() {
    if (document.documentElement.dataset[FLAG + "Tab"] === "1") return;
    document.documentElement.dataset[FLAG + "Tab"] = "1";
    var tabs = document.getElementById("tabs");
    if (!tabs) return;
    tabs.addEventListener(
      "click",
      function (e) {
        var btn = e.target.closest('.tab-btn[data-tab="ventas"]');
        if (!btn) return;
        setTimeout(function () {
          ensureVentasDataReady().catch(function () {});
        }, 50);
      },
      true
    );
  }

  function patchStockTotalProducto() {
    if (typeof stockTotalProducto !== "function" || stockTotalProducto[FLAG]) return;
    window.stockTotalProducto = function (productoId) {
      return (_cache.stock || [])
        .filter(function (s) {
          return sameId(s.producto_id, productoId);
        })
        .reduce(function (acc, s) {
          return acc + (Number(s.cantidad) || 0);
        }, 0);
    };
    window.stockTotalProducto[FLAG] = true;
  }

  function boot() {
    ensureCache();
    patchObtenerStock();
    patchAgregarLinea();
    patchActualizarCantidad();
    patchRenderCatalogo();
    patchRefrescarVentas();
    patchStockUI();
    patchStockTotalProducto();
    wireTabVentas();
  }

  function start() {
    boot();
    var n = 0;
    var t = setInterval(function () {
      n++;
      boot();
      if (n >= 30) clearInterval(t);
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(start, 400);
    });
  } else {
    setTimeout(start, 400);
  }
})();
