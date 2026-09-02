/**
 * M68 — Ventas POS Definitivo (v9.4.70)
 * Smart POS Sales Panel — capa única y autoritativa
 * Hace la reorganización estructural + CSS final.
 * - Header compacto, botones sin overflow de texto
 * - Buscador usable y grande
 * - Cantidad del carrito siempre visible
 * - Carrito aprovecha el espacio derecho
 * - Sin franja verde / sin historial en el área de trabajo
 * - Solo scroll en productos
 * - Sin MutationObserver continuo
 */
(function m68VentasPosDefinitivo() {
  'use strict';
  const VER = '9.4.70';
  if (window.__BC_M68_LOADED__) return;
  window.__BC_M68_LOADED__ = VER;

  const TOP_ID = 'bc-venta-topbar';
  const SCROLL_ID = 'bc-venta-productos-scroll';
  const LAYOUT_ID = 'bc-venta-pos-layout';
  const CART_ID = 'bc-venta-cart-panel';
  const STYLE_ID = 'm68-ventas-pos-css';

  const CSS = `
/* ========== M68 AUTHORITATIVE LAYER v9.4.70 ========== */
#tab-ventas.bc-pos.visible {
  height: calc(100dvh - 96px) !important;
  max-height: calc(100dvh - 96px) !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  background: #07101d !important;
  color: #eef3fb !important;
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
}

/* ---- TOPBAR (una sola fila limpia) ---- */
#${TOP_ID} {
  flex: 0 0 auto !important;
  display: grid !important;
  grid-template-columns: minmax(160px, 210px) minmax(220px, 1fr) 58px auto auto !important;
  grid-template-areas: "ctx search qty add close" !important;
  align-items: center !important;
  gap: 8px !important;
  min-height: 52px !important;
  height: auto !important;
  padding: 8px 10px !important;
  margin: 0 !important;
  border: 1px solid rgba(109,154,214,0.18) !important;
  border-radius: 14px !important;
  background: rgba(8,18,31,0.97) !important;
  box-shadow: 0 8px 22px rgba(0,0,0,0.22) !important;
  box-sizing: border-box !important;
  overflow: visible !important;
}
#${TOP_ID} .bc-m64-context,
#${TOP_ID} #bc-m64-context {
  grid-area: ctx !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  min-width: 0 !important;
  padding: 4px 8px !important;
  border-right: 1px solid rgba(109,154,214,0.12) !important;
  overflow: hidden !important;
}
#${TOP_ID} .venta-almacen-label,
#${TOP_ID} .bc-m64-context .venta-almacen-label {
  font-size: 10px !important;
  font-weight: 600 !important;
  color: #7f91a8 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.04em !important;
  margin: 0 !important;
  white-space: nowrap !important;
}
#${TOP_ID} .venta-almacen-nombre,
#${TOP_ID} .bc-m64-context .venta-almacen-nombre {
  font-size: 15px !important;
  font-weight: 700 !important;
  color: #edf4ff !important;
  margin: 0 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
#${TOP_ID} .venta-almacen-hint { display: none !important; }

#${TOP_ID} #form-venta-linea {
  grid-area: search !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
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
}
#${TOP_ID} #venta-producto-buscar {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  height: 40px !important;
  box-sizing: border-box !important;
  padding: 0 12px !important;
  font-size: 14px !important;
  color: #f1f5f9 !important;
  background: #0d1b2c !important;
  border: 1px solid rgba(91,132,182,0.35) !important;
  border-radius: 10px !important;
  outline: none !important;
}
#${TOP_ID} #venta-producto-buscar:focus {
  border-color: rgba(37,128,255,0.75) !important;
  box-shadow: 0 0 0 3px rgba(37,128,255,0.15) !important;
}
#${TOP_ID} #venta-producto-buscar::placeholder { color: #64778f !important; }

#${TOP_ID} #venta-cantidad {
  grid-area: qty !important;
  width: 58px !important;
  min-width: 58px !important;
  height: 40px !important;
  box-sizing: border-box !important;
  text-align: center !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  color: #f1f5f9 !important;
  background: #0d1b2c !important;
  border: 1px solid rgba(91,132,182,0.35) !important;
  border-radius: 10px !important;
  padding: 0 !important;
}

#${TOP_ID} #form-venta-linea button[type=submit],
#${TOP_ID} button[type=submit] {
  grid-area: add !important;
  height: 40px !important;
  min-height: 40px !important;
  min-width: 120px !important;
  max-width: 160px !important;
  padding: 0 14px !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  border-radius: 10px !important;
  background: linear-gradient(180deg, #1979f8, #0c62e4) !important;
  color: #fff !important;
  border: none !important;
  cursor: pointer !important;
  flex-shrink: 0 !important;
}

#${TOP_ID} #bc-m273-cerrar-sesion-btn,
#${TOP_ID} button[id*="cerrar"] {
  grid-area: close !important;
  height: 40px !important;
  min-height: 40px !important;
  min-width: 110px !important;
  max-width: 140px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  border-radius: 10px !important;
  background: #dc2626 !important;
  color: #fff !important;
  border: none !important;
  cursor: pointer !important;
  flex-shrink: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* Ocultar elementos que ya no van en el topbar o que sobran */
#${TOP_ID} #bc-m64-add-title,
#${TOP_ID} .bc-m64-title,
#${TOP_ID} #venta-stock-disponible,
#${TOP_ID} #bc-m275-policy,
#${TOP_ID} #catalogo-categorias,
#${TOP_ID} #venta-presentacion {
  display: none !important;
}

/* ---- LAYOUT PRODUCTOS + CARRITO ---- */
#${LAYOUT_ID} {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px) !important;
  gap: 10px !important;
  align-items: stretch !important;
}
@media (min-width: 1400px) {
  #${LAYOUT_ID} { grid-template-columns: minmax(0, 1fr) minmax(360px, 420px) !important; }
}
@media (max-width: 1100px) {
  #${LAYOUT_ID} { grid-template-columns: 1fr !important; grid-template-rows: minmax(0, 1fr) auto !important; }
}

#${LAYOUT_ID} .bc-venta-catalog-col {
  min-width: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  background: linear-gradient(180deg, #0c1828, #08111e) !important;
  border: 1px solid rgba(109,154,214,0.16) !important;
  border-radius: 14px !important;
  padding: 10px !important;
  box-sizing: border-box !important;
}

/* Categorías dentro del área de productos */
#${LAYOUT_ID} .bc-venta-catalog-col #catalogo-categorias,
#bc-m66-head #catalogo-categorias {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
  margin: 0 0 8px 0 !important;
  padding: 0 !important;
  overflow-x: auto !important;
  scrollbar-width: none !important;
}
#${LAYOUT_ID} .bc-venta-catalog-col #catalogo-categorias::-webkit-scrollbar { display: none !important; }
#catalogo-categorias .catalogo-chip {
  flex: 0 0 auto !important;
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  border-radius: 999px !important;
  background: #0d1b2c !important;
  color: #a9b9cc !important;
  border: 1px solid rgba(109,154,214,0.16) !important;
  white-space: nowrap !important;
}
#catalogo-categorias .catalogo-chip.activo {
  background: rgba(59,130,246,0.25) !important;
  color: #93c5fd !important;
  border-color: rgba(59,130,246,0.5) !important;
}

#${SCROLL_ID} {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 2px 2px 10px !important;
  scrollbar-width: thin !important;
  scrollbar-color: rgba(97,129,168,0.5) transparent !important;
}
#${SCROLL_ID} #catalogo-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;
  gap: 10px !important;
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  box-sizing: border-box !important;
}
#${SCROLL_ID} .catalogo-card {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: space-between !important;
  min-height: 130px !important;
  padding: 10px !important;
  border: 1px solid rgba(109,154,214,0.15) !important;
  border-radius: 12px !important;
  background: linear-gradient(180deg, #101f33, #0b1829) !important;
  color: #edf3fb !important;
  cursor: pointer !important;
  box-sizing: border-box !important;
  transition: border-color 0.12s ease, transform 0.12s ease !important;
}
#${SCROLL_ID} .catalogo-card:hover {
  border-color: rgba(45,129,255,0.45) !important;
  transform: translateY(-1px) !important;
}
#${SCROLL_ID} .catalogo-card-img,
#${SCROLL_ID} .catalogo-card-img-vacia {
  width: 64px !important;
  height: 56px !important;
  object-fit: contain !important;
  border-radius: 8px !important;
  background: rgba(255,255,255,0.03) !important;
}
#${SCROLL_ID} .catalogo-card-nombre {
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.25 !important;
  text-align: center !important;
  color: #edf3fb !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  margin: 4px 0 !important;
}
#${SCROLL_ID} .catalogo-card-precio {
  font-size: 15px !important;
  font-weight: 800 !important;
  color: #f2f7ff !important;
}
#${SCROLL_ID} .catalogo-card-stock {
  font-size: 10px !important;
  color: #7e93ab !important;
}
#${SCROLL_ID} .catalogo-card-categoria { display: none !important; }

/* ---- CARRITO ---- */
#${CART_ID} {
  min-width: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  max-height: none !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 12px !important;
  border: 1px solid rgba(109,154,214,0.18) !important;
  border-radius: 14px !important;
  background: linear-gradient(180deg, #111e30, #091321) !important;
  box-sizing: border-box !important;
}
#${CART_ID} .bc-cart-title,
#${CART_ID} h3 {
  flex: 0 0 auto !important;
  margin: 0 0 8px 0 !important;
  padding: 0 0 8px 0 !important;
  border-bottom: 1px solid rgba(109,154,214,0.12) !important;
  font-size: 17px !important;
  font-weight: 800 !important;
  color: #f2f6fc !important;
}
#${CART_ID} #venta-lineas {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  margin: 0 !important;
  padding: 4px 0 8px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  scrollbar-width: thin !important;
}
#${CART_ID} #venta-lineas .lista-item {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  gap: 6px !important;
  align-items: center !important;
  padding: 8px !important;
  border: 1px solid rgba(109,154,214,0.1) !important;
  border-radius: 10px !important;
  background: rgba(11,24,40,0.86) !important;
  box-sizing: border-box !important;
}
#${CART_ID} .venta-linea-info {
  min-width: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  overflow: hidden !important;
}
#${CART_ID} .venta-linea-info > span:first-child {
  font-size: 12px !important;
  font-weight: 700 !important;
  color: #f1f5fb !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
#${CART_ID} .venta-linea-info .muted {
  font-size: 10px !important;
  color: #8194aa !important;
}
#${CART_ID} .venta-linea-precios {
  display: flex !important;
  align-items: center !important;
  gap: 5px !important;
  flex-shrink: 0 !important;
}

/* Cantidad SIEMPRE visible */
#${CART_ID} .venta-linea-cant-wrap {
  display: inline-flex !important;
  align-items: center !important;
  gap: 0 !important;
  background: #17304f !important;
  border-radius: 8px !important;
  border: 1px solid rgba(75,126,184,0.4) !important;
  overflow: hidden !important;
}
#${CART_ID} .venta-linea-btn {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  color: #fff !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer !important;
}
#${CART_ID} .venta-linea-cant-input {
  width: 36px !important;
  min-width: 36px !important;
  height: 28px !important;
  box-sizing: border-box !important;
  text-align: center !important;
  font-size: 13px !important;
  font-weight: 800 !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  background: #0d1b2c !important;
  border: none !important;
  border-left: 1px solid rgba(90,130,180,0.35) !important;
  border-right: 1px solid rgba(90,130,180,0.35) !important;
  border-radius: 0 !important;
  opacity: 1 !important;
  visibility: visible !important;
  padding: 0 !important;
  margin: 0 !important;
}
#${CART_ID} .venta-linea-precios > .muted {
  min-width: 58px !important;
  text-align: right !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: #d6e1ee !important;
  white-space: nowrap !important;
}
#${CART_ID} .venta-linea-borrar {
  width: 28px !important;
  min-width: 28px !important;
  height: 28px !important;
  padding: 0 !important;
  border-radius: 8px !important;
  font-size: 0 !important;
  background: #4a1820 !important;
  color: #ffb7bd !important;
  border: 1px solid rgba(255,90,105,0.35) !important;
  cursor: pointer !important;
}
#${CART_ID} .venta-linea-borrar::before {
  content: "×" !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
}

#${CART_ID} .bc-cart-footer,
#${CART_ID} #venta-total-wrap {
  flex: 0 0 auto !important;
  margin-top: auto !important;
  padding-top: 8px !important;
}
#${CART_ID} #venta-total-wrap {
  margin: 0 0 8px 0 !important;
  padding: 10px 12px !important;
  border: 1px solid rgba(109,154,214,0.18) !important;
  border-radius: 10px !important;
  background: linear-gradient(180deg, #112136, #0d1b2d) !important;
  box-sizing: border-box !important;
}
#${CART_ID} #venta-total-wrap .venta-total-valor,
#${CART_ID} #venta-total {
  font-size: 26px !important;
  font-weight: 800 !important;
  color: #2b83ff !important;
  letter-spacing: -0.02em !important;
}
#${CART_ID} #btn-confirmar-venta {
  width: 100% !important;
  height: 46px !important;
  min-height: 46px !important;
  border-radius: 10px !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  background: linear-gradient(180deg, #1676f7, #0c61e4) !important;
  color: #fff !important;
  border: none !important;
  cursor: pointer !important;
}

/* ---- OCULTAR HISTORIAL Y FRANJAS ---- */
#tab-ventas.bc-pos h3[hidden],
#tab-ventas.bc-pos .ventas-historial-controles[hidden],
#tab-ventas.bc-pos #lista-ventas[hidden],
#tab-ventas.bc-pos .historial-ventas,
#tab-ventas.bc-pos [data-section="historial"] {
  display: none !important;
}
#tab-ventas.bc-pos .green-stripe,
#tab-ventas.bc-pos .franja-verde,
#tab-ventas.bc-pos .bottom-stripe {
  display: none !important;
}

/* Stock label debajo del topbar si aparece */
#tab-ventas.bc-pos #venta-stock-disponible {
  font-size: 11px !important;
  color: #70849b !important;
  margin: 0 0 4px 4px !important;
}

/* Responsive */
@media (max-width: 1100px) {
  #${CART_ID} { height: auto !important; max-height: 38dvh !important; }
  #${TOP_ID} {
    grid-template-columns: minmax(0, 1fr) auto !important;
    grid-template-areas: "ctx close" "search search" "qty add" !important;
    height: auto !important;
    min-height: 0 !important;
  }
}
@media (max-width: 560px) {
  #${TOP_ID} {
    grid-template-columns: 1fr !important;
    grid-template-areas: "ctx" "search" "qty" "add" "close" !important;
  }
  #${SCROLL_ID} #catalogo-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
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

  function hideHistory(tab) {
    if (!tab) return;
    tab.querySelectorAll('h3').forEach(function (h) {
      if ((h.textContent || '').trim().toLowerCase() === 'historial de ventas') {
        h.hidden = true;
        var n = h.nextElementSibling;
        if (n && (n.classList.contains('ventas-historial-controles') || n.id === 'lista-ventas')) n.hidden = true;
      }
    });
    var list = document.getElementById('lista-ventas');
    if (list) list.hidden = true;
    var cont = document.querySelector('.ventas-historial-controles');
    if (cont) cont.hidden = true;
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

    // Contexto (VENDIENDO DESDE)
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
      ctx.style.margin = '0';
      ctx.style.padding = '0';
      ctx.style.border = '0';
      ctx.style.background = 'transparent';
    }

    // Formulario de agregar
    var form = document.getElementById('form-venta-linea');
    if (form && form.parentNode !== top) top.appendChild(form);

    // Botón cerrar sesión
    var closeBtn = document.getElementById('bc-m273-cerrar-sesion-btn');
    if (closeBtn && closeBtn.parentNode !== top) top.appendChild(closeBtn);

    // Layout productos + carrito
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

    // Categorías → mover a la columna de productos
    var cats = document.getElementById('catalogo-categorias');
    if (cats && cats.parentNode !== catCol) {
      catCol.insertBefore(cats, catCol.firstChild);
    }

    // Scroll de productos
    var scroll = document.getElementById(SCROLL_ID);
    if (!scroll) {
      scroll = document.createElement('div');
      scroll.id = SCROLL_ID;
      scroll.setAttribute('aria-label', 'Productos disponibles');
    }
    if (scroll.parentNode !== catCol) catCol.appendChild(scroll);

    var grid = document.getElementById('catalogo-grid');
    if (grid && grid.parentNode !== scroll) scroll.appendChild(grid);

    // Panel carrito
    var cart = document.getElementById(CART_ID);
    if (!cart) {
      // Buscar el contenedor del carrito original
      var lineas = document.getElementById('venta-lineas');
      if (lineas) {
        cart = lineas.closest('.panel, .card, .venta-carrito, [class*="carrito"]') || lineas.parentElement;
        if (cart && !cart.id) cart.id = CART_ID;
      }
      if (!cart) {
        cart = document.createElement('div');
        cart.id = CART_ID;
        layout.appendChild(cart);
      }
    }
    if (cart.parentNode !== layout) layout.appendChild(cart);

    // Asegurar título del carrito
    var title = cart.querySelector('.bc-cart-title');
    if (!title) {
      title = document.createElement('div');
      title.className = 'bc-cart-title';
      title.textContent = 'Venta actual';
      cart.insertBefore(title, cart.firstChild);
    } else if ((title.textContent || '').trim().toLowerCase() === 'carrito') {
      title.textContent = 'Venta actual';
    }

    // Mover lineas + total + confirmar dentro del cart si hace falta
    var lineasEl = document.getElementById('venta-lineas');
    if (lineasEl && lineasEl.parentNode !== cart) cart.appendChild(lineasEl);

    var totalWrap = document.getElementById('venta-total-wrap') || document.getElementById('venta-total');
    if (totalWrap) {
      var wrap = totalWrap.closest('#venta-total-wrap') || totalWrap;
      if (wrap.parentNode !== cart) cart.appendChild(wrap);
    }
    var btnConf = document.getElementById('btn-confirmar-venta');
    if (btnConf && btnConf.parentNode !== cart) cart.appendChild(btnConf);

    hideHistory(tab);
    return true;
  }

  function forceQtyVisible() {
    var root = document.getElementById('tab-ventas') || document.body;
    root.querySelectorAll('.venta-linea-cant-input').forEach(function (inp) {
      inp.style.setProperty('color', '#ffffff', 'important');
      inp.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important');
      inp.style.setProperty('opacity', '1', 'important');
      inp.style.setProperty('visibility', 'visible', 'important');
      inp.style.setProperty('background', '#0d1b2c', 'important');
      inp.style.setProperty('font-weight', '800', 'important');
      inp.style.setProperty('font-size', '13px', 'important');
      inp.style.setProperty('text-align', 'center', 'important');
    });
  }

  function boot() {
    injectCSS();
    var ok = ensureStructure();
    forceQtyVisible();

    // Version footer
    document.querySelectorAll('.footnote, .app-footer-version, [class*="version"]').forEach(function (el) {
      if (el.textContent && el.textContent.includes('BattleCruiser')) {
        el.textContent = 'v' + VER + ' — BattleCruiser';
      }
    });
    return ok;
  }

  // Boot con reintentos cortos (sin observer permanente)
  var tries = 0;
  function start() {
    boot();
    tries++;
    if (tries < 25 && (!document.getElementById(TOP_ID) || !document.getElementById('catalogo-grid'))) {
      setTimeout(start, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 200); });
  } else {
    setTimeout(start, 200);
  }

  // Re-aplicar cantidad visible cuando el usuario interactúa con el carrito
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest('#tab-ventas')) {
      setTimeout(forceQtyVisible, 60);
      setTimeout(forceQtyVisible, 200);
    }
  }, { passive: true });

  console.info('[M68] Ventas POS Definitivo cargado', VER);
})();
