// ==== BattleCruiser · js/p0a-local-reads.js ====
// P0-A Local-first reads: inventario proyectado, movimientos snapshot, reportes stock local.
// No segunda cola. Reutiliza withCache / leerDeCache / ajustePendiente.
(function () {
  "use strict";
  if (window.__bcP0ALocalReads) return;
  window.__bcP0ALocalReads = true;

  var MOV_CACHE_KEY = "movimientos_snapshot";

  async function ensureOpsCache() {
    if (typeof refrescarOperacionesPendientesCache === "function") {
      try { await refrescarOperacionesPendientesCache(); } catch (e) {}
    }
  }

  function notaLocal(el, texto) {
    if (!el) return;
    el.textContent = texto || "⚪ Datos locales · pueden estar desactualizados";
  }

  async function construirProyeccionLocal(almacenFiltro) {
    await ensureOpsCache();
    var stock = (window._cache && Array.isArray(_cache.stock)) ? _cache.stock : [];
    if ((!stock || !stock.length) && typeof leerDeCache === "function") {
      try {
        var s = await leerDeCache("stock");
        if (Array.isArray(s) && s.length) { stock = s; if (window._cache) _cache.stock = s; }
      } catch (e) {}
    }
    var productos = (window._cache && Array.isArray(_cache.productos)) ? _cache.productos : [];
    if ((!productos || !productos.length) && typeof leerDeCache === "function") {
      try {
        var p = await leerDeCache("productos");
        if (Array.isArray(p) && p.length) { productos = p; if (window._cache) _cache.productos = p; }
      } catch (e) {}
    }
    var almacenes = (window._cache && Array.isArray(_cache.almacenes)) ? _cache.almacenes : [];
    if ((!almacenes || !almacenes.length) && typeof leerDeCache === "function") {
      try {
        var a = await leerDeCache("almacenes");
        if (Array.isArray(a) && a.length) { almacenes = a; if (window._cache) _cache.almacenes = a; }
      } catch (e) {}
    }
    var prodById = {}, almById = {};
    productos.forEach(function (x) { if (x && x.id != null) prodById[String(x.id)] = x; });
    almacenes.forEach(function (x) { if (x && x.id != null) almById[String(x.id)] = x; });
    var filas = [];
    (stock || []).forEach(function (s) {
      if (!s) return;
      if (almacenFiltro && String(s.almacen_id) !== String(almacenFiltro)) return;
      var base = Number(s.cantidad) || 0;
      var ajuste = 0, proyectado = false;
      if (typeof ajustePendiente === "function") {
        var r = ajustePendiente(s.producto_id, s.almacen_id);
        if (r) {
          if (!r.noCalculable) ajuste = Number(r.ajuste) || 0;
          if (ajuste !== 0 || r.noCalculable) proyectado = true;
        }
      }
      var cant = base + ajuste;
      var minimo = s.minimo != null ? Number(s.minimo) : null;
      var estado = cant <= 0 ? "agotado" : (minimo != null && cant <= minimo ? "bajo" : "normal");
      var pr = prodById[String(s.producto_id)];
      var al = almById[String(s.almacen_id)];
      filas.push({
        producto_id: s.producto_id,
        almacen_id: s.almacen_id,
        producto: (pr && pr.nombre) || "—",
        almacen: (al && al.nombre) || "—",
        cantidad: cant,
        minimo: minimo,
        estado: estado,
        valor_inventario: null,
        _local_proyectado: proyectado
      });
    });
    return filas;
  }

  async function inventarioDesdeLocal() {
    await ensureOpsCache();
    var sel = document.getElementById("inv-filtro-almacen");
    var almacen = sel && sel.value ? sel.value : null;
    var filas = await construirProyeccionLocal(almacen);
    var conn = document.getElementById("inv-conn-info");
    notaLocal(conn, filas.length
      ? "⚪ Datos locales · stock proyectado (puede estar desactualizado)"
      : "⚪ Sin conexión — sin stock guardado en este dispositivo");
    if (typeof window.renderInventario === "function") {
      window.renderInventario(filas);
    }
    try {
      if (filas.some(function (f) { return f._local_proyectado; })) {
        var note = document.getElementById("inv-p0a-note");
        if (!note) {
          note = document.createElement("p");
          note.id = "inv-p0a-note";
          note.className = "muted";
          note.style.cssText = "margin:0 0 10px;font-size:12px";
          var metrics = document.getElementById("inv-resumen");
          if (metrics && metrics.parentNode) metrics.parentNode.insertBefore(note, metrics.nextSibling);
        }
        note.textContent = "Algunas cantidades incluyen operaciones pendientes (proyección local, no confirmada por servidor).";
      }
    } catch (e) {}
    return filas;
  }

  function opsPendientesComoMovimientos() {
    var ops = (typeof _operacionesPendientesCache !== "undefined" && _operacionesPendientesCache) || [];
    var out = [];
    var productos = (window._cache && _cache.productos) || [];
    var almacenes = (window._cache && _cache.almacenes) || [];
    function nomP(id) {
      var p = productos.find(function (x) { return String(x.id) === String(id); });
      return (p && p.nombre) || id || "—";
    }
    function nomA(id) {
      var a = almacenes.find(function (x) { return String(x.id) === String(id); });
      return (a && a.nombre) || id || "—";
    }
    ops.forEach(function (op) {
      if (!op || (op.estado !== "PENDIENTE" && op.estado !== "SINCRONIZANDO")) return;
      var p = op.payload || {};
      var base = { fecha: op.creado_en, usuario: "Local · pendiente", operacion_id: op.id, _local_pendiente: true };
      if (op.tipo === "compra") {
        out.push(Object.assign({}, base, { tipo: "compra", producto: nomP(p.p_producto_id), almacen: nomA(p.p_almacen_id), cantidad: Number(p.p_cantidad) || Number(p.p_cantidad_presentacion) || 0 }));
      } else if (op.tipo === "venta") {
        (p.p_lineas || []).forEach(function (l) {
          out.push(Object.assign({}, base, { tipo: "venta", producto: nomP(l.producto_id), almacen: nomA(p.p_almacen_id), cantidad: -(Number(l.cantidad) || 0) }));
        });
      } else if (op.tipo === "vale") {
        out.push(Object.assign({}, base, { tipo: "vale", producto: nomP(p.p_producto_id), almacen: nomA(p.p_almacen_id), cantidad: -(Number(p.p_cantidad) || 0) }));
      } else if (op.tipo === "transferencia") {
        (p.p_lineas || []).forEach(function (l) {
          out.push(Object.assign({}, base, { tipo: "transferencia_salida", producto: nomP(l.producto_id), almacen: nomA(p.p_origen_id), cantidad: -(Number(l.cantidad) || 0) }));
          out.push(Object.assign({}, base, { tipo: "transferencia_entrada", producto: nomP(l.producto_id), almacen: nomA(p.p_destino_id), cantidad: Number(l.cantidad) || 0 }));
        });
      }
    });
    return out;
  }

  async function movimientosDesdeLocal() {
    await ensureOpsCache();
    var snap = [];
    if (typeof leerDeCache === "function") {
      try { snap = await leerDeCache(MOV_CACHE_KEY); } catch (e) { snap = []; }
    }
    if (!Array.isArray(snap)) snap = [];
    var merged = opsPendientesComoMovimientos().concat(snap);
    var conn = document.getElementById("mov-conn-info");
    notaLocal(conn, merged.length
      ? "⚪ Datos locales · snapshot + pendientes (pueden estar desactualizados)"
      : "⚪ Sin conexión — sin movimientos guardados en este dispositivo");
    if (typeof window.renderMovimientos === "function") window.renderMovimientos(merged);
    return merged;
  }

  async function guardarSnapshotMovimientos(filas) {
    if (!Array.isArray(filas) || typeof idbSet !== "function") return;
    try { await idbSet(MOV_CACHE_KEY, filas.slice(0, 500)); } catch (e) {}
  }

  function wrapInventario() {
    var orig = window.refrescarInventario;
    if (typeof orig !== "function" || orig.__p0aWrapped) return;
    window.refrescarInventario = async function () {
      if (!navigator.onLine) return inventarioDesdeLocal();
      try { return await orig.apply(this, arguments); }
      catch (e) {
        console.warn("[P0-A] inventario online falló → local", e);
        return inventarioDesdeLocal();
      }
    };
    window.refrescarInventario.__p0aWrapped = true;
  }

  function wrapMovimientos() {
    var orig = window.refrescarMovimientos;
    if (typeof orig !== "function" || orig.__p0aWrapped) return;
    window.refrescarMovimientos = async function () {
      if (!navigator.onLine) return movimientosDesdeLocal();
      try { return await orig.apply(this, arguments); }
      catch (e) {
        console.warn("[P0-A] movimientos online falló → local", e);
        return movimientosDesdeLocal();
      }
    };
    window.refrescarMovimientos.__p0aWrapped = true;
  }

  function wrapRenderMovimientos() {
    var orig = window.renderMovimientos;
    if (typeof orig !== "function" || orig.__p0aSnap) return;
    window.renderMovimientos = function (filas) {
      if (navigator.onLine && Array.isArray(filas) && filas.length) guardarSnapshotMovimientos(filas);
      return orig.apply(this, arguments);
    };
    window.renderMovimientos.__p0aSnap = true;
  }

  function patchReportes() {
    if (typeof window.refrescarResumenEjecutivo === "function" && !window.refrescarResumenEjecutivo.__p0a) {
      var origR = window.refrescarResumenEjecutivo;
      window.refrescarResumenEjecutivo = async function () {
        if (!navigator.onLine) {
          var el = document.getElementById("rep-resumen");
          if (!el) return;
          var stock = (window._cache && _cache.stock) || [];
          if ((!stock || !stock.length) && typeof leerDeCache === "function") {
            try { stock = await leerDeCache("stock"); } catch (e) { stock = []; }
          }
          if (!stock || !stock.length) {
            el.innerHTML = '<p class="lista-estado">Sin datos locales suficientes para el resumen ejecutivo.</p>';
            return;
          }
          var unidades = 0, lineas = stock.length, bajos = 0, agotados = 0;
          stock.forEach(function (s) {
            var c = Number(s.cantidad) || 0;
            unidades += c;
            if (c <= 0) agotados++;
            else if (s.minimo != null && c <= Number(s.minimo)) bajos++;
          });
          if (typeof renderResumenEjecutivo === "function") {
            renderResumenEjecutivo({
              ventas: { cantidad: 0, ingresos: 0, ticket_promedio: 0, unidades: 0 },
              transferencias: { cantidad: 0, unidades: 0 },
              vales: { cantidad: 0, unidades: 0 },
              inventario: { productos: lineas, unidades: unidades, stock_bajo: bajos, stock_agotado: agotados },
              compras: { disponible: false, nota: "Offline — sin datos de compras locales" },
              margen: { disponible: false, nota: "Offline — margen requiere servidor" }
            });
          } else {
            el.innerHTML = '<p class="lista-estado">Resumen local (stock): ' + lineas + " líneas · " + unidades + " u</p>";
          }
          notaLocal(document.getElementById("reportes-conn-info"));
          return;
        }
        return origR.apply(this, arguments);
      };
      window.refrescarResumenEjecutivo.__p0a = true;
    }
    if (typeof window.refrescarSubReporte === "function" && !window.refrescarSubReporte.__p0a) {
      var origS = window.refrescarSubReporte;
      window.refrescarSubReporte = async function () {
        if (!navigator.onLine) {
          var el = document.getElementById("rep-detalle");
          if (!el) return;
          var sub = typeof _repSubreporte !== "undefined" ? _repSubreporte : "ventas";
          if (sub === "stock") {
            var stock = (window._cache && _cache.stock) || [];
            if ((!stock || !stock.length) && typeof leerDeCache === "function") {
              try { stock = await leerDeCache("stock"); } catch (e) { stock = []; }
            }
            var productos = (window._cache && _cache.productos) || [];
            var almacenes = (window._cache && _cache.almacenes) || [];
            var filas = (stock || []).map(function (s) {
              var pr = productos.find(function (p) { return String(p.id) === String(s.producto_id); });
              var al = almacenes.find(function (a) { return String(a.id) === String(s.almacen_id); });
              var c = Number(s.cantidad) || 0;
              return {
                producto: (pr && pr.nombre) || "—",
                almacen: (al && al.nombre) || "—",
                categoria: pr && pr.categorias && pr.categorias.nombre ? pr.categorias.nombre : "",
                cantidad: c,
                minimo: s.minimo,
                estado: c <= 0 ? "agotado" : (s.minimo != null && c <= Number(s.minimo) ? "bajo" : "normal")
              };
            });
            if (typeof renderStockReporte === "function") renderStockReporte(filas);
            else el.innerHTML = '<p class="lista-estado">Stock local: ' + filas.length + " filas.</p>";
            return;
          }
          el.innerHTML = '<p class="lista-estado">Sin datos locales suficientes para este reporte. Usá sub-reporte Stock offline o abrilo con Internet.</p>';
          return;
        }
        return origS.apply(this, arguments);
      };
      window.refrescarSubReporte.__p0a = true;
    }
  }

  function watchdogBloqueosOffline() {
    if (navigator.onLine) return;
    var inv = document.getElementById("inv-detalle");
    if (inv && /inventario enriquecido requiere|datos de Supabase/i.test(inv.innerHTML || "")) inventarioDesdeLocal();
    var mov = document.getElementById("mov-detalle");
    if (mov && /movimientos requieren datos de Supabase/i.test(mov.innerHTML || "")) movimientosDesdeLocal();
    var rep = document.getElementById("rep-resumen");
    if (rep && /reportes requieren datos de Supabase/i.test(rep.innerHTML || "") && typeof refrescarResumenEjecutivo === "function") refrescarResumenEjecutivo();
  }

  function installAll() {
    wrapInventario();
    wrapMovimientos();
    wrapRenderMovimientos();
    patchReportes();
  }

  installAll();
  setTimeout(installAll, 800);
  setTimeout(installAll, 2000);
  setTimeout(installAll, 5000);
  setInterval(function () { installAll(); watchdogBloqueosOffline(); }, 2000);
  console.info("[BattleCruiser] P0-A local reads activo");
})();
