/**
 * M68 — Ventas POS Definitivo (versión sincronizada con app.js)
 * 2) Borde derecho del carrito = borde derecho del topbar (mismo grid)
 * 4) Footer inferior eliminado de verdad (clase en html/body + display none JS)
 */
(function m68VentasPosDefinitivo() {
  'use strict';
  const VER = String(window.__BC_VERSION__ || '9.5.37');
  window.__BC_M68_LOADED__ = VER;

  const TOP_ID = 'bc-venta-topbar';
  const SCROLL_ID = 'bc-venta-productos-scroll';
  const LAYOUT_ID = 'bc-venta-pos-layout';
  const CART_ID = 'bc-venta-cart-panel';
  const HISTORY_ENTRY_ID = 'bc-venta-historial-entry';
  const HISTORY_BUTTON_ID = 'bc-venta-historial-btn';
  const HISTORY_TOOLBAR_ID = 'bc-venta-history-toolbar';
  const HISTORY_BACK_ID = 'bc-venta-history-back-btn';
  const STYLE_ID = 'm68-ventas-pos-css';
  const POS_CLASS = 'bc-ventas-activa';

  const CSS = `
/* ========== M68 v${VER} ========== */
html.${POS_CLASS},
body.${POS_CLASS} {
  overflow: hidden !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
}

html.${POS_CLASS} .app-shell.visible,
body.${POS_CLASS} .app-shell.visible,
.app-shell.visible.${POS_CLASS} {
  height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
  grid-template-rows: auto minmax(0, 1fr) !important;
  grid-template-columns: 240px minmax(0, 1fr) !important;
  grid-template-areas: "header header" "sidebar main" !important;
}

html.${POS_CLASS} .app-footer,
body.${POS_CLASS} .app-footer,
.app-shell.${POS_CLASS} .app-footer,
html.${POS_CLASS} footer.app-footer,
body.${POS_CLASS} .app-footer-version {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  max-height: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  position: absolute !important;
  left: -9999px !important;
}

html.${POS_CLASS} .main-content,
body.${POS_CLASS} .main-content {
  overflow: hidden !important;
  min-height: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
  padding: 10px 12px !important;
  scrollbar-width: none !important;
}
html.${POS_CLASS} .main-content::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
html.${POS_CLASS} .main-content > .rule-orn {
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

/* Un solo grid: topbar ocupa las 2 columnas; carrito es la col 2.
   Así el borde derecho de ambas cards es EXACTAMENTE el mismo. */
#tab-ventas.bc-pos #venta-operativa-bloque {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 360px !important;
  grid-template-rows: auto minmax(0, 1fr) !important;
  grid-template-areas:
    "topbar topbar"
    "catalog cart" !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
  width: 100% !important;
  max-width: none !important;
  overflow: hidden !important;
  column-gap: 10px !important;
  row-gap: 10px !important;
  padding: 0 !important;
  margin: 0 !important;
  height: 100% !important;
  box-sizing: border-box !important;
  align-items: stretch !important;
  justify-items: stretch !important;
}

#tab-ventas.bc-pos #${LAYOUT_ID} {
  display: contents !important;
}

#tab-ventas.bc-pos #${TOP_ID} {
  grid-area: topbar !important;
  justify-self: stretch !important;
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  margin: 0 !important;
  flex: none !important;
  display: grid !important;
  grid-template-columns: minmax(160px, 220px) minmax(180px, 1fr) auto !important;
  grid-template-areas: "ctx search close" !important;
  align-items: center !important;
  justify-items: stretch !important;
  gap: 12px !important;
  min-height: 60px !important;
  height: auto !important;
  padding: 10px 12px !important;
  border: 1px solid rgba(180,160,100,0.22) !important;
  border-radius: 12px !important;
  background: rgba(12,22,18,0.97) !important;
  box-sizing: border-box !important;
  overflow: visible !important;
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

@media (max-width: 1000px) {
  #tab-ventas.bc-pos #venta-operativa-bloque {
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto minmax(0, 1fr) minmax(220px, 34dvh) !important;
    grid-template-areas:
      "topbar"
      "catalog"
      "cart" !important;
  }
  #tab-ventas.bc-pos #${TOP_ID} {
    grid-template-columns: minmax(100px, 1fr) auto !important;
    grid-template-areas: "ctx close" "search search" !important;
    height: auto !important;
    row-gap: 8px !important;
  }
}

#tab-ventas.bc-pos .bc-venta-catalog-col {
  grid-area: catalog !important;
  min-width: 0 !important;
  min-height: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  background: #0f1a16 !important;
  border: 1px solid rgba(180,160,100,0.16) !important;
  border-radius: 12px !important;
  padding: 12px !important;
  box-sizing: border-box !important;
  margin: 0 !important;
}

#tab-ventas.bc-pos .bc-venta-catalog-col #bc-m275-policy,
#tab-ventas.bc-pos .bc-venta-catalog-col #venta-stock-disponible {
  display: none !important;
}

#tab-ventas.bc-pos .bc-venta-catalog-col #catalogo-categorias {
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

#tab-ventas.bc-pos #${CART_ID} {
  grid-area: cart !important;
  justify-self: stretch !important;
  min-width: 0 !important;
  min-height: 0 !important;
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
  max-height: none !important;
  margin: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 12px !important;
  border: 1px solid rgba(180,160,100,0.16) !important;
  border-radius: 12px !important;
  background: #0f1a16 !important;
  box-sizing: border-box !important;
  position: static !important;
  flex: none !important;
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

#tab-ventas.bc-pos:not(.bc-history-view) .venta-vista-toggle,
#tab-ventas.bc-pos:not(.bc-history-view) h3,
#tab-ventas.bc-pos:not(.bc-history-view) .ventas-historial-controles,
#tab-ventas.bc-pos:not(.bc-history-view) #lista-ventas,
#tab-ventas.bc-pos:not(.bc-history-view) .historial-ventas,
#tab-ventas.bc-pos:not(.bc-history-view) input[placeholder*="referencia"],
#tab-ventas.bc-pos #venta-stock-disponible,
#tab-ventas.bc-pos #bc-m275-policy {
  display: none !important;
}

/* El historial es una vista independiente y de solo lectura; no depende de un turno abierto. */
#tab-ventas.bc-pos #bc-venta-historial-entry {
  display: flex !important; justify-content: flex-end !important; align-items: center !important;
  flex: 0 0 auto !important; width: 100% !important; margin: 0 0 8px !important;
}
#tab-ventas.bc-pos #bc-venta-historial-btn,
#tab-ventas.bc-pos #bc-venta-history-back-btn {
  min-height: 40px !important; padding: 0 14px !important; border-radius: 9px !important;
  border: 1px solid rgba(180,160,100,.38) !important; background: #21362c !important;
  color: #e8ece6 !important; font-size: 12px !important; font-weight: 700 !important;
  cursor: pointer !important; touch-action: manipulation !important;
}
#tab-ventas.bc-pos #bc-venta-history-toolbar {
  display: none !important; align-items: center !important; justify-content: flex-start !important;
  margin: 0 0 10px !important; padding: 0 !important;
}
#tab-ventas.bc-pos.bc-history-view,
#tab-ventas.bc-pos.bc-history-view.visible {
  display: block !important; height: 100% !important; max-height: 100% !important;
  min-height: 0 !important; overflow-x: hidden !important; overflow-y: auto !important;
  padding: 14px !important; box-sizing: border-box !important;
}
#tab-ventas.bc-pos.bc-history-view #venta-operativa-bloque,
#tab-ventas.bc-pos.bc-history-view #venta-sin-turno,
#tab-ventas.bc-pos.bc-history-view #bc-venta-historial-entry { display: none !important; }
#tab-ventas.bc-pos.bc-history-view #bc-venta-history-toolbar { display: flex !important; }
#tab-ventas.bc-pos.bc-history-view h3 { display: block !important; visibility: visible !important; }
#tab-ventas.bc-pos.bc-history-view .ventas-historial-controles {
  display: flex !important; flex-wrap: wrap !important; gap: 8px !important; width: 100% !important;
}
#tab-ventas.bc-pos.bc-history-view #ventas-buscar {
  display: block !important; width: 100% !important; min-width: 0 !important; box-sizing: border-box !important;
}
#tab-ventas.bc-pos.bc-history-view #lista-ventas { display: flex !important; }
#tab-ventas.bc-pos.bc-history-view #venta-detalle:not(.hidden) { display: block !important; }

#tab-ventas.bc-pos #venta-modo-catalogo {
  display: contents !important;
}

#tab-ventas.bc-pos,
#tab-ventas.bc-pos * {
  overscroll-behavior: contain !important;
}

@media (max-width: 1023px) {
  html.${POS_CLASS} .app-shell.visible,
  body.${POS_CLASS} .app-shell.visible {
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-areas: "header" "main" !important;
  }

}

/*
 * Android scroll recovery (Deliverable 9).
 * The POS layout is fixed-height/overflow-hidden for desktop. On touch devices,
 * make the whole Sales view document-scrollable so the cart and lower controls
 * remain reachable; keep the product list and cart lines independently usable.
 */
@media (max-width: 1023px), (hover: none) and (pointer: coarse) {
  html.${POS_CLASS},
  body.${POS_CLASS} {
    height: auto !important;
    min-height: 100% !important;
    max-height: none !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y !important;
  }

  html.${POS_CLASS} .app-shell.visible,
  body.${POS_CLASS} .app-shell.visible,
  .app-shell.visible.${POS_CLASS} {
    display: flex !important;
    flex-direction: column !important;
    height: auto !important;
    min-height: 100dvh !important;
    max-height: none !important;
    overflow: visible !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto !important;
    grid-template-areas: none !important;
  }

  html.${POS_CLASS} .main-content,
  body.${POS_CLASS} .main-content {
    display: block !important;
    flex: 0 0 auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    touch-action: pan-y !important;
  }

  #tab-ventas.bc-pos.bc-history-view,
  #tab-ventas.bc-pos.bc-history-view.visible {
    display: block !important; flex: 0 0 auto !important; width: 100% !important;
    height: auto !important; min-height: 0 !important; max-height: none !important;
    overflow: visible !important; touch-action: pan-y !important; padding: 12px !important;
  }

  #tab-ventas.bc-pos,
  #tab-ventas.bc-pos.visible {
    display: flex !important;
    flex: 0 0 auto !important;
    flex-direction: column !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    touch-action: pan-y !important;
  }

  #tab-ventas.bc-pos #venta-operativa-bloque {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: auto auto auto !important;
    grid-template-areas: "topbar" "catalog" "cart" !important;
    flex: 0 0 auto !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }

  #tab-ventas.bc-pos .bc-venta-catalog-col {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }

  #tab-ventas.bc-pos #${SCROLL_ID} {
    flex: 0 1 auto !important;
    height: auto !important;
    min-height: 160px !important;
    max-height: 52dvh !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior-y: contain !important;
    touch-action: pan-y !important;
  }

  #tab-ventas.bc-pos #${CART_ID} {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    flex: 0 0 auto !important;
  }

  #tab-ventas.bc-pos #${CART_ID} #venta-lineas {
    flex: 0 1 auto !important;
    min-height: 0 !important;
    max-height: 34dvh !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    touch-action: pan-y !important;
  }
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

  function ventasVisible() {
    var tab = document.getElementById('tab-ventas');
    return !!(tab && tab.classList.contains('visible') && !tab.classList.contains('hidden'));
  }

  function hideFooterEl(footer, hide) {
    if (!footer) return;
    if (hide) {
      footer.setAttribute('hidden', '');
      footer.setAttribute('aria-hidden', 'true');
      footer.style.setProperty('display', 'none', 'important');
      footer.style.setProperty('height', '0', 'important');
      footer.style.setProperty('margin', '0', 'important');
      footer.style.setProperty('padding', '0', 'important');
      footer.style.setProperty('border', '0', 'important');
      footer.style.setProperty('overflow', 'hidden', 'important');
    } else {
      footer.removeAttribute('hidden');
      footer.removeAttribute('aria-hidden');
      footer.style.removeProperty('display');
      footer.style.removeProperty('height');
      footer.style.removeProperty('margin');
      footer.style.removeProperty('padding');
      footer.style.removeProperty('border');
      footer.style.removeProperty('overflow');
    }
  }

  function syncPosMode() {
    var on = ventasVisible();
    document.documentElement.classList.toggle(POS_CLASS, on);
    document.body.classList.toggle(POS_CLASS, on);
    var shell = document.getElementById('app-shell') || document.querySelector('.app-shell');
    if (shell) shell.classList.toggle(POS_CLASS, on);
    hideFooterEl(document.querySelector('.app-footer'), on);
    document.querySelectorAll('footer').forEach(function (f) {
      if (f.classList.contains('app-footer') || /Salón Privado|BattleCruiser/i.test(f.textContent || '')) {
        hideFooterEl(f, on);
      }
    });
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

  function showHistory(tab) {
    if (!tab) return;
    tab.querySelectorAll('h3').forEach(function (h) {
      if (/historial/i.test((h.textContent || '').trim())) {
        h.style.removeProperty('display');
        h.hidden = false;
        h.removeAttribute('aria-hidden');
        h.classList.remove('hidden');
      }
    });
    ['lista-ventas', 'ventas-buscar', 'ventas-contador'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.removeProperty('display');
      el.hidden = false;
      el.removeAttribute('aria-hidden');
      el.classList.remove('hidden');
    });
    tab.querySelectorAll('.ventas-historial-controles').forEach(function (el) {
      el.style.removeProperty('display');
      el.hidden = false;
      el.removeAttribute('aria-hidden');
      el.classList.remove('hidden');
    });
    // El detalle permanece oculto por su clase .hidden hasta que el usuario abre una venta.
    var detail = document.getElementById('venta-detalle');
    if (detail) {
      detail.style.removeProperty('display');
      detail.hidden = false;
      detail.removeAttribute('aria-hidden');
    }
  }

  function setHistoryView(show) {
    var tab = document.getElementById('tab-ventas');
    if (!tab) return;
    var visible = !!show;
    tab.classList.toggle('bc-history-view', visible);
    var button = document.getElementById(HISTORY_BUTTON_ID);
    if (button) {
      button.setAttribute('aria-expanded', visible ? 'true' : 'false');
      button.setAttribute('aria-label', visible ? 'Historial de ventas abierto' : 'Ver historial de ventas');
    }
    showHistory(tab);
    if (visible && typeof window.refrescarVentasHistorial === 'function') {
      Promise.resolve()
        .then(function () { return window.refrescarVentasHistorial(); })
        .catch(function (e) { console.warn('[M68] No se pudo refrescar el historial de ventas.', e); });
    }
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

  function patchHistorialFighter() {
    if (typeof window.actualizarPanelAlmacenVenta === 'function' && !window.actualizarPanelAlmacenVenta.__bcM68pos) {
      var orig = window.actualizarPanelAlmacenVenta;
      window.actualizarPanelAlmacenVenta = function () {
        var r = orig.apply(this, arguments);
        try {
          ensureStructure();
          syncPosMode();
          showHistory(document.getElementById('tab-ventas'));
        } catch (e) {}
        return r;
      };
      window.actualizarPanelAlmacenVenta.__bcM68pos = true;
    }
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
    if (top.parentNode !== bloque) safeMove(top, bloque, bloque.firstChild);

    // Entrada persistente al historial: queda fuera del POS y funciona sin turno abierto.
    var historyEntry = document.getElementById(HISTORY_ENTRY_ID);
    if (!historyEntry) {
      historyEntry = document.createElement('div');
      historyEntry.id = HISTORY_ENTRY_ID;
      historyEntry.className = 'bc-venta-history-entry';
      var historyButton = document.createElement('button');
      historyButton.id = HISTORY_BUTTON_ID;
      historyButton.type = 'button';
      historyButton.textContent = 'Historial de ventas';
      historyButton.setAttribute('aria-label', 'Ver historial de ventas');
      historyButton.setAttribute('aria-expanded', 'false');
      historyEntry.appendChild(historyButton);
    }
    safeMove(historyEntry, tab, bloque);

    var historyToolbar = document.getElementById(HISTORY_TOOLBAR_ID);
    if (!historyToolbar) {
      historyToolbar = document.createElement('div');
      historyToolbar.id = HISTORY_TOOLBAR_ID;
      var backButton = document.createElement('button');
      backButton.id = HISTORY_BACK_ID;
      backButton.type = 'button';
      backButton.textContent = 'Volver al punto de venta';
      backButton.setAttribute('aria-label', 'Volver al punto de venta');
      historyToolbar.appendChild(backButton);
    }
    var historyTitle = Array.from(tab.querySelectorAll('h3')).find(function (h) {
      return /historial/i.test(h.textContent || '');
    });
    safeMove(historyToolbar, tab, historyTitle || null);

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

    var catCol = layout.querySelector('.bc-venta-catalog-col') || bloque.querySelector('.bc-venta-catalog-col');
    if (!catCol) {
      catCol = document.createElement('div');
      catCol.className = 'bc-venta-catalog-col';
    }
    safeMove(catCol, layout, layout.firstChild);

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
      if (lineas) cart = lineas.closest('#' + CART_ID) || null;
      if (!cart) {
        cart = document.createElement('div');
        cart.id = CART_ID;
      }
    }
    if (cart && cart !== layout && cart !== bloque && cart !== tab) {
      safeMove(cart, layout);
    }

    var title = cart && cart.querySelector('.bc-cart-title');
    if (cart && !title) {
      title = document.createElement('div');
      title.className = 'bc-cart-title';
      title.textContent = 'Carrito';
      cart.insertBefore(title, cart.firstChild);
    }

    var lineasEl = document.getElementById('venta-lineas');
    if (lineasEl && cart) safeMove(lineasEl, cart);

    var totalWrap = document.getElementById('venta-total-wrap');
    if (totalWrap && cart) safeMove(totalWrap, cart);

    var btnConf = document.getElementById('btn-confirmar-venta');
    if (btnConf && cart) safeMove(btnConf, cart);

    showHistory(tab);
    return true;
  }

  function boot() {
    injectCSS();
    var ok = ensureStructure();
    syncPosMode();
    wireSearchFilter();
    patchRenderCatalog();
    patchHistorialFighter();
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
    if (tries < 48) setTimeout(start, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 160); });
  } else {
    setTimeout(start, 160);
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('#' + HISTORY_BUTTON_ID)) {
      e.preventDefault();
      setHistoryView(true);
      return;
    }
    if (target.closest('#' + HISTORY_BACK_ID)) {
      e.preventDefault();
      setHistoryView(false);
    }
  }, true);

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#tab-ventas') || t.closest('.tab-btn') || t.closest('#tabs')) {
      setTimeout(function () {
        ensureStructure();
        syncPosMode();
        wireSearchFilter();
        applySearchFilter();
      }, 40);
    }
  }, true);

  if (!window.__BC_M68_TAB_OBS__) {
    window.__BC_M68_TAB_OBS__ = true;
    var tab = document.getElementById('tab-ventas');
    if (tab) {
      new MutationObserver(function () {
        syncPosMode();
      }).observe(tab, { attributes: true, attributeFilter: ['class'] });
    }
  }

  console.info('[M68] Ventas POS Definitivo', VER);
})();
