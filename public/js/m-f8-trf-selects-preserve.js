// BattleCruiser F8 — Preservar selects de Transferencias al refrescar almacenes/productos
// y filtrar almacenes inactivos en trf-origen / trf-destino.
(function () {
  "use strict";
  if (window.__BC_F8_TRF_SELECTS__) return;
  window.__BC_F8_TRF_SELECTS__ = true;

  function activos(list) {
    return (list || []).filter(function (a) {
      return a && a.activo !== false;
    });
  }

  function preserveFill(selId, items, labelFn) {
    var el = document.getElementById(selId);
    if (!el || typeof fillSelect !== "function") return;
    var prev = el.value;
    fillSelect(el, items, "id", labelFn || function (x) { return x.nombre; }, true);
    if (prev && items.some(function (x) { return String(x.id) === String(prev); })) {
      el.value = prev;
    }
  }

  function patchRefrescarAlmacenes() {
    if (typeof refrescarAlmacenes !== "function" || refrescarAlmacenes.__bcF8) return;
    var orig = refrescarAlmacenes;
    window.refrescarAlmacenes = async function () {
      var r = await orig.apply(this, arguments);
      try {
        var list = activos(typeof _cache !== "undefined" ? _cache.almacenes : r);
        preserveFill("trf-origen", list);
        preserveFill("trf-destino", list);
        if (typeof actualizarStockTransferenciaUI === "function") actualizarStockTransferenciaUI();
      } catch (e) {}
      return r;
    };
    window.refrescarAlmacenes.__bcF8 = true;
  }

  function patchRefrescarStockYSelects() {
    if (typeof refrescarStockYSelects !== "function" || refrescarStockYSelects.__bcF8) return;
    var orig = refrescarStockYSelects;
    window.refrescarStockYSelects = async function () {
      var prevProd = (document.getElementById("trf-producto") || {}).value;
      var r = await orig.apply(this, arguments);
      try {
        var prods =
          typeof _cache !== "undefined" && Array.isArray(_cache.productos)
            ? _cache.productos.filter(function (p) {
                return p && p.activo !== false;
              })
            : [];
        if (prods.length) {
          preserveFill("trf-producto", prods);
          if (prevProd) {
            var el = document.getElementById("trf-producto");
            if (el && prods.some(function (p) { return String(p.id) === String(prevProd); })) {
              el.value = prevProd;
            }
          }
        }
        if (typeof actualizarStockTransferenciaUI === "function") actualizarStockTransferenciaUI();
      } catch (e) {}
      return r;
    };
    window.refrescarStockYSelects.__bcF8 = true;
  }

  function boot() {
    patchRefrescarAlmacenes();
    patchRefrescarStockYSelects();
  }
  boot();
  setTimeout(boot, 400);
  setTimeout(boot, 1200);
})();
