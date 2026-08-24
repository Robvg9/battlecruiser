// M26.6-FE runtime patches: stock ID compare + form/agregar usan almacén del turno
(function () {
  "use strict";
  function sameId(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  if (typeof obtenerStockDisponible === "function" && !obtenerStockDisponible.__bcM266) {
    var _origStock = obtenerStockDisponible;
    window.obtenerStockDisponible = function (producto_id, almacen_id) {
      try {
        var fila = (_cache.stock || []).find(function (s) {
          return s && sameId(s.producto_id, producto_id) && sameId(s.almacen_id, almacen_id);
        });
        var real = fila ? Number(fila.cantidad) : 0;
        var adj = { ajuste: 0, noCalculable: false };
        if (typeof ajustePendiente === "function") {
          adj = ajustePendiente(producto_id, almacen_id) || adj;
        }
        return { valor: Math.max(real + (adj.ajuste || 0), 0), ajuste: adj.ajuste || 0, noCalculable: !!adj.noCalculable };
      } catch (e) {
        return _origStock.apply(this, arguments);
      }
    };
    window.obtenerStockDisponible.__bcM266 = true;
  }

  function wireForm() {
    var form = document.getElementById("form-venta-linea");
    if (!form || form.dataset.bcM266Form === "1") return;
    form.dataset.bcM266Form = "1";
    form.addEventListener(
      "submit",
      function (e) {
        var almId = null;
        if (typeof obtenerAlmacenIdOperativoVenta === "function") almId = obtenerAlmacenIdOperativoVenta();
        if (!almId && typeof bcSincronizarSelectAlmacenTurno === "function") almId = bcSincronizarSelectAlmacenTurno();
        var sel = document.getElementById("venta-almacen");
        if (almId && sel) {
          if (![].some.call(sel.options, function (o) { return o.value === almId; })) {
            var opt = document.createElement("option");
            opt.value = almId;
            opt.textContent = "Almacén del turno";
            sel.appendChild(opt);
          }
          sel.value = almId;
        }
        var prodSel = document.getElementById("venta-producto");
        if (prodSel && prodSel.value && typeof bcAsegurarPrecioProductoVenta === "function") {
          bcAsegurarPrecioProductoVenta(prodSel.value);
        }
      },
      true
    );
  }

  function boot() {
    wireForm();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 400); });
  } else {
    setTimeout(boot, 400);
  }
  setTimeout(boot, 1200);
})();
