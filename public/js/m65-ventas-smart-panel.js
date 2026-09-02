// BattleCruiser M65 — Ventas Smart Panel
// Capa visual/UX sobre el DOM existente. No reemplaza lógica de negocio.
(function(){
  'use strict';
  var STYLE_ID='bc-m65-ventas-smart-style';
  if(window.__BC_M65) return;

  function styles(){
    if(document.getElementById(STYLE_ID)) return;
    var s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=[
      '#tab-ventas.bc-pos.visible{height:calc(100dvh - 86px)!important;min-height:0!important;max-height:calc(100dvh - 86px)!important;overflow:hidden!important;background:#07101d!important;color:#eef3fb}',
      '#tab-ventas.bc-pos #venta-operativa-bloque{height:100%!important;min-height:0!important;display:flex!important;flex-direction:column!important;gap:12px!important;overflow:hidden!important}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout{flex:1 1 auto!important;min-height:0!important;overflow:hidden!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(350px,410px)!important;gap:14px!important;align-items:stretch!important}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout .bc-venta-catalog-col{min-width:0!important;min-height:0!important;height:100%!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;background:linear-gradient(180deg,#0c1828,#08111e)!important;border:1px solid rgba(109,154,214,.16)!important;border-radius:16px!important;padding:14px!important;box-sizing:border-box!important;box-shadow:0 12px 30px rgba(0,0,0,.2)!important}',
      '#tab-ventas.bc-pos #bc-venta-cart-panel{min-width:0!important;min-height:0!important;height:100%!important;max-height:none!important;overflow:hidden!important;position:static!important;display:flex!important;flex-direction:column!important;padding:14px!important;border:1px solid rgba(109,154,214,.18)!important;border-radius:16px!important;background:linear-gradient(180deg,#111e30,#091321)!important;box-shadow:0 12px 30px rgba(0,0,0,.24)!important}',
      '#bc-venta-topbar{flex:0 0 auto!important;display:grid!important;grid-template-columns:auto minmax(160px,240px) minmax(240px,1fr) auto auto!important;grid-template-areas:"context title search policy close" "context cats cats cats cats"!important;align-items:center!important;gap:9px!important;margin:0!important;padding:10px 12px!important;border:1px solid rgba(109,154,214,.18)!important;border-radius:16px!important;background:rgba(8,18,31,.97)!important;box-shadow:0 10px 26px rgba(0,0,0,.24)!important;backdrop-filter:blur(14px)!important}',
      '#bc-venta-topbar .bc-m64-context{grid-area:context!important;display:flex!important;align-items:center!important;gap:7px!important;min-width:190px!important;padding:6px 10px!important;border-right:1px solid rgba(109,154,214,.12)!important}',
      '#bc-venta-topbar .bc-m64-context .venta-almacen-label{font:600 10px/1.2 Inter,system-ui,sans-serif!important;color:#7f91a8!important;letter-spacing:.04em!important;text-transform:uppercase!important}',
      '#bc-venta-topbar .bc-m64-context .venta-almacen-nombre{font:700 15px/1.15 Inter,system-ui,sans-serif!important;color:#edf4ff!important;font-family:Inter,system-ui,sans-serif!important}',
      '#bc-venta-topbar .bc-m64-title{grid-area:title!important;padding:0 4px!important;font:700 16px/1 Inter,system-ui,sans-serif!important;color:#edf4ff!important}',
      '#bc-venta-topbar #form-venta-linea{grid-area:search!important;display:flex!important;align-items:center!important;flex-wrap:nowrap!important;gap:8px!important;min-width:0!important;margin:0!important;padding:0!important}',
      '#bc-venta-topbar #form-venta-linea .venta-buscar-wrap{flex:1 1 auto!important;min-width:0!important}',
      '#bc-venta-topbar #venta-producto-buscar{height:42px!important;width:100%!important;box-sizing:border-box!important;border:1px solid rgba(109,154,214,.2)!important;border-radius:11px!important;background:#0d1b2c!important;color:#eef3fb!important;font-size:13px!important;padding:10px 13px!important}',
      '#bc-venta-topbar #venta-producto-buscar::placeholder{color:#64778f!important}',
      '#bc-venta-topbar #venta-cantidad{height:42px!important;width:70px!important;min-width:70px!important;border-radius:11px!important;background:#0d1b2c!important;border:1px solid rgba(109,154,214,.2)!important;color:#eef3fb!important}',
      '#bc-venta-topbar #form-venta-linea button[type=submit]{height:42px!important;min-width:92px!important;border-radius:11px!important;background:linear-gradient(180deg,#1672f6,#0c5fe0)!important;color:#fff!important;font-weight:700!important;border:1px solid rgba(43,126,255,.48)!important}',
      '#bc-venta-topbar #bc-m275-policy{grid-area:policy!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;min-height:38px!important;padding:5px 10px!important;margin:0!important;border:1px solid rgba(109,154,214,.16)!important;border-radius:11px!important;background:#0d1b2c!important;color:#d3ddec!important;font-size:11px!important}',
      '#bc-venta-topbar #bc-m273-cerrar-sesion-btn{grid-area:close!important;display:block!important;height:42px!important;min-width:105px!important;margin:0!important;padding:8px 13px!important;border-radius:11px!important;white-space:nowrap!important}',
      '#bc-venta-topbar #catalogo-categorias{grid-area:cats!important;display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important;overflow-x:auto!important;overflow-y:hidden!important;margin:0!important;padding:2px 0 0!important;border:0!important;scrollbar-width:none!important}',
      '#bc-venta-topbar #catalogo-categorias::-webkit-scrollbar{display:none!important}',
      '#bc-venta-topbar #catalogo-categorias .catalogo-chip{flex:0 0 auto!important;min-height:32px!important;padding:7px 12px!important;border:1px solid rgba(109,154,214,.16)!important;border-radius:999px!important;background:#0d1b2c!important;color:#a9b9cc!important;font-size:11px!important;font-weight:600!important}',
      '#bc-venta-productos-scroll{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;padding:3px 2px 12px!important;scrollbar-width:thin!important;scrollbar-color:rgba(97,129,168,.55) transparent!important}',
      '#bc-venta-productos-scroll #catalogo-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;align-content:start!important;margin:0!important;padding:0 0 8px!important;width:100%!important;box-sizing:border-box!important}',
      '#bc-venta-productos-scroll .catalogo-card{display:grid!important;grid-template-columns:64px minmax(0,1fr) 34px!important;grid-template-rows:auto auto auto!important;column-gap:10px!important;row-gap:3px!important;align-items:center!important;min-width:0!important;min-height:118px!important;padding:11px!important;border:1px solid rgba(109,154,214,.15)!important;border-radius:12px!important;background:linear-gradient(180deg,#101f33,#0b1829)!important;color:#edf3fb!important;overflow:visible!important;box-sizing:border-box!important;box-shadow:0 7px 16px rgba(0,0,0,.14)!important}',
      '#bc-venta-productos-scroll .catalogo-card:hover{transform:translateY(-1px)!important;border-color:rgba(45,129,255,.45)!important}',
      '#bc-venta-productos-scroll .catalogo-card-img{grid-column:1!important;grid-row:1 / span 3!important;width:64px!important;height:80px!important;object-fit:contain!important;object-position:center!important;border-radius:10px!important;background:rgba(255,255,255,.035)!important;display:block!important}',
      '#bc-venta-productos-scroll .catalogo-card-img-vacia{grid-column:1!important;grid-row:1 / span 3!important;height:80px!important;width:64px!important;border-radius:10px!important;background:rgba(255,255,255,.025)!important}',
      '#bc-venta-productos-scroll .catalogo-card-nombre{grid-column:2!important;grid-row:1!important;margin:0!important;font:700 12px/1.25 Inter,system-ui,sans-serif!important;color:#edf3fb!important;display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;overflow:hidden!important}',
      '#bc-venta-productos-scroll .catalogo-card-stock{grid-column:2!important;grid-row:2!important;margin:0!important;font:500 10px/1.2 Inter,system-ui,sans-serif!important;color:#7e93ab!important}',
      '#bc-venta-productos-scroll .catalogo-card-precio{grid-column:2!important;grid-row:3!important;margin:4px 0 0!important;font:800 15px/1 Inter,system-ui,sans-serif!important;color:#f2f7ff!important}',
      '#bc-venta-productos-scroll .catalogo-card-categoria{display:none!important}',
      '#bc-venta-productos-scroll .catalogo-card-cta{grid-column:3!important;grid-row:3!important;align-self:end!important;justify-self:end!important;width:34px!important;height:34px!important;display:grid!important;place-items:center!important;margin:0!important;padding:0!important;border:1px solid rgba(43,126,255,.58)!important;border-radius:9px!important;background:linear-gradient(180deg,#1676f7,#0b61e4)!important;color:#fff!important;font-size:0!important}',
      '#bc-venta-productos-scroll .catalogo-card-cta::before{content:"+"!important;font:700 22px/1 Inter,system-ui,sans-serif!important}',
      '#bc-venta-cart-panel .bc-cart-title{flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:space-between!important;margin:0 0 8px!important;padding:2px 2px 10px!important;border-bottom:1px solid rgba(109,154,214,.12)!important;font:800 20px/1.1 Inter,system-ui,sans-serif!important;color:#f2f6fc!important}',
      '#bc-venta-cart-panel #venta-lineas{flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;margin:0!important;padding:2px 0 8px!important;display:flex!important;flex-direction:column!important;gap:6px!important;scrollbar-width:none!important}',
      '#bc-venta-cart-panel #venta-lineas::-webkit-scrollbar{display:none!important}',
      '#bc-venta-cart-panel #venta-lineas .lista-item{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto!important;align-items:center!important;gap:7px!important;padding:9px 8px!important;border:1px solid rgba(109,154,214,.1)!important;border-radius:10px!important;background:rgba(11,24,40,.86)!important}',
      '#bc-venta-cart-panel .venta-linea-btn{width:30px!important;height:30px!important;min-width:30px!important;border-radius:8px!important}',
      '#bc-venta-cart-panel .venta-linea-cant-input{width:40px!important;height:30px!important;font-size:12px!important;border-radius:8px!important}',
      '#bc-venta-cart-panel .venta-linea-borrar{min-width:30px!important;width:30px!important;height:30px!important;padding:0!important;border-radius:8px!important;font-size:0!important}',
      '#bc-venta-cart-panel .venta-linea-borrar::before{content:"×"!important;font:700 18px/1 Inter,system-ui,sans-serif!important}',
      '#bc-venta-cart-panel .bc-cart-footer{flex:0 0 auto!important;display:flex!important;flex-direction:column!important;gap:9px!important;padding-top:8px!important;border-top:1px solid rgba(109,154,214,.12)!important}',
      '#bc-venta-cart-panel #venta-total-wrap{margin:0!important;padding:11px 12px!important;border:1px solid rgba(109,154,214,.12)!important;border-radius:11px!important;background:linear-gradient(180deg,#112136,#0d1b2d)!important;box-sizing:border-box!important;overflow:visible!important}',
      '#bc-venta-cart-panel #venta-total-wrap .venta-total{margin:0!important;padding:0!important;background:transparent!important;border:0!important}',
      '#bc-venta-cart-panel #venta-total-wrap .venta-total-valor{font:800 31px/1 Inter,system-ui,sans-serif!important;color:#2580ff!important;letter-spacing:-.04em!important}',
      '#bc-venta-cart-panel #btn-confirmar-venta{height:48px!important;min-height:48px!important;width:100%!important;margin:0!important;border-radius:11px!important;background:linear-gradient(180deg,#1676f7,#0c61e4)!important;color:#fff!important;font:800 15px/1 Inter,system-ui,sans-serif!important;border:1px solid rgba(69,150,255,.65)!important;box-shadow:0 10px 20px rgba(16,101,231,.24)!important}',
      '@media(max-width:1180px){#bc-venta-topbar{grid-template-columns:auto minmax(150px,1fr) minmax(220px,1.4fr) auto!important;grid-template-areas:"context title search close" "context cats cats policy"!important}#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}#tab-ventas.bc-pos #bc-venta-pos-layout{grid-template-columns:minmax(0,1fr) minmax(320px,36%)!important}}',
      '@media(max-width:900px){#tab-ventas.bc-pos #bc-venta-pos-layout{grid-template-columns:1fr!important;grid-template-rows:minmax(0,1fr) auto!important;gap:9px!important}#tab-ventas.bc-pos #bc-venta-cart-panel{height:auto!important;max-height:39dvh!important}#bc-venta-topbar{grid-template-columns:1fr auto!important;grid-template-areas:"context close" "title policy" "search search" "cats cats"!important}#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}',
      '@media(max-width:560px){#bc-venta-topbar{grid-template-columns:1fr!important;grid-template-areas:"context" "title" "search" "policy" "cats" "close"!important}#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:1fr!important}}'
    ].join('');
    document.head.appendChild(s);
  }

  function decorate(){
    var cart=document.getElementById('bc-venta-cart-panel');
    if(!cart) return;
    var title=cart.querySelector('.bc-cart-title');
    if(title && !title.dataset.m65Title){
      title.dataset.m65Title='1';
      if((title.textContent||'').trim().toLowerCase()==='carrito') title.textContent='Venta actual';
    }
  }

  function boot(){styles();decorate();}
  var obs=new MutationObserver(function(){var tab=document.getElementById('tab-ventas');if(tab&&tab.classList.contains('visible')) boot();});
  obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,800);}); else setTimeout(boot,800);
  window.__BC_M65={version:'65.1',boot:boot};
})();