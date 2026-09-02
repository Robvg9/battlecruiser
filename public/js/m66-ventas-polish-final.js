// BattleCruiser M66.2 — Ventas Polish Final (safe init)
(function(){
  'use strict';
  if(window.__BC_M66_SAFE__) return;
  window.__BC_M66_SAFE__=true;
  var S='bc-m66-polish-safe';
  function move(){
    var tab=document.getElementById('tab-ventas'),col=document.querySelector('#bc-venta-pos-layout .bc-venta-catalog-col'),scroll=document.getElementById('bc-venta-productos-scroll');
    if(!tab||!col||!scroll)return false;
    var head=document.getElementById('bc-m66-head');
    if(!head){head=document.createElement('div');head.id='bc-m66-head';col.insertBefore(head,scroll);}
    var t=document.getElementById('bc-m64-add-title');
    if(t){t.textContent='Productos';if(t.parentNode!==head)head.insertBefore(t,head.firstChild);}
    var c=document.getElementById('catalogo-categorias');if(c&&c.parentNode!==head)head.appendChild(c);
    var st=document.getElementById('venta-stock-disponible');if(st&&st.parentNode!==head)head.appendChild(st);
    tab.querySelectorAll('h3').forEach(function(h){
      if((h.textContent||'').trim().toLowerCase()==='historial de ventas'){
        h.hidden=true;
        var n=h.nextElementSibling;if(n&&n.classList.contains('ventas-historial-controles'))n.hidden=true;
      }
    });
    var l=document.getElementById('lista-ventas');if(l)l.hidden=true;
    return true;
  }
  function css(){
    if(document.getElementById(S))return;
    var s=document.createElement('style');s.id=S;s.textContent=[
      '#tab-ventas.bc-pos.visible{height:calc(100dvh - 110px)!important;max-height:calc(100dvh - 110px)!important;min-height:0!important;overflow:hidden!important;background:#07101d!important}',
      '#tab-ventas.bc-pos #venta-operativa-bloque{height:100%!important;min-height:0!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;gap:10px!important}',
      '#bc-venta-topbar{display:grid!important;grid-template-columns:220px minmax(0,1fr) 205px 118px!important;grid-template-areas:"ctx form policy close"!important;gap:9px!important;align-items:center!important;min-height:58px!important;padding:8px 10px!important;box-sizing:border-box!important;overflow:hidden!important}',
      '#bc-venta-topbar .bc-m64-context{grid-area:ctx!important;min-width:0!important;padding:5px 9px!important;border-right:1px solid rgba(100,140,190,.14)!important}',
      '#bc-venta-topbar .bc-m64-title{display:none!important}',
      '#bc-venta-topbar #form-venta-linea{grid-area:form!important;display:flex!important;align-items:center!important;flex-wrap:nowrap!important;gap:8px!important;width:100%!important;min-width:0!important;margin:0!important;padding:0!important}',
      '#bc-venta-topbar #form-venta-linea .venta-buscar-wrap{flex:1 1 auto!important;min-width:0!important;width:auto!important}',
      '#bc-venta-topbar #venta-producto-buscar{width:100%!important;height:42px!important;box-sizing:border-box!important;padding:10px 14px!important;border-radius:11px!important;font-size:13px!important;background:#0f1f32!important;border:1px solid rgba(90,130,180,.28)!important;color:#eef4fb!important}',
      '#bc-venta-topbar #venta-cantidad{flex:0 0 60px!important;width:60px!important;min-width:60px!important;height:42px!important;text-align:center!important;border-radius:11px!important;background:#0f1f32!important;border:1px solid rgba(90,130,180,.28)!important;color:#eef4fb!important}',
      '#bc-venta-topbar #venta-presentacion{flex:0 0 108px!important;width:108px!important;min-width:108px!important;height:42px!important;border-radius:11px!important;background:#0f1f32!important;border:1px solid rgba(90,130,180,.28)!important;color:#eef4fb!important}',
      '#bc-venta-topbar #form-venta-linea button[type=submit]{flex:0 0 105px!important;width:105px!important;min-width:105px!important;height:42px!important;min-height:42px!important;padding:8px 10px!important;border-radius:11px!important;font-size:13px!important;white-space:nowrap!important;background:linear-gradient(180deg,#1979f8,#0c62e4)!important;color:#fff!important}',
      '#bc-venta-topbar #bc-m275-policy{grid-area:policy!important;min-width:0!important;min-height:40px!important;display:flex!important;align-items:center!important;justify-content:center!important;white-space:nowrap!important;padding:6px 9px!important;margin:0!important;border-radius:11px!important;background:#0f1f32!important;border:1px solid rgba(90,130,180,.2)!important;color:#ccd7e4!important;font-size:10.5px!important;box-sizing:border-box!important}',
      '#bc-venta-topbar #bc-m273-cerrar-sesion-btn{grid-area:close!important;width:118px!important;min-width:118px!important;height:42px!important;min-height:42px!important;padding:8px 8px!important;margin:0!important;box-sizing:border-box!important;border-radius:11px!important;display:flex!important;align-items:center!important;justify-content:center!important;white-space:nowrap!important;overflow:hidden!important;font-size:12px!important}',
      '#bc-m66-head{flex:0 0 auto!important;display:grid!important;grid-template-columns:auto 1fr!important;grid-template-areas:"title status" "cats cats"!important;align-items:center!important;gap:6px 10px!important;padding:1px 2px 5px!important}',
      '#bc-m66-head #bc-m64-add-title{grid-area:title!important;display:block!important;margin:0!important;padding:0!important;font:800 18px/1.1 Inter,system-ui,sans-serif!important;color:#f1f5fb!important}',
      '#bc-m66-head #catalogo-categorias{grid-area:cats!important;display:flex!important;gap:7px!important;min-width:0!important;overflow-x:auto!important;overflow-y:hidden!important;padding:1px 0!important;margin:0!important;scrollbar-width:none!important}',
      '#bc-m66-head #catalogo-categorias::-webkit-scrollbar{display:none!important}',
      '#bc-m66-head .catalogo-chip{flex:0 0 auto!important;min-height:31px!important;padding:7px 12px!important;border-radius:9px!important;font-size:11px!important}',
      '#bc-m66-head #venta-stock-disponible{grid-area:status!important;margin:0!important;justify-self:end!important;padding:0 3px!important;font-size:10px!important;color:#71859c!important;white-space:nowrap!important}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout{display:grid!important;grid-template-columns:minmax(0,1fr) 360px!important;gap:12px!important;flex:1 1 auto!important;min-height:0!important;height:auto!important;overflow:hidden!important}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout .bc-venta-catalog-col{height:100%!important;min-height:0!important;overflow:hidden!important;padding:13px!important;box-sizing:border-box!important;border-radius:15px!important;background:linear-gradient(180deg,#0b1829,#081321)!important;border:1px solid rgba(90,130,180,.18)!important}',
      '#bc-venta-productos-scroll{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;padding:2px 2px 10px!important}',
      '#bc-venta-productos-scroll #catalogo-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;align-content:start!important;width:100%!important;margin:0!important;padding:0 0 8px!important}',
      '#bc-venta-productos-scroll .catalogo-card{height:142px!important;min-height:142px!important;min-width:0!important;box-sizing:border-box!important;overflow:hidden!important;padding:10px!important;display:flex!important;flex-direction:column!important;gap:4px!important;border-radius:12px!important;background:linear-gradient(180deg,#101f32,#0c1929)!important;border:1px solid rgba(90,130,180,.17)!important}',
      '#bc-venta-productos-scroll .catalogo-card-img{width:100%!important;height:60px!important;max-height:60px!important;object-fit:contain!important;display:block!important;border-radius:8px!important;background:rgba(255,255,255,.035)!important}',
      '#bc-venta-productos-scroll .catalogo-card-nombre{min-height:29px!important;margin:0!important;font-size:11.5px!important;line-height:1.3!important;overflow:hidden!important}',
      '#bc-venta-productos-scroll .catalogo-card-stock{margin:0!important;font-size:9.5px!important;color:#71859c!important}',
      '#bc-venta-productos-scroll .catalogo-card-precio{margin:1px 0 0!important;font-size:15px!important;font-weight:800!important;color:#f2c45e!important}',
      '#bc-venta-productos-scroll .catalogo-card-cta{width:30px!important;height:30px!important;min-height:30px!important;align-self:flex-end!important;display:grid!important;place-items:center!important;margin:-31px 0 0!important;padding:0!important;border-radius:9px!important;background:#1677f7!important;color:#fff!important;font-size:0!important}',
      '#bc-venta-productos-scroll .catalogo-card-cta::before{content:"+"!important;font-size:21px!important;line-height:1!important}',
      '#tab-ventas.bc-pos #bc-venta-cart-panel{height:100%!important;min-height:0!important;max-height:none!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;padding:13px!important;box-sizing:border-box!important;border-radius:15px!important;background:linear-gradient(180deg,#101f32,#091422)!important;border:1px solid rgba(90,130,180,.2)!important}',
      '#bc-venta-cart-panel .bc-cart-title{flex:0 0 auto!important;margin:0!important;padding:0 2px 10px!important;border-bottom:1px solid rgba(90,130,180,.14)!important;font-size:19px!important;font-weight:800!important;color:#f2f6fc!important}',
      '#bc-venta-cart-panel #venta-lineas{flex:1 1 auto!important;min-height:0!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;gap:5px!important;padding:7px 0 8px!important;margin:0!important}',
      '#bc-venta-cart-panel #venta-lineas .lista-item{min-height:46px!important;padding:7px 8px!important;border-radius:9px!important;background:rgba(11,23,39,.9)!important;border:1px solid rgba(90,130,180,.1)!important}',
      '#bc-venta-cart-panel .bc-cart-footer{flex:0 0 auto!important;padding-top:8px!important;border-top:1px solid rgba(90,130,180,.14)!important}',
      '#bc-venta-cart-panel #venta-total-wrap{overflow:visible!important;margin:0 0 8px!important;padding:10px 11px!important;border-radius:10px!important;background:#112238!important;border:1px solid rgba(90,130,180,.14)!important}',
      '#bc-venta-cart-panel #venta-total-wrap .venta-total{margin:0!important;padding:0!important;background:transparent!important;border:0!important}',
      '#bc-venta-cart-panel #venta-total-wrap .venta-total-valor{font-size:30px!important;line-height:1!important;font-weight:800!important;color:#2581ff!important}',
      '#bc-venta-cart-panel #btn-confirmar-venta{width:100%!important;height:47px!important;min-height:47px!important;margin:0!important;border-radius:11px!important;font-size:14px!important;font-weight:800!important;background:linear-gradient(180deg,#1779f7,#0c62e4)!important;color:#fff!important}',
      '@media(max-width:1180px){#bc-venta-topbar{grid-template-columns:205px minmax(0,1fr) 185px 112px!important}#bc-venta-topbar #venta-presentacion{display:none!important}#tab-ventas.bc-pos #bc-venta-pos-layout{grid-template-columns:minmax(0,1fr) 330px!important}#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}',
      '@media(max-width:900px){#bc-venta-topbar{grid-template-columns:minmax(0,1fr) 112px!important;grid-template-areas:"ctx close" "form form" "policy policy"!important}#tab-ventas.bc-pos #bc-venta-pos-layout{grid-template-columns:1fr!important;grid-template-rows:minmax(0,1fr) auto!important}#tab-ventas.bc-pos #bc-venta-cart-panel{height:auto!important;max-height:38dvh!important}#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}',
      '@media(max-width:560px){#bc-venta-topbar{grid-template-columns:1fr!important;grid-template-areas:"ctx" "form" "policy" "close"!important}#bc-venta-topbar #form-venta-linea{display:grid!important;grid-template-columns:minmax(0,1fr) 58px 94px!important}#bc-venta-topbar #form-venta-linea button[type=submit]{width:94px!important;min-width:94px!important}#bc-venta-productos-scroll #catalogo-grid{grid-template-columns:1fr!important}}'
    ].join('');
    document.head.appendChild(s);
  }
  var attempts=0;
  function boot(){if(document.getElementById('tab-ventas')){css();return move();}return false;}
  function start(){
    if(boot()||attempts>=12)return;
    attempts++;setTimeout(start,250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(start,400);});
  else setTimeout(start,400);
  window.__BC_M66={version:'66.2',boot:boot};
})();
