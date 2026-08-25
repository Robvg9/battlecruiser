// BattleCruiser — M27.2-FE.1
// Capa 1 POS: catálogo + categorías + búsqueda + carrito.
// NO implementa: confirmar, pago, vuelto, historial.
// NO toca: registrar_venta, ejecutarOperacion, offline, permisos, sesión, navegación.
// Fuente de verdad: ventaLineas + agregarLineaVenta + actualizarCantidadLinea + renderVentaLineas.
//
// Arquitectura (anti-regresión M27.1):
// - una inicialización
// - guards idempotentes
// - reutiliza #bc-venta-pos-layout / #bc-venta-cart-panel de M26.7
// - NO setInterval de layout
// - NO wrappers sobre funciones globales
(function () {
  "use strict";

  var STYLE_ID = "bc-m272-fe1-style";
  var LAYOUT_ID = "bc-venta-pos-layout";
  var CART_ID = "bc-venta-cart-panel";
  var FLAG = "bcM272fe1";

  function stockEstado() {
    try {
      if (typeof _stockCargaEstado === "string") return _stockCargaEstado;
    } catch (e) {}
    return "idle";
  }

  function stockCargando() {
    var st = stockEstado();
    return st === "idle" || st === "loading";
  }

  function productosLista() {
    try {
      if (typeof ventaProductosLista !== "undefined" && Array.isArray(ventaProductosLista) && ventaProductosLista.length) {
        return ventaProductosLista;
      }
    } catch (e) {}
    try {
      if (typeof _cache !== "undefined" && Array.isArray(_cache.productos)) return _cache.productos;
    } catch (e2) {}
    return [];
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = [
      "#tab-ventas.bc-pos{min-width:0;overflow-x:hidden}",
      "#tab-ventas.bc-pos .venta-vista-toggle{display:none!important}",
      "#tab-ventas.bc-pos:not(.bc-venta-sin-turno) #venta-modo-catalogo,",
      "#tab-ventas.bc-pos:not(.bc-venta-sin-turno) #venta-modo-catalogo.hidden{display:block!important}",
      "#tab-ventas.bc-pos #venta-producto{display:none!important}",
      "#tab-ventas.bc-pos #venta-producto-buscar{width:100%;max-width:100%;height:46px;font-size:16px;padding:10px 14px;border-radius:12px;box-sizing:border-box}",
      "#tab-ventas.bc-pos #form-venta-linea{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px;padding:0;background:transparent;border:0}",
      "#tab-ventas.bc-pos #form-venta-linea .venta-buscar-wrap{flex:1 1 100%;min-width:0}",
      "#tab-ventas.bc-pos #venta-cantidad{flex:1 1 88px;min-width:72px;max-width:120px;height:44px;font-size:16px}",
      "#tab-ventas.bc-pos #form-venta-linea button[type=submit]{flex:1 1 120px;min-height:44px}",

      "#tab-ventas.bc-pos .catalogo-categorias{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:2px 0 8px;margin:0 0 8px;scrollbar-width:thin}",
      "#tab-ventas.bc-pos .catalogo-chip{flex:0 0 auto;min-height:36px;padding:8px 14px;font-size:13px;border-radius:999px;white-space:nowrap}",

      "#tab-ventas.bc-pos .catalogo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px;margin:0;padding:0 0 8px;width:100%;box-sizing:border-box}",
      "#tab-ventas.bc-pos .catalogo-card{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-height:0;padding:10px;border-radius:12px;text-align:left;touch-action:manipulation;cursor:pointer;overflow:hidden}",
      "#tab-ventas.bc-pos .catalogo-card-nombre{font-size:13px;font-weight:600;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
      "#tab-ventas.bc-pos .catalogo-card-precio{font-size:15px;font-weight:700;color:var(--gold-bright,#e0c078)}",
      "#tab-ventas.bc-pos .catalogo-card-stock{font-size:11px;color:var(--mist,#b8c4bc)}",
      "#tab-ventas.bc-pos .catalogo-card-categoria{font-size:10px;opacity:.75}",
      "#tab-ventas.bc-pos .catalogo-card-img{width:100%;height:52px;object-fit:cover;border-radius:8px}",
      "#tab-ventas.bc-pos .catalogo-card-img-vacia{display:block;height:6px}",
      "#tab-ventas.bc-pos .catalogo-card-cta{margin-top:auto;font-size:12px;font-weight:600;padding:6px 8px;border-radius:8px;text-align:center;background:rgba(201,162,77,.16);color:var(--gold,#c9a24d);border:1px solid var(--gold-dim,#c9a24d55)}",

      "#" + LAYOUT_ID + "{display:flex;flex-direction:column;gap:12px;width:100%;min-width:0;min-height:0}",
      "#" + LAYOUT_ID + " .bc-venta-catalog-col{flex:1 1 auto;min-width:0}",
      "#" + CART_ID + "{flex:0 0 auto;display:flex;flex-direction:column;gap:8px;background:var(--stone,#142420);border:1px solid var(--gold-dim,#c9a24d55);border-radius:14px;padding:12px 14px;min-width:0;box-sizing:border-box}",
      "#" + CART_ID + " .bc-cart-title{font-family:Cormorant Garamond,serif;font-size:1.15rem;color:var(--gold,#c9a24d);margin:0 0 4px}",
      "#" + CART_ID + " #venta-lineas{max-height:min(42vh,320px);overflow-y:auto;overflow-x:hidden;margin:0;gap:6px;display:flex!important;flex-direction:column}",
      "#" + CART_ID + " #venta-lineas .lista-item{padding:10px 12px;border-radius:10px;align-items:center;gap:8px;flex-wrap:wrap}",
      "#" + CART_ID + " .venta-linea-btn{width:38px;height:38px;min-width:38px;font-size:18px;border-radius:10px}",
      "#" + CART_ID + " .venta-linea-cant-input{width:52px;height:38px;font-size:15px;text-align:center}",
      "#" + CART_ID + " .venta-linea-borrar{min-height:38px;padding:6px 12px;border-radius:10px}",
      "#" + CART_ID + " .venta-total{margin:0;padding:12px 14px;border-radius:12px}",
      "#" + CART_ID + " .venta-total-valor{font-size:1.55rem}",

      "#tab-ventas.bc-pos #bc-venta-carrito-bar{position:static!important;background:transparent!important;border:0!important;padding:0!important;margin:0!important}",
      "#bc-venta-carrito-bar:empty{display:none!important}",
      "#bc-m271-pos-layout,#bc-m271-pago-wrap,#bc-m271-historial-wrap{display:none!important}",

      "#tab-ventas.bc-venta-sin-turno #" + LAYOUT_ID + ",",
      "#tab-ventas.bc-venta-sin-turno #" + CART_ID + ",",
      "#tab-ventas.bc-venta-sin-turno #venta-operativa-bloque{display:none!important}",
      "#tab-ventas.bc-venta-sin-turno #venta-sin-turno{display:block!important}",

      "@media(min-width:900px){",
      "#" + LAYOUT_ID + "{flex-direction:row;align-items:flex-start;gap:16px}",
      "#" + LAYOUT_ID + " .bc-venta-catalog-col{flex:1 1 58%;min-width:0}",
      "#" + CART_ID + "{flex:0 0 340px;max-width:380px;position:sticky;top:8px;max-height:calc(100vh - 110px);overflow:hidden}",
      "#" + CART_ID + " #venta-lineas{flex:1 1 auto;max-height:none;min-height:96px}",
      "#" + CART_ID + " .bc-cart-footer{flex:0 0 auto;display:flex;flex-direction:column;gap:8px}",
      "}",
      "@media(max-width:899px){",
      "#" + LAYOUT_ID + " .bc-venta-catalog-col{order:1}",
      "#" + CART_ID + "{order:2;width:100%}",
      "}"
    ].join("");
    document.head.appendChild(s);
  }

  function layoutListo() {
    var layout = document.getElementById(LAYOUT_ID);
    var cart = document.getElementById(CART_ID);
    var lineas = document.getElementById("venta-lineas");
    var catCol = layout && layout.querySelector(".bc-venta-catalog-col");
    var modo = document.getElementById("venta-modo-catalogo");
    return !!(layout && cart && catCol && lineas && cart.contains(lineas) && modo && catCol.contains(modo));
  }

  function ensureLayout() {
    var tab = document.getElementById("tab-ventas");
    if (!tab) return;
    tab.classList.add("bc-pos");

    if (tab.classList.contains("bc-venta-sin-turno")) return;
    if (layoutListo()) return;

    var bloque = document.getElementById("venta-operativa-bloque");
    var host = bloque || tab;

    var layout = document.getElementById(LAYOUT_ID);
    if (!layout) {
      layout = document.createElement("div");
      layout.id = LAYOUT_ID;
      host.appendChild(layout);
    } else if (layout.parentNode !== host && bloque && host === bloque) {
      host.appendChild(layout);
    }

    var catCol = layout.querySelector(".bc-venta-catalog-col");
    if (!catCol) {
      catCol = document.createElement("div");
      catCol.className = "bc-venta-catalog-col";
      layout.insertBefore(catCol, layout.firstChild);
    }

    var cart = document.getElementById(CART_ID);
    if (!cart) {
      cart = document.createElement("aside");
      cart.id = CART_ID;
      cart.setAttribute("aria-label", "Carrito de venta");
      cart.innerHTML = '<div class="bc-cart-title">Carrito</div><div class="bc-cart-footer"></div>';
      layout.appendChild(cart);
    } else if (cart.parentNode !== layout) {
      layout.appendChild(cart);
    }

    var panelAlm = document.getElementById("venta-almacen-operativo");
    if (panelAlm && bloque && panelAlm.parentNode === bloque && layout.previousSibling !== panelAlm) {
      bloque.insertBefore(panelAlm, layout);
    }

    ["venta-vista-toggle", "venta-modo-buscador", "venta-modo-catalogo", "form-venta-linea", "msg-venta-linea", "venta-stock-disponible"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !catCol.contains(el)) catCol.appendChild(el);
    });

    var modo = document.getElementById("venta-modo-catalogo");
    if (modo) {
      modo.classList.remove("hidden");
      ["catalogo-categorias", "catalogo-grid"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && !modo.contains(el)) modo.appendChild(el);
      });
      if (!catCol.contains(modo)) catCol.appendChild(modo);
    }

    var footer = cart.querySelector(".bc-cart-footer");
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "bc-cart-footer";
      cart.appendChild(footer);
    }

    var lineas = document.getElementById("venta-lineas");
    var totalWrap = document.getElementById("venta-total-wrap");
    var btn = document.getElementById("btn-confirmar-venta");
    var msgVenta = document.getElementById("msg-venta");

    if (lineas && lineas.parentNode !== cart) {
      var title = cart.querySelector(".bc-cart-title");
      if (title && title.nextSibling) cart.insertBefore(lineas, title.nextSibling);
      else cart.insertBefore(lineas, footer);
    }
    if (totalWrap && footer && totalWrap.parentNode !== footer) footer.appendChild(totalWrap);
    if (btn && footer && btn.parentNode !== footer) footer.appendChild(btn);
    if (msgVenta && footer && msgVenta.parentNode !== footer) footer.appendChild(msgVenta);

    var oldBar = document.getElementById("bc-venta-carrito-bar");
    if (oldBar && oldBar !== cart) {
      while (oldBar.firstChild) oldBar.removeChild(oldBar.firstChild);
      oldBar.style.display = "none";
    }

    var m271 = document.getElementById("bc-m271-pos-layout");
    if (m271 && m271 !== layout) m271.style.display = "none";
  }

  function decorateCards() {
    var grid = document.getElementById("catalogo-grid");
    if (!grid) return;

    var lista = productosLista();
    var estado = grid.querySelector(".lista-estado");
    if (estado && (!lista || !lista.length)) {
      var txt = estado.textContent || "";
      if (/No hay productos activos/i.test(txt)) {
        estado.textContent = "Cargando productos...";
      }
    }

    var loading = stockCargando();
    grid.querySelectorAll(".catalogo-card").forEach(function (card) {
      var stockEl = card.querySelector(".catalogo-card-stock");
      if (stockEl && loading) {
        stockEl.textContent = "Cargando stock...";
      }
      if (!card.querySelector(".catalogo-card-cta")) {
        var cta = document.createElement("span");
        cta.className = "catalogo-card-cta";
        cta.textContent = "Agregar";
        card.appendChild(cta);
      }
    });
  }

  function wireSearchPlaceholder() {
    var input = document.getElementById("venta-producto-buscar");
    if (!input) return;
    input.placeholder = "🔎 Buscar producto…";
  }

  function watchGrid() {
    var grid = document.getElementById("catalogo-grid");
    if (!grid || grid.dataset[FLAG + "Grid"] === "1") return;
    grid.dataset[FLAG + "Grid"] = "1";
    var obs = new MutationObserver(function () {
      decorateCards();
    });
    obs.observe(grid, { childList: true });
    decorateCards();
  }

  function watchTab() {
    var tab = document.getElementById("tab-ventas");
    if (!tab || tab.dataset[FLAG + "Tab"] === "1") return;
    tab.dataset[FLAG + "Tab"] = "1";
    var obs = new MutationObserver(function () {
      if (!tab.classList.contains("visible")) return;
      ensureLayout();
      watchGrid();
      decorateCards();
    });
    obs.observe(tab, { attributes: true, attributeFilter: ["class"] });
  }

  function boot() {
    injectStyles();
    ensureLayout();
    wireSearchPlaceholder();
    watchGrid();
    watchTab();
    decorateCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(boot, 700);
    });
  } else {
    setTimeout(boot, 700);
  }

  try {
    window.__BC_M272_FE1__ = "27.2";
  } catch (e) {}
})();
