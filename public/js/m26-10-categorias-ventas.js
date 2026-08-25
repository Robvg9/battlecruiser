// BattleCruiser — M26.10-FE: categorías reales en filtro de Ventas
// Causa raíz: ventaCategoriasLista no se pobla de forma fiable al entrar a Ventas
// (ensureVentasDataReady de M26.9 carga productos/stock pero no categorías) y
// renderCatalogoCategorias queda solo con "Todos". Además cargarCategorias no
// filtraba activo=true ni el grid distinguía CARGANDO vs sin productos en categoría.
//
// Reutiliza: cargarCategorias, withCache, ventaCategoriasLista, catalogoCategoriaActiva,
// renderCatalogoCategorias, renderCatalogoGrid, refrescarVentas.
// NO toca Supabase/RLS/datos. NO asigna categoría a productos.
// NO reescribe ventas.js ni m26-9-data-truth.js.
(function () {
  "use strict";

  var FLAG = "__bcM2610";
  var STYLE_ID = "bc-m2610-cat-style";

  function sameId(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = [
      "#catalogo-categorias.catalogo-categorias{",
      "display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;",
      "-webkit-overflow-scrolling:touch;padding:2px 0 6px;margin-bottom:8px;",
      "scrollbar-width:thin}",
      "#catalogo-categorias .catalogo-chip{",
      "flex:0 0 auto;min-height:36px;padding:8px 14px;font-size:13px;",
      "border-radius:999px;border:1px solid var(--gold-dim,#c9a24d55);",
      "background:var(--void,#0c1c18);color:var(--mist,#b8c4bc);",
      "cursor:pointer;touch-action:manipulation;white-space:nowrap}",
      "#catalogo-categorias .catalogo-chip.activo{",
      "background:linear-gradient(180deg,var(--gold-bright,#e0c078),var(--gold,#c9a24d));",
      "color:#211605;border-color:transparent;font-weight:600}",
      "#catalogo-categorias .catalogo-chip:focus-visible{outline:2px solid var(--gold);outline-offset:2px}",
      "#catalogo-categorias .catalogo-cat-loading{",
      "font-size:12px;color:var(--mist,#b8c4bc);padding:6px 4px}"
    ].join("");
    document.head.appendChild(s);
  }

  /** Solo categorías activas (activo !== false). No inventa nombres. */
  function filtrarActivas(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.filter(function (c) {
      return c && c.id != null && c.nombre && c.activo !== false;
    });
  }

  /**
   * Carga categorías vía infraestructura existente (cargarCategorias → withCache).
   * Si la función base no filtra activo, filtramos en memoria.
   * Nunca escribe en productos ni en Supabase.
   */
  async function asegurarCategoriasVentas() {
    var lista = [];
    try {
      if (typeof cargarCategorias === "function") {
        lista = await Promise.resolve(cargarCategorias());
      }
    } catch (e) {
      console.warn("[BattleCruiser M26.10] cargarCategorias falló:", e);
      lista = [];
    }
    lista = filtrarActivas(lista || []);

    try {
      if (typeof ventaCategoriasLista !== "undefined") {
        ventaCategoriasLista = lista;
      } else {
        window.ventaCategoriasLista = lista;
      }
    } catch (e2) {
      window.ventaCategoriasLista = lista;
    }

    try {
      if (typeof catalogoCategoriaActiva === "undefined" || catalogoCategoriaActiva == null) {
        catalogoCategoriaActiva = "";
      }
    } catch (e3) {
      window.catalogoCategoriaActiva = "";
    }

    return lista;
  }

  function renderChipsConLoading(loading) {
    var cont = document.getElementById("catalogo-categorias");
    if (!cont) return;
    if (loading) {
      cont.innerHTML =
        '<span class="catalogo-cat-loading">Cargando categorías…</span>';
      return;
    }
    if (typeof renderCatalogoCategorias === "function") {
      try {
        renderCatalogoCategorias();
        return;
      } catch (e) {}
    }
    // Fallback mínimo si renderCatalogoCategorias no está
    var cats =
      typeof ventaCategoriasLista !== "undefined" && Array.isArray(ventaCategoriasLista)
        ? ventaCategoriasLista
        : [];
    var activa =
      typeof catalogoCategoriaActiva !== "undefined" && catalogoCategoriaActiva != null
        ? String(catalogoCategoriaActiva)
        : "";
    cont.innerHTML = "";
    [{ id: "", nombre: "Todos" }].concat(cats).forEach(function (c) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "catalogo-chip" + (String(c.id || "") === activa ? " activo" : "");
      btn.textContent = c.nombre;
      btn.dataset.categoriaId = c.id != null ? String(c.id) : "";
      cont.appendChild(btn);
    });
  }

  /** Comparación robusta producto.categoria_id ↔ categoría (UUID / string). */
  function productoEnCategoria(p, catId) {
    if (!catId) return true; // "Todos"
    if (!p) return false;
    if (p.categoria_id == null || p.categoria_id === "") return false;
    return sameId(p.categoria_id, catId);
  }

  function patchRenderCatalogoCategorias() {
    if (typeof renderCatalogoCategorias !== "function") return;
    if (renderCatalogoCategorias[FLAG]) return;
    var orig = renderCatalogoCategorias;
    window.renderCatalogoCategorias = function () {
      var cont = document.getElementById("catalogo-categorias");
      if (!cont) return orig.apply(this, arguments);

      var lista = [];
      try {
        if (typeof ventaCategoriasLista !== "undefined" && Array.isArray(ventaCategoriasLista)) {
          lista = filtrarActivas(ventaCategoriasLista);
          ventaCategoriasLista = lista;
        }
      } catch (e) {}

      var activa = "";
      try {
        if (typeof catalogoCategoriaActiva !== "undefined" && catalogoCategoriaActiva != null) {
          activa = String(catalogoCategoriaActiva);
        }
      } catch (e2) {}

      var chips = [{ id: "", nombre: "Todos" }].concat(lista);
      cont.innerHTML = "";
      chips.forEach(function (c) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "catalogo-chip" + (String(c.id || "") === activa ? " activo" : "");
        btn.textContent = c.nombre;
        btn.dataset.categoriaId = c.id != null ? String(c.id) : "";
        cont.appendChild(btn);
      });
    };
    window.renderCatalogoCategorias[FLAG] = true;
  }

  function patchRenderCatalogoGrid() {
    if (typeof renderCatalogoGrid !== "function") return;
    if (renderCatalogoGrid[FLAG]) return;
    var orig = renderCatalogoGrid;
    window.renderCatalogoGrid = function () {
      var grid = document.getElementById("catalogo-grid");
      var lista =
        typeof ventaProductosLista !== "undefined" && Array.isArray(ventaProductosLista)
          ? ventaProductosLista
          : typeof _cache !== "undefined" && _cache.productos
            ? _cache.productos
            : [];

      // Estado CARGANDO: no confundir con "sin productos en categoría"
      if (!lista || lista.length === 0) {
        return orig.apply(this, arguments);
      }

      var catActiva = "";
      try {
        if (typeof catalogoCategoriaActiva !== "undefined" && catalogoCategoriaActiva != null) {
          catActiva = String(catalogoCategoriaActiva);
        }
      } catch (e) {}

      // Si hay categoría concreta y ningún producto pertenece, mensaje limpio
      if (catActiva) {
        var enCat = lista.filter(function (p) {
          if (p.activo === false) return false;
          return productoEnCategoria(p, catActiva);
        });
        // Búsqueda por nombre (M26 ventas UX) se aplica después en DOM; aquí
        // solo evitamos el mensaje genérico engañoso.
        if (enCat.length === 0 && grid) {
          grid.innerHTML =
            '<p class="lista-estado">No hay productos en esta categoría.</p>';
          // Aún así dejar que el patch de búsqueda de m26-ventas-ux no rompa
          return;
        }
      }

      // Delegar al original; luego corregir mensaje vacío si el original usó el texto largo
      var r = orig.apply(this, arguments);
      if (grid && catActiva) {
        var p = grid.querySelector(".lista-estado");
        if (
          p &&
          /No hay productos activos para mostrar en esta categor/i.test(p.textContent || "")
        ) {
          p.textContent = "No hay productos en esta categoría.";
        }
      }
      return r;
    };
    window.renderCatalogoGrid[FLAG] = true;
  }

  function patchRefrescarVentas() {
    if (typeof refrescarVentas !== "function") return;
    if (refrescarVentas[FLAG]) return;
    var orig = refrescarVentas;
    window.refrescarVentas = async function () {
      var r = await orig.apply(this, arguments);
      try {
        var lista = filtrarActivas(
          typeof ventaCategoriasLista !== "undefined" ? ventaCategoriasLista : []
        );
        if (!lista.length) {
          lista = await asegurarCategoriasVentas();
        } else {
          try {
            ventaCategoriasLista = lista;
          } catch (e) {
            window.ventaCategoriasLista = lista;
          }
        }
        if (typeof renderCatalogoCategorias === "function") renderCatalogoCategorias();
        if (typeof renderCatalogoGrid === "function") renderCatalogoGrid();
      } catch (e2) {
        console.warn("[BattleCruiser M26.10] post-refrescarVentas:", e2);
      }
      return r;
    };
    window.refrescarVentas[FLAG] = true;
  }

  function patchCargarCategorias() {
    if (typeof cargarCategorias !== "function") return;
    if (cargarCategorias[FLAG]) return;
    var orig = cargarCategorias;
    window.cargarCategorias = async function () {
      var rows = await orig.apply(this, arguments);
      return filtrarActivas(rows || []);
    };
    window.cargarCategorias[FLAG] = true;
  }

  var _cargandoCats = false;
  async function onEnterVentas() {
    if (_cargandoCats) return;
    _cargandoCats = true;
    try {
      var needs =
        typeof ventaCategoriasLista === "undefined" ||
        !Array.isArray(ventaCategoriasLista) ||
        ventaCategoriasLista.length === 0;
      if (needs) {
        renderChipsConLoading(true);
      }
      await asegurarCategoriasVentas();
      if (typeof renderCatalogoCategorias === "function") {
        renderCatalogoCategorias();
      } else {
        renderChipsConLoading(false);
      }
      if (typeof renderCatalogoGrid === "function") {
        try {
          renderCatalogoGrid();
        } catch (e) {}
      }
    } finally {
      _cargandoCats = false;
    }
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
          onEnterVentas().catch(function () {});
        }, 40);
      },
      true
    );
  }

  function boot() {
    injectStyles();
    patchCargarCategorias();
    patchRenderCatalogoCategorias();
    patchRenderCatalogoGrid();
    patchRefrescarVentas();
    wireTabVentas();

    var tab = document.getElementById("tab-ventas");
    if (tab && tab.classList.contains("visible")) {
      onEnterVentas().catch(function () {});
    }
  }

  function start() {
    boot();
    var n = 0;
    var t = setInterval(function () {
      n++;
      boot();
      if (n >= 24) clearInterval(t);
    }, 280);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(start, 550);
    });
  } else {
    setTimeout(start, 550);
  }
})();
