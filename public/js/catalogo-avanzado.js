// ==== Battlecruiser · js/catalogo-avanzado.js ====
// T9 — Filtros de catálogo (categoría, unidad, stock) sobre datos en _cache.
// Inyecta la barra de filtros en el DOM si no existe. No toca CRUD, imágenes,
// presentaciones, ejecutarOperacion, IndexedDB ni cola.

(function () {
  "use strict";

  var _filtroCategoria = "";
  var _filtroUnidad = "";
  var _filtroStock = "";
  var _aplicando = false;

  function stockTotal(productoId) {
    try {
      return (_cache.stock || [])
        .filter(function (s) { return s.producto_id === productoId; })
        .reduce(function (acc, s) { return acc + (Number(s.cantidad) || 0); }, 0);
    } catch (e) {
      return 0;
    }
  }

  function ensureFiltrosUI() {
    if (document.getElementById("productos-filtros-t9")) return;
    var cont = document.querySelector(".productos-buscador-controles");
    if (!cont) return;

    var bar = document.createElement("div");
    bar.id = "productos-filtros-t9";
    bar.className = "productos-filtros-t9";
    bar.innerHTML =
      '<select id="productos-filtro-categoria" aria-label="Filtrar por categoría">' +
      '<option value="">Todas las categorías</option></select>' +
      '<select id="productos-filtro-unidad" aria-label="Filtrar por unidad">' +
      '<option value="">Todas las unidades</option></select>' +
      '<select id="productos-filtro-stock" aria-label="Filtrar por stock">' +
      '<option value="">Todo el stock</option>' +
      '<option value="con">Con stock</option>' +
      '<option value="sin">Agotados</option></select>';

    cont.appendChild(bar);

    if (!document.getElementById("productos-filtros-t9-style")) {
      var st = document.createElement("style");
      st.id = "productos-filtros-t9-style";
      st.textContent =
        ".productos-filtros-t9{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;width:100%}" +
        ".productos-filtros-t9 select{flex:1 1 140px;min-width:120px;max-width:100%}" +
        ".lista-item .stock-agotado{color:#c47a6a}";
      document.head.appendChild(st);
    }
  }

  function poblarSelects() {
    var productos = (_cache && _cache.productos) || [];
    var selCat = document.getElementById("productos-filtro-categoria");
    var selUni = document.getElementById("productos-filtro-unidad");

    if (selCat) {
      var actualCat = selCat.value;
      var cats = {};
      productos.forEach(function (p) {
        if (p.categoria_id && p.categorias && p.categorias.nombre) {
          cats[p.categoria_id] = p.categorias.nombre;
        }
      });
      while (selCat.options.length > 1) selCat.remove(1);
      Object.keys(cats).sort(function (a, b) {
        return cats[a].localeCompare(cats[b], "es");
      }).forEach(function (id) {
        var o = document.createElement("option");
        o.value = id;
        o.textContent = cats[id];
        selCat.appendChild(o);
      });
      if (actualCat) selCat.value = actualCat;
    }

    if (selUni) {
      var actualUni = selUni.value;
      var unidades = [];
      var visto = {};
      productos.forEach(function (p) {
        var u = (p.unidad || "").trim();
        if (u && !visto[u.toLowerCase()]) {
          visto[u.toLowerCase()] = true;
          unidades.push(u);
        }
      });
      unidades.sort(function (a, b) { return a.localeCompare(b, "es"); });
      selUni.innerHTML = '<option value="">Todas las unidades</option>';
      unidades.forEach(function (u) {
        var o = document.createElement("option");
        o.value = u;
        o.textContent = u;
        selUni.appendChild(o);
      });
      if (actualUni) selUni.value = actualUni;
    }
  }

  function aplicarFiltros() {
    if (_aplicando) return;
    _aplicando = true;
    try {
      var lista = document.getElementById("lista-productos");
      if (!lista) return;

      var productos = (_cache && _cache.productos) || [];
      var byId = {};
      productos.forEach(function (p) { byId[p.id] = p; });

      var items = lista.querySelectorAll(".lista-item[data-ctx-tipo='producto']");
      if (!items.length) return;

      var hayFiltro = !!(_filtroCategoria || _filtroUnidad || _filtroStock);
      var visibles = 0;
      items.forEach(function (div) {
        var id = div.getAttribute("data-ctx-id");
        var p = byId[id];
        var ok = true;
        if (hayFiltro && p) {
          if (_filtroCategoria && p.categoria_id !== _filtroCategoria) ok = false;
          if (_filtroUnidad && (p.unidad || "").trim() !== _filtroUnidad) ok = false;
          if (_filtroStock === "con" && stockTotal(id) <= 0) ok = false;
          if (_filtroStock === "sin" && stockTotal(id) > 0) ok = false;
        }
        if (!hayFiltro) {
          div.style.display = "";
          visibles++;
        } else {
          div.style.display = ok ? "" : "none";
          if (ok) visibles++;
        }
      });

      if (typeof actualizarContador === "function") {
        // Con o sin filtro: el contador debe reflejar lo visible en DOM.
        actualizarContador("productos-contador", visibles, productos.length);
      }
    } finally {
      _aplicando = false;
    }
  }

  function limpiarFiltrosSelect() {
    _filtroCategoria = "";
    _filtroUnidad = "";
    _filtroStock = "";
    var selCat = document.getElementById("productos-filtro-categoria");
    var selUni = document.getElementById("productos-filtro-unidad");
    var selStock = document.getElementById("productos-filtro-stock");
    if (selCat) selCat.value = "";
    if (selUni) selUni.value = "";
    if (selStock) selStock.value = "";
    // Post-9.3 bugfix: tras "Ver todos", productos.js re-renderiza y el
    // MutationObserver puede haber re-aplicado filtros viejos antes de limpiar.
    // Hay que volver a mostrar todos los ítems y sincronizar el contador.
    aplicarFiltros();
  }

  function wire() {
    ensureFiltrosUI();

    var selCat = document.getElementById("productos-filtro-categoria");
    var selUni = document.getElementById("productos-filtro-unidad");
    var selStock = document.getElementById("productos-filtro-stock");
    var lista = document.getElementById("lista-productos");

    if (selCat) {
      selCat.addEventListener("change", function () {
        _filtroCategoria = selCat.value || "";
        aplicarFiltros();
      });
    }
    if (selUni) {
      selUni.addEventListener("change", function () {
        _filtroUnidad = selUni.value || "";
        aplicarFiltros();
      });
    }
    if (selStock) {
      selStock.addEventListener("change", function () {
        _filtroStock = selStock.value || "";
        aplicarFiltros();
      });
    }

    if (lista) {
      var obs = new MutationObserver(function () {
        poblarSelects();
        aplicarFiltros();
      });
      obs.observe(lista, { childList: true });

      lista.addEventListener("click", function (e) {
        var btn = e.target.closest(".mov-ver-todas-btn");
        if (btn && btn.dataset.tipo === "productos") {
          limpiarFiltrosSelect();
        }
      });
    }

    poblarSelects();
    aplicarFiltros();
  }

  if (typeof safeInit === "function") {
    safeInit("catalogo-avanzado-t9", wire);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
