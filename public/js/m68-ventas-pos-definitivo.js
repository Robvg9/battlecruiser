/**
 * M68 — Ventas POS Definitivo (v9.4.69)
 * Smart POS Sales Panel — capa única y autoritativa
 * - Header compacto + buscador usable
 * - Botones sin overflow de texto
 * - Cantidad del carrito siempre visible
 * - Carrito aprovecha todo el espacio derecho
 * - Sin franja verde residual
 * - Solo scroll en productos
 * - Sin MutationObserver / sin freeze
 */
(function m68VentasPosDefinitivo() {
  'use strict';
  const VER = '9.4.69';
  if (window.__BC_M68_LOADED__) return;
  window.__BC_M68_LOADED__ = VER;

  const CSS = `
/* ========== M68 AUTHORITATIVE LAYER ========== */
#view-ventas,
#view-ventas .ventas-panel,
#view-ventas .ventas-main,
#view-ventas .pos-layout,
#view-ventas .ventas-layout,
section[data-view="ventas"],
.view-ventas {
  --m68-gap: 10px;
  --m68-radius: 12px;
  --m68-card-bg: #0f172a;
  --m68-header-bg: #0b1220;
  --m68-border: 1px solid rgba(148,163,184,0.18);
  --m68-text: #e2e8f0;
  --m68-muted: #94a3b8;
  --m68-accent: #3b82f6;
  --m68-danger: #ef4444;
  --m68-ok: #22c55e;
  box-sizing: border-box !important;
}

/* ---- Layout principal: productos + carrito ---- */
#view-ventas .pos-grid,
#view-ventas .ventas-grid,
#view-ventas .layout-ventas,
#view-ventas .main-content > .grid,
#view-ventas > .content,
#view-ventas .ventas-body {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px) !important;
  gap: var(--m68-gap) !important;
  align-items: start !important;
  width: 100% !important;
  max-width: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

@media (min-width: 1400px) {
  #view-ventas .pos-grid,
  #view-ventas .ventas-grid,
  #view-ventas .layout-ventas {
    grid-template-columns: minmax(0, 1fr) minmax(360px, 420px) !important;
  }
}

@media (max-width: 1100px) {
  #view-ventas .pos-grid,
  #view-ventas .ventas-grid,
  #view-ventas .layout-ventas {
    grid-template-columns: 1fr !important;
  }
}

/* ---- HEADER POS (contexto + búsqueda + acciones) ---- */
#view-ventas .ventas-header,
#view-ventas .pos-header,
#view-ventas .header-ventas,
#view-ventas .toolbar-ventas,
#view-ventas .ventas-top,
#view-ventas .panel-header {
  display: grid !important;
  grid-template-columns: minmax(180px, 240px) minmax(200px, 1fr) auto auto auto !important;
  gap: 8px !important;
  align-items: center !important;
  padding: 10px 12px !important;
  background: var(--m68-header-bg) !important;
  border: var(--m68-border) !important;
  border-radius: var(--m68-radius) !important;
  margin-bottom: 10px !important;
  min-height: 0 !important;
  height: auto !important;
  overflow: visible !important;
  box-sizing: border-box !important;
}

/* Contexto "VENDIENDO DESDE" */
#view-ventas .ventas-header .ctx,
#view-ventas .pos-header .ctx,
#view-ventas .vendiendo-desde,
#view-ventas [class*="vendiendo"],
#view-ventas .session-ctx {
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  min-width: 0 !important;
  padding: 4px 8px !important;
  background: rgba(15,23,42,0.6) !important;
  border-radius: 8px !important;
  border: 1px solid rgba(34,197,94,0.25) !important;
}
#view-ventas .ventas-header .ctx strong,
#view-ventas .vendiendo-desde strong,
#view-ventas .session-ctx strong {
  font-size: 13px !important;
  font-weight: 700 !important;
  color: #f8fafc !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
#view-ventas .ventas-header .ctx small,
#view-ventas .vendiendo-desde small {
  font-size: 10px !important;
  color: var(--m68-muted) !important;
  line-height: 1.2 !important;
}

/* ---- BUSCADOR (ahora usable) ---- */
#view-ventas .pos-search,
#view-ventas .search-productos,
#view-ventas input[type="search"],
#view-ventas input[placeholder*="Buscar"],
#view-ventas input[placeholder*="buscar"],
#view-ventas .ventas-header input[type="text"],
#view-ventas .toolbar input {
  grid-column: 2 !important;
  width: 100% !important;
  min-width: 180px !important;
  max-width: none !important;
  height: 38px !important;
  padding: 0 12px 0 36px !important;
  font-size: 14px !important;
  color: #f1f5f9 !important;
  background: #0f172a !important;
  border: 1px solid rgba(148,163,184,0.35) !important;
  border-radius: 10px !important;
  outline: none !important;
  box-sizing: border-box !important;
}
#view-ventas .pos-search:focus,
#view-ventas input[type="search"]:focus,
#view-ventas .toolbar input:focus {
  border-color: var(--m68-accent) !important;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.25) !important;
}

/* Cantidad input */
#view-ventas .qty-input,
#view-ventas input[name*="cant"],
#view-ventas input[placeholder*="Cant"],
#view-ventas .cant-input {
  width: 64px !important;
  min-width: 64px !important;
  height: 38px !important;
  text-align: center !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  color: #f8fafc !important;
  background: #0f172a !important;
  border: 1px solid rgba(148,163,184,0.35) !important;
  border-radius: 10px !important;
  box-sizing: border-box !important;
}

/* ---- BOTONES del header: texto SIEMPRE dentro ---- */
#view-ventas .ventas-header button,
#view-ventas .pos-header button,
#view-ventas .toolbar-ventas button,
#view-ventas .ventas-top button,
#view-ventas .panel-header button,
#view-ventas button.btn-add,
#view-ventas button.btn-agregar,
#view-ventas button[class*="agregar"],
#view-ventas button[class*="cerrar"],
#view-ventas button[class*="precios"],
#view-ventas .btn-cerrar-sesion {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  height: 38px !important;
  min-height: 38px !important;
  padding: 0 14px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  max-width: 100% !important;
  border-radius: 10px !important;
  border: none !important;
  cursor: pointer !important;
  box-sizing: border-box !important;
  flex-shrink: 0 !important;
}

/* Botón principal "Agregar a la venta" */
#view-ventas button.btn-add,
#view-ventas button.btn-agregar,
#view-ventas button[class*="agregar"],
#view-ventas .btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  color: #fff !important;
  min-width: 140px !important;
  max-width: 180px !important;
}

/* Botón secundario (precios alternativos) */
#view-ventas button[class*="precios"],
#view-ventas .btn-alt-prices {
  background: rgba(51,65,85,0.8) !important;
  color: #e2e8f0 !important;
  border: 1px solid rgba(148,163,184,0.3) !important;
  min-width: 120px !important;
  max-width: 160px !important;
  font-size: 12px !important;
}

/* Cerrar sesión */
#view-ventas button[class*="cerrar"],
#view-ventas .btn-cerrar-sesion,
#view-ventas button.btn-danger {
  background: #dc2626 !important;
  color: #fff !important;
  min-width: 110px !important;
  max-width: 140px !important;
}

/* Categorías (chips) */
#view-ventas .categorias,
#view-ventas .cats,
#view-ventas .filter-cats,
#view-ventas .category-pills {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
  padding: 0 0 8px 0 !important;
  margin: 0 !important;
}
#view-ventas .categorias button,
#view-ventas .cats button,
#view-ventas .category-pills button,
#view-ventas button.cat-pill {
  height: 30px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  max-width: 160px !important;
  border-radius: 999px !important;
  background: rgba(30,41,59,0.9) !important;
  color: #cbd5e1 !important;
  border: 1px solid rgba(148,163,184,0.2) !important;
}
#view-ventas .categorias button.active,
#view-ventas .cats button.active,
#view-ventas button.cat-pill.active {
  background: rgba(59,130,246,0.25) !important;
  color: #93c5fd !important;
  border-color: rgba(59,130,246,0.5) !important;
}

/* ---- PRODUCTOS (solo scroll aquí) ---- */
#view-ventas .productos,
#view-ventas .products-grid,
#view-ventas .product-list,
#view-ventas .grid-productos {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;
  gap: 10px !important;
  max-height: calc(100vh - 280px) !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 4px 2px 12px 2px !important;
  scrollbar-width: thin !important;
  scrollbar-color: rgba(148,163,184,0.35) transparent !important;
}
#view-ventas .product-card,
#view-ventas .producto-card,
#view-ventas .card-producto {
  background: #1e293b !important;
  border: 1px solid rgba(148,163,184,0.15) !important;
  border-radius: 12px !important;
  padding: 10px !important;
  min-height: 120px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: space-between !important;
  cursor: pointer !important;
  transition: transform 0.12s ease, border-color 0.12s ease !important;
}
#view-ventas .product-card:hover,
#view-ventas .producto-card:hover {
  border-color: rgba(59,130,246,0.45) !important;
  transform: translateY(-1px) !important;
}
#view-ventas .product-card .price,
#view-ventas .producto-card .precio {
  font-size: 15px !important;
  font-weight: 700 !important;
  color: #f8fafc !important;
}

/* ---- CARRITO (fijo, legible, aprovecha espacio) ---- */
#view-ventas .cart,
#view-ventas .carrito,
#view-ventas .venta-actual,
#view-ventas .panel-carrito,
#view-ventas .cart-panel {
  position: sticky !important;
  top: 8px !important;
  background: #0f172a !important;
  border: var(--m68-border) !important;
  border-radius: var(--m68-radius) !important;
  padding: 14px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
  max-height: calc(100vh - 160px) !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
  width: 100% !important;
  min-width: 0 !important;
}

#view-ventas .cart h3,
#view-ventas .carrito h3,
#view-ventas .venta-actual h3,
#view-ventas .panel-carrito h3 {
  margin: 0 0 4px 0 !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  color: #f1f5f9 !important;
}

/* Lista de ítems del carrito */
#view-ventas .cart-items,
#view-ventas .carrito-items,
#view-ventas .venta-actual .items,
#view-ventas .cart-list {
  flex: 1 1 auto !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
  padding-right: 2px !important;
  scrollbar-width: thin !important;
}

/* Ítem del carrito */
#view-ventas .cart-item,
#view-ventas .carrito-item,
#view-ventas .item-venta {
  display: grid !important;
  grid-template-columns: 1fr auto auto auto !important;
  gap: 6px !important;
  align-items: center !important;
  padding: 8px 10px !important;
  background: rgba(30,41,59,0.7) !important;
  border-radius: 10px !important;
  border: 1px solid rgba(148,163,184,0.12) !important;
  min-height: 44px !important;
}

#view-ventas .cart-item .name,
#view-ventas .carrito-item .nombre {
  font-size: 13px !important;
  font-weight: 600 !important;
  color: #f1f5f9 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  min-width: 0 !important;
}
#view-ventas .cart-item .unit,
#view-ventas .carrito-item .precio-u {
  font-size: 11px !important;
  color: var(--m68-muted) !important;
}

/* Controles de cantidad (−  qty  +) — CANTIDAD SIEMPRE VISIBLE */
#view-ventas .qty-controls,
#view-ventas .cantidad-ctrl,
#view-ventas .cart-item .qty,
#view-ventas .carrito-item .qty {
  display: inline-flex !important;
  align-items: center !important;
  gap: 0 !important;
  background: #1e293b !important;
  border-radius: 8px !important;
  border: 1px solid rgba(148,163,184,0.25) !important;
  overflow: hidden !important;
}
#view-ventas .qty-controls button,
#view-ventas .cantidad-ctrl button,
#view-ventas .cart-item .qty button,
#view-ventas .carrito-item button {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  color: #e2e8f0 !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer !important;
}
#view-ventas .qty-controls button:hover,
#view-ventas .cantidad-ctrl button:hover {
  background: rgba(59,130,246,0.2) !important;
}

/* El número de cantidad — FORZAR VISIBILIDAD */
#view-ventas .qty-controls .qty-value,
#view-ventas .qty-controls span,
#view-ventas .cantidad-ctrl span,
#view-ventas .cart-item .qty span,
#view-ventas .carrito-item .qty span,
#view-ventas .cart-item input[type="number"],
#view-ventas .carrito-item input[type="number"],
#view-ventas .item-venta .cantidad {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-width: 32px !important;
  width: 32px !important;
  height: 28px !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  color: #f8fafc !important;
  background: #0f172a !important;
  border-left: 1px solid rgba(148,163,184,0.2) !important;
  border-right: 1px solid rgba(148,163,184,0.2) !important;
  text-align: center !important;
  line-height: 1 !important;
  padding: 0 !important;
  margin: 0 !important;
  opacity: 1 !important;
  visibility: visible !important;
  -webkit-text-fill-color: #f8fafc !important;
}

/* Precio línea + eliminar */
#view-ventas .cart-item .line-total,
#view-ventas .carrito-item .subtotal {
  font-size: 13px !important;
  font-weight: 700 !important;
  color: #e2e8f0 !important;
  white-space: nowrap !important;
  min-width: 70px !important;
  text-align: right !important;
}
#view-ventas .cart-item .btn-remove,
#view-ventas .carrito-item .btn-x {
  width: 28px !important;
  height: 28px !important;
  border-radius: 8px !important;
  background: rgba(239,68,68,0.15) !important;
  color: #fca5a5 !important;
  border: none !important;
  font-size: 14px !important;
  cursor: pointer !important;
}

/* Total permanente */
#view-ventas .cart-total,
#view-ventas .total-venta,
#view-ventas .venta-total {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  padding: 12px 14px !important;
  background: linear-gradient(135deg, #1e293b, #0f172a) !important;
  border: 1px solid rgba(59,130,246,0.35) !important;
  border-radius: 10px !important;
  margin-top: 4px !important;
}
#view-ventas .cart-total .label,
#view-ventas .total-venta .label {
  font-size: 14px !important;
  font-weight: 600 !important;
  color: #94a3b8 !important;
}
#view-ventas .cart-total .amount,
#view-ventas .total-venta .amount,
#view-ventas .total-venta strong {
  font-size: 22px !important;
  font-weight: 800 !important;
  color: #60a5fa !important;
  letter-spacing: -0.02em !important;
}

/* Botón Confirmar venta */
#view-ventas .btn-confirmar,
#view-ventas button[class*="confirmar"],
#view-ventas .cart button.primary,
#view-ventas .venta-actual button.btn-primary {
  width: 100% !important;
  height: 44px !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
  color: #fff !important;
  border: none !important;
  border-radius: 10px !important;
  cursor: pointer !important;
  margin-top: 4px !important;
}
#view-ventas .btn-confirmar:hover {
  filter: brightness(1.08) !important;
}

/* Mensajes de error debajo del carrito */
#view-ventas .cart-msg,
#view-ventas .venta-error,
#view-ventas .alert-error {
  font-size: 12px !important;
  color: #fca5a5 !important;
  line-height: 1.35 !important;
  margin-top: 4px !important;
}

/* ---- ELIMINAR FRANJA VERDE / residuales ---- */
#view-ventas .green-stripe,
#view-ventas .franja-verde,
#view-ventas .bottom-stripe,
#view-ventas .ventas-footer-stripe,
#view-ventas .panel-footer::before,
#view-ventas .panel-footer::after,
#view-ventas .cart::after,
#view-ventas .carrito::after,
#view-ventas .venta-actual::after {
  display: none !important;
  content: none !important;
  height: 0 !important;
  background: transparent !important;
  border: none !important;
}

/* Ocultar historial si existe en esta vista */
#view-ventas .historial-ventas,
#view-ventas .history-panel,
#view-ventas [data-section="historial"] {
  display: none !important;
}

/* Stock label */
#view-ventas .stock-info,
#view-ventas .stock-label {
  font-size: 12px !important;
  color: var(--m68-muted) !important;
  white-space: nowrap !important;
}

/* Forzar que ningún botón del header se desborde */
#view-ventas .ventas-header > *,
#view-ventas .pos-header > *,
#view-ventas .toolbar-ventas > * {
  min-width: 0 !important;
}
#view-ventas .ventas-header button span,
#view-ventas .pos-header button span,
#view-ventas .toolbar-ventas button span {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  max-width: 100% !important;
  display: inline-block !important;
}

/* Responsive: en pantallas medianas el carrito baja */
@media (max-width: 1100px) {
  #view-ventas .cart,
  #view-ventas .carrito,
  #view-ventas .venta-actual {
    position: relative !important;
    top: 0 !important;
    max-height: none !important;
  }
}
`;

  function inject() {
    let style = document.getElementById('m68-ventas-pos-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'm68-ventas-pos-css';
      document.head.appendChild(style);
    }
    style.textContent = CSS;

    // Asegurar que el version footer muestre la nueva
    document.querySelectorAll('.footnote, .app-footer-version, [class*="version"]').forEach(el => {
      if (el.textContent && el.textContent.includes('BattleCruiser')) {
        el.textContent = `v${VER} — BattleCruiser`;
      }
    });
  }

  // Forzar visibilidad de cantidades en el carrito (sin MutationObserver)
  function forceQtyVisible() {
    const root = document.getElementById('view-ventas') || document.querySelector('[data-view="ventas"]') || document.body;
    if (!root) return;
    // Cualquier span/input dentro de controles de cantidad
    root.querySelectorAll('.cart-item span, .carrito-item span, .item-venta span, .qty span, .cantidad span, .qty-value, [class*="qty"] span, [class*="cantidad"] span').forEach(el => {
      const t = (el.textContent || '').trim();
      if (/^\d+$/.test(t) || el.classList.contains('qty-value')) {
        el.style.setProperty('color', '#f8fafc', 'important');
        el.style.setProperty('-webkit-text-fill-color', '#f8fafc', 'important');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('background', '#0f172a', 'important');
        el.style.setProperty('font-weight', '700', 'important');
        el.style.setProperty('font-size', '14px', 'important');
        el.style.setProperty('min-width', '32px', 'important');
        el.style.setProperty('display', 'inline-flex', 'important');
        el.style.setProperty('align-items', 'center', 'important');
        el.style.setProperty('justify-content', 'center', 'important');
      }
    });
    // Inputs de cantidad
    root.querySelectorAll('.cart-item input[type="number"], .carrito-item input[type="number"], .item-venta input').forEach(inp => {
      inp.style.setProperty('color', '#f8fafc', 'important');
      inp.style.setProperty('-webkit-text-fill-color', '#f8fafc', 'important');
      inp.style.setProperty('opacity', '1', 'important');
      inp.style.setProperty('background', '#0f172a', 'important');
      inp.style.setProperty('font-weight', '700', 'important');
      inp.style.setProperty('text-align', 'center', 'important');
    });
  }

  // Boot inmediato + por si el DOM aún no está listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { inject(); forceQtyVisible(); });
  } else {
    inject();
    forceQtyVisible();
  }
  // Re-aplicar en momentos clave (sin observer continuo)
  setTimeout(() => { inject(); forceQtyVisible(); }, 300);
  setTimeout(() => { inject(); forceQtyVisible(); }, 1200);
  setTimeout(() => { inject(); forceQtyVisible(); }, 3000);

  // Cuando el usuario agrega productos, re-forzar una vez
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && (t.closest('#view-ventas') || t.closest('[data-view="ventas"]'))) {
      setTimeout(forceQtyVisible, 80);
      setTimeout(forceQtyVisible, 250);
    }
  }, { passive: true });

  console.info('[M68] Ventas POS Definitivo cargado', VER);
})();
