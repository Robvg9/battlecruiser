// BattleCruiser M67 — Ventas UX Compact
// Ajuste visual final sobre M64/M65/M66. No altera lógica de negocio.
(function(){
  'use strict';
  if(window.__BC_M67)return;
  window.__BC_M67=true;
  var STYLE='bc-m67-sales-compact';

  function hideHistory(tab){
    tab.querySelectorAll('h3').forEach(function(h){
      if((h.textContent||'').trim().toLowerCase()==='historial de ventas'){
        h.hidden=true;
        var n=h.nextElementSibling;
        if(n && n.classList.contains('ventas-historial-controles')) n.hidden=true;
      }
    });
    var list=document.getElementById('lista-ventas');
    if(list) list.hidden=true;
  }

  function css(){
    if(document.getElementById(STYLE))return;
    var s=document.createElement('style');
    s.id=STYLE;
    s.textContent=[
      '#tab-ventas.bc-pos.visible{height:calc(100dvh - 110px)!important;max-height:calc(100dvh - 110px)!important;overflow:hidden!important}',
      '#tab-ventas.bc-pos #venta-operativa-bloque{gap:7px!important;overflow:hidden!important}',

      /* CABECERA: compacta, dividida por bloques, una sola fila */
      '#bc-venta-topbar{display:grid!important;grid-template-columns:205px minmax(320px,1fr) 172px 112px!important;grid-template-areas:"ctx form policy close"!important;align-items:center!important;gap:7px!important;min-height:54px!important;height:54px!important;padding:6px 8px!important;border-radius:13px!important;overflow:visible!important}',
      '#bc-venta-topbar .bc-m64-context{grid-area:ctx!important;min-width:0!important;height:40px!important;display:flex!important;align-items:center!important;padding:4px 9px!important;box-sizing:border-box!important;overflow:hidden!important;border-right:1px solid rgba(100,140,190,.14)!important}',
      '#bc-venta-topbar .bc-m64-title{display:none!important}',
      '#bc-venta-topbar #form-venta-linea{grid-area:form!important;display:grid!important;grid-template-columns:minmax(0,1fr) 58px 100px!important;align-items:center!important;gap:7px!important;width:100%!important;min-width:0!important;height:40px!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important}',
      '#bc-venta-topbar #form-venta-linea .venta-buscar-wrap{position:relative!important;display:block!important;width:100%!important;min-width:0!important;flex:none!important}',
      '#bc-venta-topbar #venta-producto-buscar{display:block!important;width:100%!important;min-width:0!important;height:40px!important;max-width:none!important;box-sizing:border-box!important;padding:9px 13px!important;border-radius:10px!important;font-size:13px!important;color:#f4f7fc!important;background:#0e1d30!important;border:1px solid rgba(91,132,182,.33)!important;outline:none!important}',
      '#bc-venta-topbar #venta-producto-buscar:focus{border-color:rgba(37,128,255,.75)!important;box-shadow:0 0 0 2px rgba(37,128,255,.13)!important}',
      '#bc-venta-topbar #venta-producto-resultados{position:absolute!important;left:0!important;right:0!important;top:44px!important;z-index:300!important;max-height:260px!important;overflow-y:auto!important;border:1px solid rgba(91,132,182,.28)!important;border-radius:10px!important;background:#0d1b2c!important;box-shadow:0 14px 32px rgba(0,0,0,.38)!important}',
      '#bc-venta-topbar #venta-cantidad{width:58px!important;min-width:58px!important;height:40px!important;box-sizing:border-box!important;text-align:center!important;padding:8px 5px!important;color:#f4f7fc!important;background:#0e1d30!important;border:1px solid rgba(91,132,182,.33)!important;border-radius:10px!important}',
      '#bc-venta-topbar #venta-presentacion{display:block!important;width:100px!important;min-width:100px!important;height:40px!important;box-sizing:border-box!important;color:#f4f7fc!important;background:#0e1d30!important;border:1px solid rgba(91,132,182,.33)!important;border-radius:10px!important}',
      '#bc-venta-topbar #form-venta-linea button[type=submit]{width:100%!important;min-width:100px!important;height:40px!important;min-height:40px!important;margin:0!important;padding:8px 7px!important;border-radius:10px!important;font-size:12px!important;line-height:1.1!important;white-space:nowrap!important;background:linear-gradient(180deg,#1979f8,#0c62e4)!important;color:#fff!important;overflow:hidden!important;text-overflow:ellipsis!important}',
      '#bc-venta-topbar #bc-m275-policy{grid-area:policy!important;min-width:0!important;width:100%!important;height:40px!important;min-height:40px!important;margin:0!important;padding:5px 7px!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;border-radius:10px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:10px!important;background:#0e1d30!important}',
      '#bc-venta-topbar #bc-m273-cerrar-sesion-btn{grid-area:close!important;width:112px!important;min-width:112px!important;height:40px!important;min-height:40px!important;margin:0!important;padding:7px 8px!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;border-radius:10px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:11px!important}',
      '#bc-venta-topbar #catalogo-categorias{display:none!important}',

      /* CATALOGO */
      '#tab-ventas.bc-pos #bc-venta-pos-layout{display:grid!important;grid-template-columns:minmax(0,1fr) 350px!important;gap:10px!important;flex:1 1 auto!important;min-height:0!important;overflow:hidden!important}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout .bc-venta-catalog-col{height:100%!important;min-height:0!important;overflow:hidden!important;padding:11px!important;border-radius:14px!important}',
      '#bc-m66-head{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;grid-template-areas:"title cats" "status cats"!important;align-items:center!important;gap:3px 10px!important;padding:1px 2px 6px!important;min-height:43px!important}',
      '#bc-m66-head #bc-m64-add-title{grid-area:title!important;font-size:17px!important;margin:0!important;padding:0!important;line-height:1!important}',
      '#bc-m66-head #venta-stock-disponible{grid-area:status!important;justify-self:start!important;margin:0!important;font-size:9px!important;line-height:1!important;white-space:nowrap!important;color:#70849b!important}',
      '#bc-m66-head #catalogo-categorias{grid-area:cats!important;display:flex!important;align-items:center!important;gap:6px!important;min-width:0!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important}',
      '#bc-m66-head #catalogo-categorias::-webkit-scrollbar{display:none!important}',
      '#bc-m66-head .catalogo-chip{flex:0 0 auto!important;min-height:29px!important;height:29px!important;padding:6px 10px!important;border-radius:8px!important;font-size:10.5px!important}',
      '#bc-venta-productos-scroll{padding:1px 2px 8px!important;overflow-y:auto!important;overflow-x:hidden!important}',
      '#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:9px!important}',
      '#bc-venta-productos-scroll .catalogo-card{height:136px!important;min-height:136px!important;padding:9px!important;overflow:hidden!important;border-radius:11px!important}',
      '#bc-venta-productos-scroll .catalogo-card-img{height:57px!important;max-height:57px!important;object-fit:contain!important}',
      '#bc-venta-productos-scroll .catalogo-card-nombre{font-size:11px!important;line-height:1.23!important;min-height:28px!important}',
      '#bc-venta-productos-scroll .catalogo-card-stock{font-size:9px!important;line-height:1.1!important}',
      '#bc-venta-productos-scroll .catalogo-card-precio{font-size:14px!important;line-height:1!important}',
      '#bc-venta-productos-scroll .catalogo-card-cta{width:29px!important;height:29px!important;min-height:29px!important;margin:-30px 0 0!important;border-radius:8px!important}',

      /* CARRITO: cantidad siempre legible */
      '#tab-ventas.bc-pos #bc-venta-cart-panel{height:100%!important;min-height:0!important;max-height:none!important;overflow:hidden!important;padding:12px!important;border-radius:14px!important;display:flex!important;flex-direction:column!important}',
      '#bc-venta-cart-panel .bc-cart-title{font-size:19px!important;padding:0 2px 9px!important;margin:0!important}',
      '#bc-venta-cart-panel #venta-lineas{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-width:none!important;padding:6px 0 6px!important;gap:5px!important}',
      '#bc-venta-cart-panel #venta-lineas::-webkit-scrollbar{display:none!important}',
      '#bc-venta-cart-panel #venta-lineas .lista-item{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-rows:auto auto!important;gap:5px!important;min-height:52px!important;padding:8px!important;box-sizing:border-box!important;border-radius:9px!important}',
      '#bc-venta-cart-panel .venta-linea-info{min-width:0!important;display:flex!important;flex-direction:column!important;gap:2px!important;overflow:hidden!important;color:#f1f5fb!important}',
      '#bc-venta-cart-panel .venta-linea-info > span:first-child{font-size:11px!important;font-weight:750!important;line-height:1.15!important;color:#f1f5fb!important;white-space:normal!important}',
      '#bc-venta-cart-panel .venta-linea-info .muted{font-size:9px!important;line-height:1.1!important;color:#8194aa!important}',
      '#bc-venta-cart-panel .venta-linea-precios{display:grid!important;grid-template-columns:auto auto auto!important;align-items:center!important;gap:5px!important;min-width:0!important}',
      '#bc-venta-cart-panel .venta-linea-cant-wrap{display:flex!important;align-items:center!important;gap:3px!important}',
      '#bc-venta-cart-panel .venta-linea-btn{width:29px!important;height:29px!important;min-width:29px!important;min-height:29px!important;padding:0!important;border-radius:8px!important;background:#17304f!important;color:#fff!important;border:1px solid rgba(75,126,184,.4)!important;display:grid!important;place-items:center!important;font-size:17px!important;line-height:1!important}',
      '#bc-venta-cart-panel .venta-linea-cant-input{width:42px!important;min-width:42px!important;height:29px!important;box-sizing:border-box!important;text-align:center!important;color:#ffffff!important;-webkit-text-fill-color:#ffffff!important;background:#0d1b2c!important;border:1px solid rgba(90,130,180,.35)!important;border-radius:8px!important;font-size:12px!important;font-weight:800!important;opacity:1!important}',
      '#bc-venta-cart-panel .venta-linea-precios > .muted{min-width:63px!important;text-align:right!important;color:#d6e1ee!important;font-size:9.5px!important;white-space:nowrap!important}',
      '#bc-venta-cart-panel .venta-linea-borrar{width:29px!important;min-width:29px!important;height:29px!important;padding:0!important;border-radius:8px!important;font-size:0!important;background:#4a1820!important;color:#ffb7bd!important;border:1px solid rgba(255,90,105,.35)!important}',
      '#bc-venta-cart-panel .venta-linea-borrar::before{content:"×"!important;font-size:18px!important;font-weight:700!important;line-height:1!important}',
      '#bc-venta-cart-panel .bc-cart-footer{flex:0 0 auto!important;padding-top:7px!important}',
      '#bc-venta-cart-panel #venta-total-wrap{margin:0 0 7px!important;padding:9px 10px!important;min-height:57px!important;box-sizing:border-box!important;overflow:visible!important}',
      '#bc-venta-cart-panel #venta-total-wrap .venta-total-valor{font-size:29px!important;line-height:1!important;color:#2b83ff!important}',
      '#bc-venta-cart-panel #btn-confirmar-venta{height:46px!important;min-height:46px!important;border-radius:10px!important;font-size:13px!important}',

      /* ELIMINAR COMPLETAMENTE HISTORIAL DEL ESPACIO DE VENTAS */
      '#tab-ventas.bc-pos h3[hidden],#tab-ventas.bc-pos .ventas-historial-controles[hidden],#tab-ventas.bc-pos #lista-ventas[hidden]{display:none!important}',

      /* BREAKPOINTS */
      '@media(max-width:1180px){#bc-venta-topbar{grid-template-columns:190px minmax(270px,1fr) 155px 106px!important}#bc-venta-topbar #form-venta-linea{grid-template-columns:minmax(0,1fr) 54px 94px!important}#bc-venta-topbar #venta-presentacion{width:94px!important;min-width:94px!important}#bc-venta-topbar #form-venta-linea button[type=submit]{min-width:94px!important}#tab-ventas.bc-pos #bc-venta-pos-layout{grid-template-columns:minmax(0,1fr) 330px!important}#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}',
      '@media(max-width:900px){#tab-ventas.bc-pos #bc-venta-pos-layout{grid-template-columns:1fr!important;grid-template-rows:minmax(0,1fr) auto!important}#tab-ventas.bc-pos #bc-venta-cart-panel{height:auto!important;max-height:38dvh!important}#bc-venta-topbar{grid-template-columns:minmax(0,1fr) 108px!important;grid-template-areas:"ctx close" "form form" "policy policy"!important;height:auto!important;min-height:96px!important}#bc-venta-topbar #form-venta-linea{height:40px!important;grid-template-columns:minmax(0,1fr) 56px 96px!important}#bc-venta-topbar #catalogo-categorias{display:none!important}#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}',
      '@media(max-width:560px){#bc-venta-topbar{grid-template-columns:1fr!important;grid-template-areas:"ctx" "form" "policy" "close"!important;min-height:146px!important}#bc-venta-topbar #form-venta-linea{grid-template-columns:minmax(0,1fr) 54px 92px!important}#bc-venta-topbar #venta-presentacion{display:none!important}#bc-venta-topbar #form-venta-linea button[type=submit]{min-width:92px!important}#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    ].join('');
    document.head.appendChild(s);
  }

  function boot(){
    var tab=document.getElementById('tab-ventas');
    if(!tab)return false;
    css();
    hideHistory(tab);
    return true;
  }

  var tries=0;
  function start(){
    if(boot()||tries>=20)return;
    tries++;
    setTimeout(start,250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(start,350);});
  else setTimeout(start,350);
  window.__BC_M67={version:'67.1',boot:boot};
})();
