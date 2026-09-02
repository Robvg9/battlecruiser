/**
 * M68 — Ventas POS Definitivo (v9.4.71)
 * Smart POS Sales Panel
 * - Topbar limpio: Contexto | Buscador | Cerrar sesión
 * - Sin bloque "Cantidad + Agregar" visible
 * - Sin Historial de ventas
 * - Solo scroll en grilla de productos
 * - Cards con nombre + precio, colores cálidos
 * - Carrito alineado, sin estirarse verticalmente
 * - Buscador filtra la grilla (no dropdown)
 */
(function m68VentasPosDefinitivo() {
  'use strict';
  const VER = '9.4.71';
  if (window.__BC_M68_LOADED__) return;
  window.__BC_M68_LOADED__ = VER;

  const TOP_ID = 'bc-venta-topbar';
  const SCROLL_ID = 'bc-venta-productos-scroll';
  const LAYOUT_ID = 'bc-venta-pos-layout';
  const CART_ID = 'bc-venta-cart-panel';
  const STYLE_ID = 'm68-ventas-pos-css';

  const CSS = `
/* ========== M68 v9.4.71 AUTHORITATIVE ========== */
#tab-ventas.bc-pos.visible {
  height: calc(100dvh - 92px) !important;
  max-height: calc(100dvh - 92px) !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  background: #0a1210 !important;
  color: #e8ece6 !important;
}
#tab-ventas.bc-pos #venta-operativa-bloque {
  display: flex !important;
  flex: 1 1 auto !important;
  flex-direction: column !important;
  min-height: 0 !important;
  overflow: hidden !important;
  gap: 8px !important;
  padding: 0 !important;
  margin: 0 !important;
  height: 100% !important;
}

/* ---- TOPBAR: Contexto | Buscador | Cerrar ---- */
#${TOP_ID} {
  flex: 0 0 auto !important;
  display: grid !important;
  grid-template-columns: minmax(150px, 200px) minmax(200px, 1fr) auto !important;
  grid-template-areas: "ctx search close" !important;
  align-items: center !important;
  gap: 10px !important;
  min-height: 48px !important;
  height: 48px !important;
  padding: 6px 10px !important;
  margin: 0 !important;
  border: 1px solid rgba(180,160,100,0.18) !important;
  border-radius: 12px !important;
  background: rgba(12,22,18,0.96) !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}
#${TOP_ID} .bc-m64-context,
#${TOP_ID} #bc-m64-context {
  grid-area: ctx !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  min-width: 0 !important;
  padding: 2px 6px !important;
  overflow: hidden !important;
}
#${TOP_ID} .venta-almacen-label {
  font-size: 9px !important;
  font-weight: 600 !important;
  color: #8a9a88 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  margin: 0 !important;
  white-space: nowrap !important;
}
#${TOP_ID} .venta-almacen-nombre {
  font-size: 14px !important;
  font-weight: 700 !important;
  color: #d4c48a !important;
  margin: 0 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
#${TOP_ID} .venta-almacen-hint { display: none !important; }

/* Buscador en el medio del topbar */
#${TOP_ID} #form-venta-linea {
  grid-area: search !important;
  display: flex !important;
  align-items: center !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  min-width: 0 !important;
  width: 100% !important;
}
#${TOP_ID} .venta-buscar-wrap {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  position: relative !important;
  width: 100% !important;
}
#${TOP_ID} #venta-producto-buscar {
  display: block !important;
  width: 100% !important;
  height: 36px !important;
  box-sizing: border-box !important;
  padding: 0 12px !important;
  font-size: 13px !important;
  color: #e8ece6 !important;
  background: #15221c !important;
  border: 1px solid rgba(180,160,100,0.28) !important;
  border-radius: 9px !important;
  outline: none !important;
}
#${TOP_ID} #venta-producto-buscar:focus {
  border-color: rgba(201,162,77,0.7) !important;
  box-shadow: 0 0 0 2px rgba(201,162,77,0.15) !important;
}
#${TOP_ID} #venta-producto-buscar::placeholder { color: #6b7a68 !important; }

/* Ocultar completamente cantidad, presentacion, submit del form */
#${TOP_ID} #venta-cantidad,
#${TOP_ID} #venta-presentacion,
#${TOP_ID} #form-venta-linea button[type=submit],
#${TOP_ID} #form-venta-linea .venta-cantidad-wrap,
#${TOP_ID} #venta-producto-resultados {
  display: none !important;
}

/* Cerrar sesión */
#${TOP_ID} #bc-m273-cerrar-sesion-btn {
  grid-area: close !important;
  height: 36px !important;
  min-height: 36px !important;
  min-width: 118px !important;
  max-width: 140px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  border-radius: 9px !important;
  background: #b91c1c !important;
  color: #fff !important;
  border: none !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
}

/* Ocultar basura del topbar */
#${TOP_ID} #bc-m64-add-title,
#${TOP_ID} .bc-m64-title,
#${TOP_ID} #venta-stock-disponible,
#${TOP_ID} #bc-m275-policy,
#${TOP_ID} #catalogo-categorias {
  display: none !important;
}

/* ---- LAYOUT: productos | carrito (misma altura) ---- */
#${LAYOUT_ID} {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px) !important;
  gap: 10px !important;
  align-items: stretch !important;
  height: 100% !important;
}
@media (min-width: 1400px) {
  #${LAYOUT_ID} { grid-template-columns: minmax(0, 1fr) minmax(340px, 400px) !important; }
}
@media (max-width: 1000px) {
  #${LAYOUT_ID} {
    grid-template-columns: 1fr !important;
    grid-template-rows: minmax(0, 1fr) minmax(220px, 32dvh) !important;
  }
}

/* Columna catálogo */
#${LAYOUT_ID} .bc-venta-catalog-col {
  min-width: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  background: #0f1a16 !important;
  border: 1px solid rgba(180,160,100,0.14) !important;
  border-radius: 12px !important;
  padding: 10px !important;
  box-sizing: border-box !important;
}

/* Policy / stock / checkbox — compacto arriba de categorías */
#${LAYOUT_ID} .bc-venta-catalog-col #bc-m275-policy,
#${LAYOUT_ID} .bc-venta-catalog-col #venta-stock-disponible {
  display: none !important;
}

/* Categorías */
#${LAYOUT_ID} .bc-venta-catalog-col #catalogo-categorias {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
  margin: 0 0 8px 0 !important;
  padding: 0 !important;
  flex: 0 0 auto !important;
}
#catalogo-categorias .catalogo-chip {
  flex: 0 0 auto !important;
  height: 28px !important;
  min-height: 28px !important;
  padding: 0 11px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  border-radius: 999px !important;
  background: #1a2820 !important;
  color: #b8c4b0 !important;
  border: 1px solid rgba(180,160,100,0.2) !important;
  white-space: nowrap !important;
  cursor: pointer !important;
}
#catalogo-categorias .catalogo-chip.activo {
  background: rgba(201,162,77,0.22) !important;
  color: #e8d48a !important;
  border-color: rgba(201,162,77,0.55) !important;
}

/* Scroll SOLO en productos */
#${SCROLL_ID} {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 2px 2px 8px !important;
  scrollbar-width: thin !important;
  scrollbar-color: rgba(180,160,100,0.35) transparent !important;
}
#${SCROLL_ID} #catalogo-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)) !important;
  gap: 9px !important;
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

/* Product cards — cálidos, con NOMBRE */
#${SCROLL_ID} .catalogo-card {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 4px !important;
  min-height: 128px !important;
  padding: 10px 8px !important;
  border: 1px solid rgba(180,160,100,0.16) !important;
  border-radius: 11px !important;
  background: #15221c !important;
  color: #e8ece6 !important;
  cursor: pointer !important;
  box-sizing: border-box !important;
  transition: border-color 0.12s ease, transform 0.12s ease !important;
}
#${SCROLL_ID} .catalogo-card:hover {
  border-color: rgba(201,162,77,0.5) !important;
  transform: translateY(-1px) !important;
  background: #1a2a22 !important;
}
#${SCROLL_ID} .catalogo-card-img,
#${SCROLL_ID} .catalogo-card-img-vacia {
  width: 56px !important;
  height: 48px !important;
  object-fit: contain !important;
  border-radius: 7px !important;
  background: rgba(255,255,255,0.03) !important;
  flex-shrink: 0 !important;
}
#${SCROLL_ID} .catalogo-card-nombre {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  font-size: 12px !important;
  font-weight: 650 !important;
  line-height: 1.25 !important;
  text-align: center !important;
  color: #e0e6dc !important;
  margin: 2px 0 0 !important;
  width: 100% !important;
}
#${SCROLL_ID} .catalogo-card-precio {
  font-size: 15px !important;
  font-weight: 800 !important;
  color: #e8d48a !important;
  margin-top: auto !important;
}
#${SCROLL_ID} .catalogo-card-stock {
  font-size: 10px !important;
  color: #7a8a78 !important;
}
#${SCROLL_ID} .catalogo-card-categoria,
#${SCROLL_ID} .catalogo-card [class*="minorista"],
#${SCROLL_ID} .catalogo-card [class*="mayorista"] {
  display: none !important;
}
/* Ocultar texto "Precio minorista" si viene como texto suelto */
#${SCROLL_ID} .catalogo-card span:not(.catalogo-card-nombre):not(.catalogo-card-precio):not(.catalogo-card-stock):not(.catalogo-card-img) {
  font-size: 0 !important;
  line-height: 0 !important;
  overflow: hidden !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}

/* ---- CARRITO (misma altura, no se estira de más) ---- */
#${CART_ID} {
  min-width: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 12px !important;
  border: 1px solid rgba(180,160,100,0.16) !important;
  border-radius: 12px !important;
  background: #0f1a16 !important;
  box-sizing: border-box !important;
}
#${CART_ID} .bc-cart-title,
#${CART_ID} h3 {
  flex: 0 0 auto !important;
  margin: 0 0 8px 0 !important;
  padding: 0 0 8px 0 !important;
  border-bottom: 1px solid rgba(180,160,100,0.12) !important;
  font-size: 16px !important;
  font-weight: 750 !important;
  color: #e8ece6 !important;
}
#${CART_ID} #venta-lineas {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  margin: 0 !important;
  padding: 2px 0 6px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 5px !important;
  scrollbar-width: thin !important;
}
#${CART_ID} #venta-lineas .lista-item,
#${CART_ID} #venta-lineas .lista-estado {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  gap: 6px !important;
  align-items: center !important;
  padding: 8px !important;
  border: 1px solid rgba(180,160,100,0.1) !important;
  border-radius: 9px !important;
  background: #15221c !important;
  box-sizing: border-box !important;
}
#${CART_ID} .venta-linea-info {
  min-width: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 1px !important;
  overflow: hidden !important;
}
#${CART_ID} .venta-linea-info > span:first-child {
  font-size: 12px !important;
  font-weight: 650 !important;
  color: #e0e6dc !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
#${CART_ID} .venta-linea-info .muted {
  font-size: 10px !important;
  color: #7a8a78 !important;
}
#${CART_ID} .venta-linea-precios {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  flex-shrink: 0 !important;
}
#${CART_ID} .venta-linea-cant-wrap {
  display: inline-flex !important;
  align-items: center !important;
  gap: 0 !important;
  background: #1a2820 !important;
  border-radius: 7px !important;
  border: 1px solid rgba(180,160,100,0.25) !important;
  overflow: hidden !important;
}
#${CART_ID} .venta-linea-btn {
  width: 26px !important;
  height: 26px !important;
  min-width: 26px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  color: #e8ece6 !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer !important;
}
#${CART_ID} .venta-linea-cant-input {
  width: 32px !important;
  min-width: 32px !important;
  height: 26px !important;
  box-sizing: border-box !important;
  text-align: center !important;
  font-size: 12px !important;
  font-weight: 800 !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  background: #0f1a16 !important;
  border: none !important;
  border-left: 1px solid rgba(180,160,100,0.2) !important;
  border-right: 1px solid rgba(180,160,100,0.2) !important;
  border-radius: 0 !important;
  opacity: 1 !important;
  visibility: visible !important;
  padding: 0 !important;
  margin: 0 !important;
}
#${CART_ID} .venta-linea-precios > .muted {
  min-width: 54px !important;
  text-align: right !important;
  font-size: 12px !important;
  font-weight: 650 !important;
  color: #d4c48a !important;
  white-space: nowrap !important;
}
#${CART_ID} .venta-linea-borrar {
  width: 26px !important;
  min-width: 26px !important;
  height: 26px !important;
  padding: 0 !important;
  border-radius: 7px !important;
  font-size: 0 !important;
  background: #3a1818 !important;
  color: #f0a0a0 !important;
  border: 1px solid rgba(200,80,80,0.3) !important;
  cursor: pointer !important;
}
#${CART_ID} .venta-linea-borrar::before {
  content: "×" !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
}

#${CART_ID} #venta-total-wrap,
#${CART_ID} .bc-cart-footer {
  flex: 0 0 auto !important;
  margin-top: auto !important;
  padding-top: 8px !important;
}
#${CART_ID} #venta-total-wrap {
  margin: 0 0 8px 0 !important;
  padding: 10px 12px !important;
  border: 1px solid rgba(180,160,100,0.16) !important;
  border-radius: 9px !important;
  background: #15221c !important;
  box-sizing: border-box !important;
}
#${CART_ID} #venta-total-wrap .venta-total-valor,
#${CART_ID} #venta-total {
  font-size: 24px !important;
  font-weight: 800 !important;
  color: #e8d48a !important;
}
#${CART_ID} #btn-confirmar-venta {
  width: 100% !important;
  height: 44px !important;
  min-height: 44px !important;
  border-radius: 9px !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  background: linear-gradient(180deg, #1a6fd4, #0d5bb8) !important;
  color: #fff !important;
  border: none !important;
  cursor: pointer !important;
}

/* ---- ELIMINAR HISTORIAL COMPLETAMENTE ---- */
#tab-ventas.bc-pos h3,
#tab-ventas.bc-pos .ventas-historial-controles,
#tab-ventas.bc-pos #lista-ventas,
#tab-ventas.bc-pos [id*="historial"],
#tab-ventas.bc-pos .historial-ventas,
#tab-ventas.bc-pos input[placeholder*="referencia"],
#tab-ventas.bc-pos input[placeholder*="Referencia"] {
  display: none !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  visibility: hidden !important;
}

/* Ocultar el bloque feo de abajo (form original si quedó fuera) */
#tab-ventas.bc-pos #venta-modo-buscador,
#tab-ventas.bc-pos .venta-modo-buscador,
#tab-ventas.bc-pos #form-venta-linea:not(#${TOP_ID} #form-venta-linea) {
  display: none !important;
}

/* Stock label si aparece suelto */
#tab-ventas.bc-pos #venta-stock-disponible {
  display: none !important;
}

/* Policy checkbox — ocultar del área principal */
#tab-ventas.bc-pos #bc-m275-policy {
  display: none !important;
}

/* Sin scroll de página */
#tab-ventas.bc-pos,
#tab-ventas.bc-pos * {
  overscroll-behavior: contain !important;
}
`;

  function injectCSS() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = CSS;
  }

  function hideHistoryHard(tab) {
    if (!tab) return;
    tab.querySelectorAll('h3').forEach(function (h) {
      var t = (h.textContent || '').trim().toLowerCase();
      if (t.indexOf('historial') !== -1) {
        h.style.display = 'none';
        h.hidden = true;
        var n = h.nextElementSibling;
        while (n) {
          if (n.id === 'lista-ventas' || (n.className && String(n.className).indexOf('historial') !== -1) || n.tagName === 'INPUT') {
            n.style.display = 'none';
            n.hidden = true;
          }
          n = n.nextElementSibling;
        }
      }
    });
    var list = document.getElementById('lista-ventas');
    if (list) { list.style.display = 'none'; list.hidden = true; }
    tab.querySelectorAll('input[placeholder*="referencia"], input[placeholder*="Referencia"], input[placeholder*="almacén"]').forEach(function (inp) {
      var parent = inp.closest('div, section, form');
      if (parent) { parent.style.display = 'none'; parent.hidden = true; }
      inp.style.display = 'none';
    });
  }

  function ensureStructure() {
    var tab = document.getElementById('tab-ventas');
    var bloque = document.getElementById('venta-operativa-bloque');
    if (!tab || !bloque) return false;

    tab.classList.add('bc-pos');

    // Topbar
    var top = document.getElementById(TOP_ID);
    if (!top) {
      top = document.createElement('div');
      top.id = TOP_ID;
      top.setAttribute('role', 'region');
      top.setAttribute('aria-label', 'Controles de venta');
      bloque.insertBefore(top, bloque.firstChild);
    }

    // Contexto
    var ctx = document.getElementById('venta-almacen-operativo');
    if (ctx) {
      var ctxWrap = document.getElementById('bc-m64-context');
      if (!ctxWrap) {
        ctxWrap = document.createElement('div');
        ctxWrap.id = 'bc-m64-context';
        ctxWrap.className = 'bc-m64-context';
      }
      if (ctx.parentNode !== ctxWrap) ctxWrap.appendChild(ctx);
      if (ctxWrap.parentNode !== top) top.insertBefore(ctxWrap, top.firstChild);
      ctx.style.cssText = 'margin:0;padding:0;border:0;background:transparent;';
    }

    // Form → solo el buscador vive en el topbar
    var form = document.getElementById('form-venta-linea');
    if (form && form.parentNode !== top) top.appendChild(form);

    // Cerrar sesión
    var closeBtn = document.getElementById('bc-m273-cerrar-sesion-btn');
    if (closeBtn && closeBtn.parentNode !== top) top.appendChild(closeBtn);

    // Layout
    var layout = document.getElementById(LAYOUT_ID);
    if (!layout) {
      layout = document.createElement('div');
      layout.id = LAYOUT_ID;
      bloque.appendChild(layout);
    }

    // Columna catálogo
    var catCol = layout.querySelector('.bc-venta-catalog-col');
    if (!catCol) {
      catCol = document.createElement('div');
      catCol.className = 'bc-venta-catalog-col';
      layout.insertBefore(catCol, layout.firstChild);
    }

    // Categorías dentro de catálogo
    var cats = document.getElementById('catalogo-categorias');
    if (cats && cats.parentNode !== catCol) {
      catCol.insertBefore(cats, catCol.firstChild);
    }

    // Scroll productos
    var scroll = document.getElementById(SCROLL_ID);
    if (!scroll) {
      scroll = document.createElement('div');
      scroll.id = SCROLL_ID;
      scroll.setAttribute('aria-label', 'Productos disponibles');
    }
    if (scroll.parentNode !== catCol) catCol.appendChild(scroll);

    var grid = document.getElementById('catalogo-grid');
    if (grid && grid.parentNode !== scroll) scroll.appendChild(grid);

    // Carrito
    var cart = document.getElementById(CART_ID);
    if (!cart) {
      var lineas = document.getElementById('venta-lineas');
      if (lineas) {
        cart = lineas.closest('[class*="cart"], [class*="carrito"], .panel, .card') || lineas.parentElement;
        if (cart && !cart.id) cart.id = CART_ID;
      }
      if (!cart) {
        cart = document.createElement('div');
        cart.id = CART_ID;
      }
    }
    if (cart.parentNode !== layout) layout.appendChild(cart);

    var title = cart.querySelector('.bc-cart-title');
    if (!title) {
      title = document.createElement('div');
      title.className = 'bc-cart-title';
      title.textContent = 'Carrito';
      cart.insertBefore(title, cart.firstChild);
    }

    var lineasEl = document.getElementById('venta-lineas');
    if (lineasEl && lineasEl.parentNode !== cart) cart.appendChild(lineasEl);

    var totalWrap = document.getElementById('venta-total-wrap');
    if (totalWrap && totalWrap.parentNode !== cart) cart.appendChild(totalWrap);
    else {
      var totalEl = document.getElementById('venta-total');
      if (totalEl && totalEl.parentNode !== cart) {
        var wrap = totalEl.parentElement;
        if (wrap && wrap.parentNode !== cart) cart.appendChild(wrap);
      }
    }
    var btnConf = document.getElementById('btn-confirmar-venta');
    if (btnConf && btnConf.parentNode !== cart) cart.appendChild(btnConf);

    hideHistoryHard(tab);
    return true;
  }

  // Filtrar grilla por texto del buscador (en vez de dropdown)
  function wireSearchFilter() {
    var input = document.getElementById('venta-producto-buscar');
    var grid = document.getElementById('catalogo-grid');
    if (!input || !grid || input.dataset.m68Filter) return;
    input.dataset.m68Filter = '1';

    // Ocultar resultados dropdown
    var res = document.getElementById('venta-producto-resultados');
    if (res) res.style.display = 'none';

    input.addEventListener('input', function () {
      var term = (input.value || '').trim().toLowerCase();
      grid.querySelectorAll('.catalogo-card').forEach(function (card) {
        var nameEl = card.querySelector('.catalogo-card-nombre');
        var name = nameEl ? (nameEl.textContent || '').toLowerCase() : (card.textContent || '').toLowerCase();
        var match = !term || name.indexOf(term) !== -1;
        card.style.display = match ? '' : 'none';
      });
    });
  }

  function forceQtyVisible() {
    var root = document.getElementById('tab-ventas') || document.body;
    root.querySelectorAll('.venta-linea-cant-input').forEach(function (inp) {
      inp.style.setProperty('color', '#ffffff', 'important');
      inp.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important');
      inp.style.setProperty('opacity', '1', 'important');
      inp.style.setProperty('visibility', 'visible', 'important');
      inp.style.setProperty('background', '#0f1a16', 'important');
      inp.style.setProperty('font-weight', '800', 'important');
    });
  }

  // Asegurar que las cards muestren nombre (por si el HTML no lo tiene visible)
  function ensureCardNames() {
    var grid = document.getElementById('catalogo-grid');
    if (!grid) return;
    grid.querySelectorAll('.catalogo-card').forEach(function (card) {
      var name = card.querySelector('.catalogo-card-nombre');
      if (!name) {
        // intentar recuperar del dataset o texto
        var raw = card.getAttribute('data-nombre') || card.getAttribute('title') || '';
        if (raw) {
          name = document.createElement('span');
          name.className = 'catalogo-card-nombre';
          name.textContent = raw;
          card.appendChild(name);
        }
      }
    });
  }

  function boot() {
    injectCSS();
    var ok = ensureStructure();
    forceQtyVisible();
    wireSearchFilter();
    ensureCardNames();

    document.querySelectorAll('.footnote, .app-footer-version').forEach(function (el) {
      if (el.textContent && el.textContent.indexOf('BattleCruiser') !== -1) {
        el.textContent = 'v' + VER + ' — BattleCruiser';
      }
    });
    return ok;
  }

  var tries = 0;
  function start() {
    boot();
    tries++;
    if (tries < 30 && (!document.getElementById(TOP_ID) || !document.getElementById('catalogo-grid'))) {
      setTimeout(start, 280);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 180); });
  } else {
    setTimeout(start, 180);
  }

  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest('#tab-ventas')) {
      setTimeout(forceQtyVisible, 50);
      setTimeout(ensureCardNames, 80);
      setTimeout(hideHistoryHard.bind(null, document.getElementById('tab-ventas')), 100);
    }
  }, { passive: true });

  console.info('[M68] Ventas POS Definitivo', VER);
})();
