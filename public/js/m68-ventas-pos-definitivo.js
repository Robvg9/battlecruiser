// BattleCruiser M68 — Smart POS definitivo
// Una sola autoridad visual de Ventas. No MutationObserver global.
// No altera lógica de negocio (stock, precios, registrar_venta, turnos).
(function () {
  'use strict';
  if (window.__BC_M68) return;
  window.__BC_M68 = true;

  var STYLE_ID = 'bc-m68-pos-definitivo';
  var booted = false;

  function css() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      /* ===== CONTENEDOR PRINCIPAL ===== */
      '#tab-ventas.bc-pos.visible{',
      '  height:calc(100dvh - 96px)!important;max-height:calc(100dvh - 96px)!important;',
      '  min-height:0!important;overflow:hidden!important;',
      '  display:flex!important;flex-direction:column!important;',
      '  background:#070f1a!important;color:#e8eef8!important;',
      '  padding:8px 10px 10px!important;box-sizing:border-box!important;',
      '}',
      '#tab-ventas.bc-pos #venta-operativa-bloque{',
      '  flex:1 1 auto!important;min-height:0!important;height:100%!important;',
      '  display:flex!important;flex-direction:column!important;',
      '  gap:8px!important;overflow:hidden!important;margin:0!important;padding:0!important;',
      '}',

      /* ===== HEADER COMPACTO (una sola franja) ===== */
      '#bc-venta-topbar{',
      '  flex:0 0 auto!important;display:grid!important;',
      '  grid-template-columns:minmax(140px,180px) minmax(0,1fr) auto auto auto!important;',
      '  grid-template-areas:"ctx search qty add close"!important;',
      '  align-items:center!important;gap:8px!important;',
      '  min-height:48px!important;height:auto!important;max-height:none!important;',
      '  margin:0!important;padding:6px 10px!important;',
      '  border:1px solid rgba(90,130,180,.18)!important;border-radius:12px!important;',
      '  background:linear-gradient(180deg,#0c1828,#0a1420)!important;',
      '  box-shadow:0 4px 16px rgba(0,0,0,.2)!important;overflow:visible!important;',
      '}',
      '#bc-venta-topbar .bc-m64-context{',
      '  grid-area:ctx!important;min-width:0!important;max-width:180px!important;',
      '  display:flex!important;flex-direction:column!important;justify-content:center!important;',
      '  gap:1px!important;padding:2px 8px 2px 0!important;margin:0!important;',
      '  border-right:1px solid rgba(90,130,180,.14)!important;overflow:hidden!important;',
      '  height:auto!important;',
      '}',
      '#bc-venta-topbar .bc-m64-title{display:none!important}',
      '#bc-venta-topbar .bc-m64-context .venta-almacen-label{',
      '  font:600 9px/1.1 Inter,system-ui,sans-serif!important;',
      '  color:#6b7f96!important;letter-spacing:.06em!important;text-transform:uppercase!important;',
      '  white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;',
      '}',
      '#bc-venta-topbar .bc-m64-context .venta-almacen-nombre{',
      '  font:700 13px/1.15 Inter,system-ui,sans-serif!important;color:#eef4ff!important;',
      '  white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;',
      '}',

      /* Formulario de búsqueda: ocupa el espacio central */
      '#bc-venta-topbar #form-venta-linea{',
      '  grid-area:search!important;display:flex!important;align-items:center!important;',
      '  flex-wrap:nowrap!important;gap:6px!important;min-width:0!important;width:100%!important;',
      '  height:40px!important;margin:0!important;padding:0!important;',
      '  background:transparent!important;border:0!important;',
      '}',
      '#bc-venta-topbar #form-venta-linea .venta-buscar-wrap{',
      '  position:relative!important;flex:1 1 auto!important;min-width:0!important;',
      '  display:block!important;width:auto!important;',
      '}',
      '#bc-venta-topbar #venta-producto-buscar{',
      '  display:block!important;width:100%!important;min-width:0!important;',
      '  height:40px!important;max-width:none!important;box-sizing:border-box!important;',
      '  padding:8px 14px!important;border-radius:10px!important;',
      '  font:500 13px/1.2 Inter,system-ui,sans-serif!important;color:#f4f7fc!important;',
      '  background:#0e1d30!important;border:1px solid rgba(91,132,182,.35)!important;outline:none!important;',
      '}',
      '#bc-venta-topbar #venta-producto-buscar:focus{',
      '  border-color:rgba(37,128,255,.8)!important;box-shadow:0 0 0 2px rgba(37,128,255,.15)!important;',
      '}',
      '#bc-venta-topbar #venta-producto-buscar::placeholder{color:#5e728a!important}',
      '#bc-venta-topbar #venta-producto-resultados{',
      '  position:absolute!important;left:0!important;right:0!important;top:44px!important;',
      '  z-index:400!important;max-height:280px!important;overflow-y:auto!important;',
      '  border:1px solid rgba(91,132,182,.3)!important;border-radius:10px!important;',
      '  background:#0d1b2c!important;box-shadow:0 16px 36px rgba(0,0,0,.45)!important;',
      '}',
      '#bc-venta-topbar #venta-cantidad{',
      '  flex:0 0 56px!important;width:56px!important;min-width:56px!important;',
      '  height:40px!important;box-sizing:border-box!important;text-align:center!important;',
      '  padding:6px 4px!important;border-radius:10px!important;',
      '  font:600 13px/1 Inter,system-ui,sans-serif!important;color:#f4f7fc!important;',
      '  background:#0e1d30!important;border:1px solid rgba(91,132,182,.35)!important;',
      '}',
      '#bc-venta-topbar #venta-presentacion{',
      '  flex:0 0 96px!important;width:96px!important;min-width:96px!important;',
      '  height:40px!important;box-sizing:border-box!important;',
      '  color:#f4f7fc!important;background:#0e1d30!important;',
      '  border:1px solid rgba(91,132,182,.35)!important;border-radius:10px!important;',
      '  font-size:12px!important;',
      '}',
      '#bc-venta-topbar #form-venta-linea button[type=submit]{',
      '  flex:0 0 auto!important;min-width:110px!important;width:auto!important;',
      '  height:40px!important;min-height:40px!important;margin:0!important;',
      '  padding:0 14px!important;border-radius:10px!important;',
      '  font:700 12px/1 Inter,system-ui,sans-serif!important;white-space:nowrap!important;',
      '  background:linear-gradient(180deg,#1a7af8,#0c62e4)!important;color:#fff!important;',
      '  border:1px solid rgba(50,140,255,.5)!important;overflow:visible!important;',
      '  text-overflow:clip!important;',
      '}',

      /* Policy + Cerrar sesión: anchos fijos suficientes, texto completo */
      '#bc-venta-topbar #bc-m275-policy{',
      '  grid-area:qty!important;min-width:100px!important;width:auto!important;max-width:140px!important;',
      '  height:40px!important;min-height:40px!important;margin:0!important;',
      '  padding:4px 10px!important;display:flex!important;align-items:center!important;',
      '  justify-content:center!important;box-sizing:border-box!important;',
      '  border-radius:10px!important;white-space:nowrap!important;overflow:hidden!important;',
      '  text-overflow:ellipsis!important;font-size:11px!important;',
      '  background:#0e1d30!important;border:1px solid rgba(91,132,182,.25)!important;color:#c8d4e4!important;',
      '}',
      '#bc-venta-topbar #bc-m273-cerrar-sesion-btn{',
      '  grid-area:close!important;min-width:128px!important;width:auto!important;',
      '  height:40px!important;min-height:40px!important;margin:0!important;',
      '  padding:0 14px!important;display:inline-flex!important;align-items:center!important;',
      '  justify-content:center!important;box-sizing:border-box!important;',
      '  border-radius:10px!important;white-space:nowrap!important;overflow:visible!important;',
      '  text-overflow:clip!important;font:600 12px/1 Inter,system-ui,sans-serif!important;',
      '  background:#3a1520!important;color:#ffb4bc!important;',
      '  border:1px solid rgba(220,80,90,.4)!important;',
      '}',

      /* Categorías: segunda franja compacta bajo el topbar */
      '#bc-venta-topbar #catalogo-categorias{display:none!important}',
      '#bc-m66-head{',
      '  display:flex!important;align-items:center!important;justify-content:space-between!important;',
      '  gap:8px!important;padding:0 2px 6px!important;min-height:32px!important;flex:0 0 auto!important;',
      '}',
      '#bc-m66-head #bc-m64-add-title{',
      '  font:700 15px/1 Inter,system-ui,sans-serif!important;color:#e8eef8!important;',
      '  margin:0!important;padding:0!important;white-space:nowrap!important;',
      '}',
      '#bc-m66-head #venta-stock-disponible{',
      '  font:500 10px/1 Inter,system-ui,sans-serif!important;color:#6b7f96!important;',
      '  margin:0!important;white-space:nowrap!important;',
      '}',
      '#bc-m66-head #catalogo-categorias{',
      '  display:flex!important;align-items:center!important;gap:5px!important;',
      '  min-width:0!important;flex:1 1 auto!important;justify-content:flex-end!important;',
      '  overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important;',
      '}',
      '#bc-m66-head #catalogo-categorias::-webkit-scrollbar{display:none!important}',
      '#bc-m66-head .catalogo-chip{',
      '  flex:0 0 auto!important;min-height:28px!important;height:28px!important;',
      '  padding:0 11px!important;border-radius:8px!important;',
      '  font:600 11px/28px Inter,system-ui,sans-serif!important;',
      '  background:#0e1d30!important;color:#9aadc2!important;',
      '  border:1px solid rgba(90,130,180,.2)!important;white-space:nowrap!important;',
      '}',
      '#bc-m66-head .catalogo-chip.activo,',
      '#bc-m66-head .catalogo-chip.active,',
      '#bc-m66-head .catalogo-chip[aria-pressed="true"]{',
      '  background:rgba(25,120,248,.18)!important;color:#7eb6ff!important;',
      '  border-color:rgba(40,130,255,.45)!important;',
      '}',

      /* ===== LAYOUT 2 COLUMNAS ===== */
      '#tab-ventas.bc-pos #bc-venta-pos-layout{',
      '  flex:1 1 auto!important;min-height:0!important;overflow:hidden!important;',
      '  display:grid!important;grid-template-columns:minmax(0,1fr) 340px!important;',
      '  gap:10px!important;align-items:stretch!important;',
      '}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout .bc-venta-catalog-col{',
      '  min-width:0!important;min-height:0!important;height:100%!important;overflow:hidden!important;',
      '  display:flex!important;flex-direction:column!important;',
      '  padding:10px!important;border-radius:14px!important;',
      '  background:linear-gradient(180deg,#0c1828,#08111e)!important;',
      '  border:1px solid rgba(90,130,180,.16)!important;',
      '  box-sizing:border-box!important;',
      '}',

      /* ===== SCROLL SOLO EN PRODUCTOS ===== */
      '#bc-venta-productos-scroll{',
      '  flex:1 1 auto!important;min-height:0!important;',
      '  overflow-y:auto!important;overflow-x:hidden!important;',
      '  padding:2px 2px 8px!important;',
      '  scrollbar-width:thin!important;scrollbar-color:rgba(90,130,180,.45) transparent!important;',
      '}',
      '#bc-venta-productos-scroll #catalogo-grid{',
      '  display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;',
      '  gap:8px!important;align-content:start!important;margin:0!important;padding:0!important;',
      '  width:100%!important;box-sizing:border-box!important;',
      '}',
      '#bc-venta-productos-scroll .catalogo-card{',
      '  display:grid!important;grid-template-columns:56px minmax(0,1fr) 30px!important;',
      '  grid-template-rows:auto auto auto!important;column-gap:8px!important;row-gap:2px!important;',
      '  align-items:center!important;min-width:0!important;min-height:108px!important;',
      '  height:auto!important;padding:8px!important;box-sizing:border-box!important;',
      '  border:1px solid rgba(90,130,180,.14)!important;border-radius:11px!important;',
      '  background:linear-gradient(180deg,#101f33,#0b1829)!important;',
      '  overflow:hidden!important;color:#edf3fb!important;',
      '}',
      '#bc-venta-productos-scroll .catalogo-card:hover{',
      '  border-color:rgba(40,130,255,.45)!important;transform:translateY(-1px)!important;',
      '}',
      '#bc-venta-productos-scroll .catalogo-card-img,',
      '#bc-venta-productos-scroll .catalogo-card-img-vacia{',
      '  grid-column:1!important;grid-row:1 / span 3!important;',
      '  width:56px!important;height:72px!important;max-height:72px!important;',
      '  object-fit:contain!important;object-position:center!important;',
      '  border-radius:8px!important;background:rgba(255,255,255,.03)!important;display:block!important;',
      '}',
      '#bc-venta-productos-scroll .catalogo-card-nombre{',
      '  grid-column:2!important;grid-row:1!important;margin:0!important;',
      '  font:700 11px/1.25 Inter,system-ui,sans-serif!important;color:#edf3fb!important;',
      '  display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;',
      '  overflow:hidden!important;min-height:0!important;',
      '}',
      '#bc-venta-productos-scroll .catalogo-card-stock{',
      '  grid-column:2!important;grid-row:2!important;margin:0!important;',
      '  font:500 9px/1.15 Inter,system-ui,sans-serif!important;color:#7a90a8!important;',
      '}',
      '#bc-venta-productos-scroll .catalogo-card-precio{',
      '  grid-column:2!important;grid-row:3!important;margin:2px 0 0!important;',
      '  font:800 14px/1 Inter,system-ui,sans-serif!important;color:#f2f7ff!important;',
      '}',
      '#bc-venta-productos-scroll .catalogo-card-categoria{display:none!important}',
      '#bc-venta-productos-scroll .catalogo-card-cta{',
      '  grid-column:3!important;grid-row:3!important;align-self:end!important;justify-self:end!important;',
      '  width:30px!important;height:30px!important;min-height:30px!important;margin:0!important;padding:0!important;',
      '  display:grid!important;place-items:center!important;',
      '  border:1px solid rgba(43,126,255,.55)!important;border-radius:8px!important;',
      '  background:linear-gradient(180deg,#1676f7,#0b61e4)!important;color:#fff!important;font-size:0!important;',
      '}',
      '#bc-venta-productos-scroll .catalogo-card-cta::before{',
      '  content:"+"!important;font:700 20px/1 Inter,system-ui,sans-serif!important;',
      '}',

      /* ===== CARRITO FIJO ===== */
      '#tab-ventas.bc-pos #bc-venta-cart-panel{',
      '  min-width:0!important;min-height:0!important;height:100%!important;max-height:none!important;',
      '  overflow:hidden!important;position:static!important;',
      '  display:flex!important;flex-direction:column!important;',
      '  padding:12px!important;border-radius:14px!important;',
      '  background:linear-gradient(180deg,#111e30,#091321)!important;',
      '  border:1px solid rgba(90,130,180,.18)!important;',
      '  box-sizing:border-box!important;',
      '}',
      '#bc-venta-cart-panel .bc-cart-title{',
      '  flex:0 0 auto!important;margin:0 0 8px!important;padding:0 0 8px!important;',
      '  border-bottom:1px solid rgba(90,130,180,.12)!important;',
      '  font:800 17px/1.1 Inter,system-ui,sans-serif!important;color:#f2f6fc!important;',
      '}',
      '#bc-venta-cart-panel #venta-lineas{',
      '  flex:1 1 auto!important;min-height:0!important;max-height:none!important;',
      '  overflow-y:auto!important;overflow-x:hidden!important;',
      '  margin:0!important;padding:2px 0 6px!important;',
      '  display:flex!important;flex-direction:column!important;gap:5px!important;',
      '  scrollbar-width:thin!important;scrollbar-color:rgba(90,130,180,.4) transparent!important;',
      '}',
      '#bc-venta-cart-panel #venta-lineas .lista-item{',
      '  display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;',
      '  grid-template-rows:auto auto!important;gap:4px 6px!important;',
      '  min-height:48px!important;padding:8px!important;box-sizing:border-box!important;',
      '  border-radius:9px!important;border:1px solid rgba(90,130,180,.1)!important;',
      '  background:rgba(11,24,40,.88)!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-info{',
      '  min-width:0!important;display:flex!important;flex-direction:column!important;gap:1px!important;',
      '  overflow:hidden!important;color:#f1f5fb!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-info > span:first-child{',
      '  font:700 12px/1.2 Inter,system-ui,sans-serif!important;color:#f1f5fb!important;',
      '  white-space:normal!important;overflow:hidden!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-info .muted{',
      '  font:500 10px/1.15 Inter,system-ui,sans-serif!important;color:#7e93ab!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-precios{',
      '  display:flex!important;align-items:center!important;gap:4px!important;',
      '  grid-column:1 / -1!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-cant-wrap{',
      '  display:flex!important;align-items:center!important;gap:3px!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-btn{',
      '  width:28px!important;height:28px!important;min-width:28px!important;min-height:28px!important;',
      '  padding:0!important;border-radius:7px!important;',
      '  background:#17304f!important;color:#fff!important;',
      '  border:1px solid rgba(75,126,184,.4)!important;',
      '  display:grid!important;place-items:center!important;',
      '  font:700 16px/1 Inter,system-ui,sans-serif!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-cant-input{',
      '  width:40px!important;min-width:40px!important;height:28px!important;',
      '  box-sizing:border-box!important;text-align:center!important;',
      '  color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;',
      '  background:#0d1b2c!important;border:1px solid rgba(90,130,180,.35)!important;',
      '  border-radius:7px!important;font:800 13px/1 Inter,system-ui,sans-serif!important;',
      '  opacity:1!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-precios > .muted{',
      '  min-width:56px!important;text-align:right!important;',
      '  color:#c8d6e8!important;font:600 11px/1 Inter,system-ui,sans-serif!important;',
      '  white-space:nowrap!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-borrar{',
      '  width:28px!important;min-width:28px!important;height:28px!important;',
      '  padding:0!important;border-radius:7px!important;font-size:0!important;',
      '  background:#4a1820!important;color:#ffb7bd!important;',
      '  border:1px solid rgba(255,90,105,.35)!important;',
      '}',
      '#bc-venta-cart-panel .venta-linea-borrar::before{',
      '  content:"×"!important;font:700 18px/1 Inter,system-ui,sans-serif!important;',
      '}',

      /* Checkout siempre visible */
      '#bc-venta-cart-panel .bc-cart-footer{',
      '  flex:0 0 auto!important;display:flex!important;flex-direction:column!important;',
      '  gap:8px!important;padding-top:8px!important;',
      '  border-top:1px solid rgba(90,130,180,.12)!important;',
      '}',
      '#bc-venta-cart-panel #venta-total-wrap{',
      '  margin:0!important;padding:10px 12px!important;min-height:52px!important;',
      '  box-sizing:border-box!important;overflow:visible!important;',
      '  border:1px solid rgba(90,130,180,.12)!important;border-radius:11px!important;',
      '  background:linear-gradient(180deg,#112136,#0d1b2d)!important;',
      '}',
      '#bc-venta-cart-panel #venta-total-wrap .venta-total{',
      '  margin:0!important;padding:0!important;background:transparent!important;border:0!important;',
      '}',
      '#bc-venta-cart-panel #venta-total-wrap .venta-total-valor{',
      '  font:800 28px/1 Inter,system-ui,sans-serif!important;color:#2b83ff!important;',
      '  letter-spacing:-.03em!important;',
      '}',
      '#bc-venta-cart-panel #btn-confirmar-venta{',
      '  height:48px!important;min-height:48px!important;width:100%!important;margin:0!important;',
      '  border-radius:11px!important;',
      '  background:linear-gradient(180deg,#1a7af8,#0c62e4)!important;color:#fff!important;',
      '  font:800 14px/1 Inter,system-ui,sans-serif!important;',
      '  border:1px solid rgba(60,140,255,.55)!important;',
      '  box-shadow:0 8px 20px rgba(16,101,231,.28)!important;',
      '}',

      /* Historial fuera del POS */
      '#tab-ventas.bc-pos h3{',
      '  /* hide "Historial de ventas" heading if still in DOM */
      '}',
      '#tab-ventas.bc-pos .ventas-historial-controles,',
      '#tab-ventas.bc-pos #lista-ventas{display:none!important}',

      /* ===== BREAKPOINTS ===== */
      '@media(max-width:1280px){',
      '  #bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}',
      '  #tab-ventas.bc-pos #bc-venta-pos-layout{grid-template-columns:minmax(0,1fr) 320px!important}',
      '}',
      '@media(max-width:1100px){',
      '  #bc-venta-topbar{',
      '    grid-template-columns:minmax(120px,160px) minmax(0,1fr) auto!important;',
      '    grid-template-areas:"ctx search close"!important;',
      '  }',
      '  #bc-venta-topbar #bc-m275-policy{display:none!important}',
      '  #bc-venta-topbar #venta-presentacion{display:none!important}',
      '  #bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}',
      '}',
      '@media(max-width:900px){',
      '  #tab-ventas.bc-pos #bc-venta-pos-layout{',
      '    grid-template-columns:1fr!important;grid-template-rows:minmax(0,1fr) auto!important;',
      '  }',
      '  #tab-ventas.bc-pos #bc-venta-cart-panel{height:auto!important;max-height:36dvh!important}',
      '  #bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}',
      '  #bc-venta-topbar{',
      '    grid-template-columns:minmax(0,1fr) auto!important;',
      '    grid-template-areas:"ctx close" "search search"!important;',
      '    min-height:88px!important;',
      '  }',
      '}',
      '@media(max-width:560px){',
      '  #bc-venta-topbar{',
      '    grid-template-columns:1fr!important;',
      '    grid-template-areas:"ctx" "search" "close"!important;',
      '  }',
      '  #bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  function hideHistory(tab) {
    if (!tab) return;
    tab.querySelectorAll('h3').forEach(function (h) {
      var t = (h.textContent || '').trim().toLowerCase();
      if (t === 'historial de ventas' || t.indexOf('historial') === 0) {
        h.style.display = 'none';
        h.hidden = true;
        var n = h.nextElementSibling;
        if (n && (n.classList.contains('ventas-historial-controles') || n.id === 'lista-ventas')) {
          n.style.display = 'none';
          n.hidden = true;
        }
      }
    });
    var list = document.getElementById('lista-ventas');
    if (list) { list.style.display = 'none'; list.hidden = true; }
    var cont = tab.querySelector('.ventas-historial-controles');
    if (cont) { cont.style.display = 'none'; cont.hidden = true; }
  }

  function ensureCerrarLabel() {
    var btn = document.getElementById('bc-m273-cerrar-sesion-btn');
    if (!btn) return;
    var t = (btn.textContent || '').trim();
    if (t.indexOf('Cerrar') === 0 && t.length < 14) {
      btn.textContent = 'Cerrar sesión';
    }
  }

  function boot() {
    var tab = document.getElementById('tab-ventas');
    if (!tab) return false;
    css();
    hideHistory(tab);
    ensureCerrarLabel();
    booted = true;
    return true;
  }

  // Arranque limitado — sin MutationObserver sobre body
  var tries = 0;
  function start() {
    if (boot() || tries >= 24) return;
    tries++;
    setTimeout(start, 200);
  }

  // Re-aplicar solo al cambiar a la pestaña Ventas (evento ligero)
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.tab-btn[data-tab="ventas"], [data-tab="ventas"]') : null;
    if (t) setTimeout(function () { boot(); }, 80);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 400); });
  } else {
    setTimeout(start, 400);
  }

  window.__BC_M68 = { version: '68.1', boot: boot };
})();
