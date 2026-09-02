/**
 * M68 — Ventas POS Definitivo (v9.4.74)
 * 1) Topbar: contenido centrado, sin recorte
 * 2) Borde derecho del carrito = borde derecho del topbar (alineación perfecta)
 * 3) Sin scroll de página; solo productos (y líneas del carrito si hace falta)
 * 4) Footer inferior oculto y sacado del flujo en Ventas
 * 5) Buscador filtra la grilla por nombre
 */
(function m68VentasPosDefinitivo() {
  'use strict';
  const VER = '9.4.74';
  window.__BC_M68_LOADED__ = VER;

  const TOP_ID = 'bc-venta-topbar';
  const SCROLL_ID = 'bc-venta-productos-scroll';
  const LAYOUT_ID = 'bc-venta-pos-layout';
  const CART_ID = 'bc-venta-cart-panel';
  const STYLE_ID = 'm68-ventas-pos-css';

  const CSS = `
/* ========== M68 v9.4.74 ========== */
html:has(#tab-ventas.bc-pos.visible),
body:has(#tab-ventas.bc-pos.visible) {
  overflow: hidden !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
}

/* Shell: solo header + main (sin fila de footer) */
.app-shell.visible:has(#tab-ventas.bc-pos.visible) {
  height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
  grid-template-rows: auto minmax(0, 1fr) !important;
  grid-template-areas: "header header" "sidebar main" !important;
}

/* 4) Footer: eliminado de verdad (display + sacado del flujo + zero size) */
.app-shell.visible:has(#tab-ventas.bc-pos.visible) .app-footer,
body:has(#tab-ventas.bc-pos.visible) .app-footer,
#app-shell:has(#tab-ventas.bc-pos.visible) .app-footer {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  max-height: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  position: absolute !important;
  pointer-events: none !important;
  opacity: 0 !important;
  z-index: -1 !important;
}

.app-shell.visible:has(#tab-ventas.bc-pos.visible) .main-content {
  overflow: hidden !important;
  min-height: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
  padding: 10px 12px !important;
  scrollbar-width: none !important;
}
.app-shell.visible:has(#tab-ventas.bc-pos.visible) .main-content::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
.app-shell.visible:has(#tab-ventas.bc-pos.visible) .main-content > .rule-orn {
  display: none !important;
}

#tab-ventas.bc-pos,
#tab-ventas.bc-pos.visible {
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
  max-height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  background: #0a1210 !important;
  color: #e8ece6 !important;
  box-sizing: border-box !important;
  margin: 0 !important;
  padding: 0 !important;
}

#tab-ventas.bc-pos #venta-operativa-bloque {
  display: flex !important;
  flex: 1 1 auto !important;
  flex-direction: column !important;
  min-height: 0 !important;
  width: 100% !important;
  max-width: none !important;
  overflow: hidden !important;
  gap: 10px !important;
  padding: 0 !important;
  margin: 0 !important;
  height: 100% !important;
  box-sizing: border-box !important;
}

/* ---- TOPBAR: altura suficiente, items centrados, sin recorte ---- */
#tab-ventas.bc-pos #${TOP_ID} {
  flex: 0 0 auto !important;
  display: grid !important;
  grid-template-columns: minmax(160px, 220px) minmax(180px, 1fr) auto !important;
  grid-template-areas: "ctx search close" !important;
  align-items: center !important;
  justify-items: stretch !important;
  gap: 12px !important;
  min-height: 60px !important;
  height: auto !important;
  padding: 10px 12px !important;
  margin: 0 !important;
  border: 1px solid rgba(180,160,100,0.22) !important;
  border-radius: 12px !important;
  background: rgba(12,22,18,0.97) !important;
  box-sizing: border-box !important;
  overflow: visible !important;
  width: 100% !important;
  max-width: 100% !important;
}

#tab-ventas.bc-pos #${TOP_ID} .bc-m64-context,
#tab-ventas.bc-pos #${TOP_ID} #bc-m64-context {
  grid-area: ctx !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  min-width: 0 !important;
  max-width: 100% !important;
  height: 40px !important;
  padding: 0 !important;
  overflow: visible !important;
}

#tab-ventas.bc-pos #${TOP_ID} .venta-almacen-operativo,
#tab-ventas.bc-pos #${TOP_ID} #venta-almacen-operativo {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  gap: 1px !important;
  height: 40px !important;
  min-height: 40px !important;
  max-height: 40px !important;
  margin: 0 !important;
  padding: 0 10px !important;
  border: 1px solid rgba(180,160,100,0.22) !important;
  border-radius: 9px !important;
  background: #15221c !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}

#tab-ventas.bc-pos #${TOP_ID} .venta-almacen-label {
  font-size: 9px !important;
  font-weight: 600 !important;
  color: #8a9a88 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1.15 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

#tab-ventas.bc-pos #${TOP_ID} .venta-almacen-nombre {
  font-size: 14px !important;
  font-weight: 700 !important;
  font-family: Inter, system-ui, sans-serif !important;
  color: #d4c48a !important;
  margin: 0 !important;
  padding: 0 !important;
  line-height: 1.2 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

#tab-ventas.bc-pos #${TOP_ID} .venta-almacen-hint { display: none !important; }

#tab-ventas.bc-pos #${TOP_ID} #form-venta-linea {
  grid-area: search !important;
  display: flex !important;
  align-items: center !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  min-width: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 40px !important;
  gap: 0 !important;
  flex-wrap: nowrap !important;
}

#tab-ventas.bc-pos #${TOP_ID} .venta-buscar-wrap {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  position: relative !important;
  width: 100% !important;
  height: 40px !important;
}

#tab-ventas.bc-pos #${TOP_ID} #venta-producto-buscar {
  display: block !important;
  width: 100% !important;
  height: 40px !important;
  min-height: 40px !important;
  max-height: 40px !important;
  box-sizing: border-box !important;
  padding: 0 14px !important;
  margin: 0 !important;
  font-size: 13px !important;
  line-height: 40px !important;
  color: #e8ece6 !important;
  background: #15221c !important;
  border: 1px solid rgba(180,160,100,0.28) !important;
  border-radius: 9px !important;
  outline: none !important;
}

#tab-ventas.bc-pos #${TOP_ID} #venta-producto-buscar:focus {
  border-color: rgba(201,162,77,0.7) !important;
  box-shadow: 0 0 0 2px rgba(201,162,77,0.15) !important;
}
#tab-ventas.bc-pos #${TOP_ID} #venta-producto-buscar::placeholder { color: #6b7a68 !important; }

#tab-ventas.bc-pos #${TOP_ID} #venta-cantidad,
#tab-ventas.bc-pos #${TOP_ID} #venta-presentacion,
#tab-ventas.bc-pos #${TOP_ID} #venta-producto,
#tab-ventas.bc-pos #${TOP_ID} #form-venta-linea button[type=submit],
#tab-ventas.bc-pos #${TOP_ID} #form-venta-linea .venta-cantidad-wrap,
#tab-ventas.bc-pos #${TOP_ID} #venta-producto-resultados {
  display: none !important;
}

#tab-ventas.bc-pos #${TOP_ID} #bc-m273-cerrar-sesion-btn {
  grid-area: close !important;
  height: 40px !important;
  min-height: 40px !important;
  max-height: 40px !important;
  min-width: 148px !important;
  max-width: none !important;
  width: auto !important;
  padding: 0 16px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  overflow: visible !important;
  text-overflow: clip !important;
  border-radius: 9px !important;
  background: #b91c1c !important;
  color: #fff !important;
  border: none !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
}

#tab-ventas.bc-pos #${TOP_ID} #bc-m64-add-title,
#tab-ventas.bc-pos #${TOP_ID} .bc-m64-title,
#tab-ventas.bc-pos #${TOP_ID} #venta-stock-disponible,
#tab-ventas.bc-pos #${TOP_ID} #bc-m275-policy,
#tab-ventas.bc-pos #${TOP_ID} #catalogo-categorias {
  display: none !important;
}

/* ---- LAYOUT: mismo ancho exacto que el topbar (punto 2) ---- */
#tab-ventas.bc-pos #${LAYOUT_ID} {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 380px) !important;
  gap: 10px !important;
  align-items: stretch !important;
  height: 100% !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}

/* Garantiza que topbar y layout tengan el mismo borde derecho */
#tab-ventas.bc-pos #${TOP_ID},
#tab-ventas.bc-pos #${LAYOUT_ID} {
  width: 100% !important;
  max-width: 100% !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  box-sizing: border-box !important;
}

@media (min-width: 1400px) {
  #tab-ventas.bc-pos #${LAYOUT_ID} {
    grid-template-columns: minmax(0, 1fr) minmax(340px, 400px) !important;
  }
}
@media (max-width: 1000px) {
  #tab-ventas.bc-pos #${LAYOUT_ID} {
    grid-template-columns: 1fr !important;
    grid-template-rows: minmax(0, 1fr) minmax(220px, 34dvh) !important;
  }
  #tab-ventas.bc-pos #${TOP_ID} {
    grid-template-columns: minmax(100px, 1fr) auto !important;
    grid-template-areas: "ctx close" "search search" !important;
    height: auto !important;
    row-gap: 8px !important;
  }
}

#tab-ventas.bc-pos #${LAYOUT_ID} .bc-venta-catalog-col {
  min-width: 0 !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  background: #0f1a16 !important;
  border: 1px solid rgba(180,160,100,0.16) !important;
  border-radius: 12px !important;
  padding: 12px !important;
  box-sizing: border-box !important;
}

#tab-ventas.bc-pos #${LAYOUT_ID} .bc-venta-catalog-col #bc-m275-policy,
#tab-ventas.bc-pos #${LAYOUT_ID} .bc-venta-catalog-col #venta-stock-disponible {
  display: none !important;
}

#tab-ventas.bc-pos #${LAYOUT_ID} .bc-venta-catalog-col #catalogo-categorias {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
  margin: 0 0 10px 0 !important;
  padding: 0 !important;
  flex: 0 0 auto !important;
}

#tab-ventas.bc-pos #catalogo-categorias .catalogo-chip {
  flex: 0 0 auto !important;
  height: 28px !important;
  min-height: 28px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  border-radius: 999px !important;
  background: #1a2820 !important;
  color: #b8c4b0 !important;
  border: 1px solid rgba(180,160,100,0.2) !important;
  white-space: nowrap !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
}
#tab-ventas.bc-pos #catalogo-categorias .catalogo-chip.activo {
  background: rgba(201,162,77,0.22) !important;
  color: #e8d48a !important;
  border-color: rgba(201,162,77,0.55) !important;
}

#tab-ventas.bc-pos #${SCROLL_ID} {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 2px 2px 8px !important;
  scrollbar-width: thin !important;
  scrollbar-color: rgba(180,160,100,0.35) transparent !important;
}

#tab-ventas.bc-pos #${SCROLL_ID} #catalogo-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)) !important;
  gap: 10px !important;
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

#tab-ventas.bc-pos #${SCROLL_ID} .catalogo-card {
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
}
#tab-ventas.bc-pos #${SCROLL_ID} .catalogo-card[hidden],
#tab-ventas.bc-pos #${SCROLL_ID} .catalogo-card.bc-search-hide {
  display: none !important;
}

#tab-ventas.bc-pos #${SCROLL_ID} .catalogo-card-img,
#tab-ventas.bc-pos #${SCROLL_ID} .catalogo-card-img-vacia {
  width: 56px !important;
  height: 48px !important;
  object-fit: contain !important;
  border-radius: 7px !important;
  background: rgba(255,255,255,0.03) !important;
  flex-shrink: 0 !important;
}
#tab-ventas.bc-pos #${SCROLL_ID} .catalogo-card-nombre {
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
#tab-ventas.bc-pos #${SCROLL_ID} .catalogo-card-precio {
  font-size: 15px !important;
  font-weight: 800 !important;
  color: #e8d48a !important;
  margin-top: auto !important;
}
#tab-ventas.bc-pos #${SCROLL_ID} .catalogo-card-stock { font-size: 10px !important; color: #7a8a78 !important; }
#tab-ventas.bc-pos #${SCROLL_ID} .catalogo-card-categoria { display: none !important; }

/* Carrito: mismo borde derecho que el topbar (punto 2 reforzado) */
#tab-ventas.bc-pos #${CART_ID} {
  min-width: 0 !important;
  min-height: 0 !important;
  width: 100% !important;
  height: 100% !important;
  max-height: 100% !important;
  margin: 0 !important;
  margin-right: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 12px !important;
  border: 1px solid rgba(180,160,100,0.16) !important;
  border-radius: 12px !important;
  background: #0f1a16 !important;
  box-sizing: border-box !important;
}
#tab-ventas.bc-pos #${CART_ID} .bc-cart-title,
#tab-ventas.bc-pos #${CART_ID} h3 {
  flex: 0 0 auto !important;
  margin: 0 0 8px 0 !important;
  padding: 0 0 8px 0 !important;
  border-bottom: 1px solid rgba(180,160,100,0.12) !important;
  font-size: 16px !important;
  font-weight: 750 !important;
  color: #e8ece6 !important;
  display: block !important;
  height: auto !important;
  visibility: visible !important;
  overflow: visible !important;
}
#tab-ventas.bc-pos #${CART_ID} #venta-lineas {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  margin: 0 !important;
  padding: 2px 0 6px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 5px !important;
}
#tab-ventas.bc-pos #${CART_ID} #venta-lineas .lista-item,
#tab-ventas.bc-pos #${CART_ID} #venta-lineas .lista-estado {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  gap: 6px !important;
  align-items: center !important;
  padding: 8px !important;
  border: 1px solid rgba(180,160,100,0.1) !important;
  border-radius: 9px !important;
  background: #15221c !important;
}
#tab-ventas.bc-pos #${CART_ID} .venta-linea-info { min-width: 0 !important; overflow: hidden !important; }
#tab-ventas.bc-pos #${CART_ID} .venta-linea-cant-input {
  width: 32px !important;
  height: 26px !important;
  text-align: center !important;
  color: #fff !important;
  -webkit-text-fill-color: #fff !important;
  background: #0f1a16 !important;
  border: none !important;
  font-weight: 800 !important;
}
#tab-ventas.bc-pos #${CART_ID} #venta-total-wrap {
  flex: 0 0 auto !important;
  margin: auto 0 8px 0 !important;
  padding: 10px 12px !important;
  border: 1px solid rgba(180,160,100,0.16) !important;
  border-radius: 9px !important;
  background: #15221c !important;
}
#tab-ventas.bc-pos #${CART_ID} #venta-total {
  font-size: 24px !important;
  font-weight: 800 !important;
  color: #e8d48a !important;
}
#tab-ventas.bc-pos #${CART_ID} #btn-confirmar-venta {
  width: 100% !important;
  height: 44px !important;
  border-radius: 9px !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  background: linear-gradient(180deg, #1a6fd4, #0d5bb8) !important;
  color: #fff !important;
  border: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

#tab-ventas.bc-pos .venta-vista-toggle,
#tab-ventas.bc-pos h3,
#tab-ventas.bc-pos .ventas-historial-controles,
#tab-ventas.bc-pos #lista-ventas,
#tab-ventas.bc-pos [id*="historial"],
#tab-ventas.bc-pos .historial-ventas,
#tab-ventas.bc-pos input[placeholder*="referencia"],
#tab-ventas.bc-pos #venta-stock-disponible,
#tab-ventas.bc-pos #bc-m275-policy {
  display: none !important;
}

#tab-ventas.bc-pos #venta-modo-catalogo {
  display: contents !important;
}

#tab-ventas.bc-pos,
#tab-ventas.bc-pos * {
  overscroll-behavior: contain !important;
}
`;

  function injectCSS() {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = CSS;
  }

  function safeMove(el, parent, before) {
    if (!el || !parent) return;
    if (el === parent) return;
    if (el.contains && el.contains(parent)) return;
    if (el.parentNode === parent && (!before || el.nextSibling === before || (!before && !el.nextSibling))) return;
    try {
      if (before && before.parentNode === parent) parent.insertBefore(el, before);
      else parent.appendChild(el);
    } catch (e) {}
  }

  function hideHistoryHard(tab) {
    if (!tab) return;
    tab.querySelectorAll('h3').forEach(function (h) {
      var t = (h.textContent || '').trim().toLowerCase();
      if (t.indexOf('historial') !== -1) {
        h.style.display = 'none';
        h.hidden = true;
      }
    });
    var list = document.getElementById('lista-ventas');
    if (list) { list.style.display = 'none'; list.hidden = true; }
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function applySearchFilter() {
    var input = document.getElementById('venta-producto-buscar');
    var grid = document.getElementById('catalogo-grid');
    if (!grid) return;
    var term = norm(input ? input.value : '');
    window._ventaCatalogoFiltroTexto = (input && input.value) ? String(input.value).trim().toLowerCase() : '';
    grid.querySelectorAll('.catalogo-card').forEach(function (card) {
      var nameEl = card.querySelector('.catalogo-card-nombre');
      var name = nameEl
        ? nameEl.textContent
        : (card.getAttribute('data-nombre') || card.getAttribute('title') || card.textContent || '');
      var match = !term || norm(name).indexOf(term) !== -1;
      card.classList.toggle('bc-search-hide', !match);
      if (match) {
        card.style.removeProperty('display');
      } else {
        card.style.setProperty('display', 'none', 'important');
      }
    });
    var res = document.getElementById('venta-producto-resultados');
    if (res) {
      res.style.display = 'none';
      res.classList.add('hidden');
      res.innerHTML = '';
    }
  }

  function patchRenderCatalog() {
    if (typeof window.renderCatalogoGrid !== 'function') return;
    if (window.renderCatalogoGrid.__bcM68) return;
    var orig = window.renderCatalogoGrid;
    window.renderCatalogoGrid = function () {
      var out = orig.apply(this, arguments);
      applySearchFilter();
      return out;
    };
    window.renderCatalogoGrid.__bcM68 = true;
  }

  function wireSearchFilter() {
    var input = document.getElementById('venta-producto-buscar');
    if (!input) return;
    if (!input.dataset.m68Filter) {
      input.dataset.m68Filter = '1';
      input.placeholder = 'Buscar producto por nombre...';
      var onType = function (e) {
        if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
        applySearchFilter();
      };
      input.addEventListener('input', onType, true);
      input.addEventListener('keyup', onType, true);
      input.addEventListener('search', onType, true);
    }
    var form = document.getElementById('form-venta-linea');
    if (form && !form.dataset.m68Submit) {
      form.dataset.m68Submit = '1';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        applySearchFilter();
      }, true);
    }
    if (!window.__BC_M68_GRID_OBS__) {
      window.__BC_M68_GRID_OBS__ = true;
      var grid = document.getElementById('catalogo-grid');
      if (grid) {
        var obs = new MutationObserver(function () { applySearchFilter(); });
        obs.observe(grid, { childList: true, subtree: false });
      }
    }
    patchRenderCatalog();
    applySearchFilter();
  }

  function ensureStructure() {
    var tab = document.getElementById('tab-ventas');
    var bloque = document.getElementById('venta-operativa-bloque');
    if (!tab || !bloque) return false;

    tab.classList.add('bc-pos');

    var top = document.getElementById(TOP_ID);
    if (!top) {
      top = document.createElement('div');
      top.id = TOP_ID;
      top.setAttribute('role', 'region');
      top.setAttribute('aria-label', 'Controles de venta');
      bloque.insertBefore(top, bloque.firstChild);
    }

    var ctx = document.getElementById('venta-almacen-operativo');
    if (ctx) {
      var ctxWrap = document.getElementById('bc-m64-context');
      if (!ctxWrap) {
        ctxWrap = document.createElement('div');
        ctxWrap.id = 'bc-m64-context';
        ctxWrap.className = 'bc-m64-context';
      }
      safeMove(ctx, ctxWrap);
      safeMove(ctxWrap, top, top.firstChild);
    }

    var form = document.getElementById('form-venta-linea');
    if (form) safeMove(form, top);

    var closeBtn = document.getElementById('bc-m273-cerrar-sesion-btn');
    if (closeBtn) safeMove(closeBtn, top);

    var layout = document.getElementById(LAYOUT_ID);
    if (!layout) {
      layout = document.createElement('div');
      layout.id = LAYOUT_ID;
      bloque.appendChild(layout);
    }
    if (layout.parentNode !== bloque) safeMove(layout, bloque);

    var catCol = layout.querySelector('.bc-venta-catalog-col');
    if (!catCol) {
      catCol = document.createElement('div');
      catCol.className = 'bc-venta-catalog-col';
      layout.insertBefore(catCol, layout.firstChild);
    }

    var cats = document.getElementById('catalogo-categorias');
    if (cats) safeMove(cats, catCol, catCol.firstChild);

    var scroll = document.getElementById(SCROLL_ID);
    if (!scroll) {
      scroll = document.createElement('div');
      scroll.id = SCROLL_ID;
      scroll.setAttribute('aria-label', 'Productos disponibles');
    }
    safeMove(scroll, catCol);

    var grid = document.getElementById('catalogo-grid');
    if (grid) safeMove(grid, scroll);

    var cart = document.getElementById(CART_ID);
    if (!cart) {
      var lineas = document.getElementById('venta-lineas');
      if (lineas) {
        cart = lineas.closest('[id="' + CART_ID + '"]') || null;
      }
      if (!cart) {
        cart = document.createElement('div');
        cart.id = CART_ID;
      }
    }
    if (cart !== layout && cart !== bloque && cart !== tab) {
      safeMove(cart, layout);
    }

    var title = cart.querySelector('.bc-cart-title');
    if (!title) {
      title = document.createElement('div');
      title.className = 'bc-cart-title';
      title.textContent = 'Carrito';
      cart.insertBefore(title, cart.firstChild);
    }

    var lineasEl = document.getElementById('venta-lineas');
    if (lineasEl) safeMove(lineasEl, cart);

    var totalWrap = document.getElementById('venta-total-wrap');
    if (totalWrap) safeMove(totalWrap, cart);

    var btnConf = document.getElementById('btn-confirmar-venta');
    if (btnConf) safeMove(btnConf, cart);

    hideHistoryHard(tab);
    return true;
  }

  function boot() {
    injectCSS();
    var ok = ensureStructure();
    wireSearchFilter();
    patchRenderCatalog();
    document.querySelectorAll('.footnote, .app-footer-version').forEach(function (el) {
      if (el.textContent && /BattleCruiser/i.test(el.textContent)) {
        el.textContent = 'v' + VER + ' — BattleCruiser';
      }
    });
    return ok;
  }

  var tries = 0;
  function start() {
    boot();
    tries++;
    if (tries < 40) setTimeout(start, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 160); });
  } else {
    setTimeout(start, 160);
  }

  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('#tab-ventas')) {
      setTimeout(function () {
        ensureStructure();
        wireSearchFilter();
        applySearchFilter();
      }, 60);
    }
  }, true);

  console.info('[M68] Ventas POS Definitivo', VER);
})();
