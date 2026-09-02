// BattleCruiser M64 — Venta: barra superior fija + catálogo como único scroll principal
// No reemplaza lógica de negocio. Solo reorganiza DOM y estilo de controles existentes.
(function(){
  'use strict';
  if(window.__BC_M64_VENTAS_TOPBAR__) return;
  window.__BC_M64_VENTAS_TOPBAR__=true;

  var TOP_ID='bc-venta-topbar';
  var SCROLL_ID='bc-venta-productos-scroll';
  var STYLE_ID='bc-m64-ventas-style';

  function addStyles(){
    if(document.getElementById(STYLE_ID)) return;
    var s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=[
      '#tab-ventas.bc-pos.visible{height:calc(100dvh - 86px);min-height:0;overflow:hidden;display:flex;flex-direction:column}',
      '#tab-ventas.bc-pos #venta-operativa-bloque{display:flex;flex:1 1 auto;flex-direction:column;min-height:0;overflow:hidden;gap:8px}',
      '#'+TOP_ID+'{position:sticky;top:0;z-index:80;display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 0 auto;margin:0;padding:8px 10px;border:1px solid var(--gold-dim,#c9a24d55);border-radius:12px;background:rgba(12,28,24,.97);box-shadow:0 8px 22px rgba(0,0,0,.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-sizing:border-box}',
      '#'+TOP_ID+' .bc-m64-context{display:flex;align-items:center;gap:7px;min-width:180px;flex:0 1 auto;padding:2px 6px}',
      '#'+TOP_ID+' .bc-m64-context .venta-almacen-label{font-size:10px;margin:0;color:var(--mist,#b8c4bc);white-space:nowrap}',
      '#'+TOP_ID+' .bc-m64-context .venta-almacen-nombre{font-family:Cormorant Garamond,serif;font-size:18px;line-height:1;color:var(--gold,#c9a24d);white-space:nowrap}',
      '#'+TOP_ID+' .bc-m64-context .venta-almacen-hint{font-size:9px;white-space:nowrap}',
      '#'+TOP_ID+' .bc-m64-title{font-family:Cormorant Garamond,serif;font-size:17px;font-weight:600;color:var(--gold-bright,#e8c86a);white-space:nowrap;padding:0 4px}',
      '#'+TOP_ID+' #bc-m273-cerrar-sesion-btn{display:block!important;width:auto!important;min-height:38px;margin:0!important;padding:8px 12px!important;border-radius:9px!important;white-space:nowrap;flex:0 0 auto}',
      '#'+TOP_ID+' #bc-m273-cerrar-sesion-btn.hidden{display:none!important}',
      '#'+TOP_ID+' #form-venta-linea{display:flex;align-items:center;flex:1 1 320px;min-width:220px;gap:7px;margin:0!important;padding:0!important;background:transparent!important;border:0!important}',
      '#'+TOP_ID+' #form-venta-linea .venta-buscar-wrap{flex:1 1 240px;min-width:150px}',
      '#'+TOP_ID+' #venta-producto-buscar{height:38px!important;font-size:14px!important;padding:8px 11px!important;border-radius:9px!important}',
      '#'+TOP_ID+' #venta-cantidad{width:64px;min-width:60px;height:38px!important;font-size:14px!important}',
      '#'+TOP_ID+' #form-venta-linea button[type=submit]{min-height:38px!important;padding:8px 12px!important;flex:0 0 auto}',
      '#'+TOP_ID+' #venta-stock-disponible{flex:0 0 100%;font-size:11px;margin:0!important}',
      '#'+TOP_ID+' #bc-m275-policy{display:flex;align-items:center;gap:8px;min-height:34px;margin:0!important;padding:5px 8px;border-radius:9px;flex:0 0 auto}',
      '#'+TOP_ID+' #bc-m275-policy label{white-space:nowrap}',
      '#'+TOP_ID+' #catalogo-categorias{display:flex;align-items:center;gap:5px;flex:1 1 100%;min-width:0;overflow-x:auto;overflow-y:hidden;white-space:nowrap;padding:2px 0 1px;margin:0!important;scrollbar-width:thin}',
      '#'+TOP_ID+' #catalogo-categorias .catalogo-chip{flex:0 0 auto;min-height:30px;padding:6px 11px;font-size:12px}',
      '#'+SCROLL_ID+'{flex:1 1 auto;min-height:0;overflow:auto;overflow-x:hidden;padding:2px 2px 18px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}',
      '#'+SCROLL_ID+' #catalogo-grid{margin:0!important;padding-bottom:24px!important}',
      '#'+SCROLL_ID+' #catalogo-grid:only-child{min-height:100%}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout{flex:1 1 auto;min-height:0;overflow:hidden}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout .bc-venta-catalog-col{display:flex;flex:1 1 auto;flex-direction:column;min-width:0;min-height:0;overflow:hidden}',
      '#tab-ventas.bc-pos #bc-venta-cart-panel{min-height:0;overflow:hidden}',
      '@media(min-width:900px){',
      '#tab-ventas.bc-pos #bc-venta-pos-layout{display:flex;flex-direction:row;gap:12px}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout .bc-venta-catalog-col{flex:1 1 auto}',
      '#tab-ventas.bc-pos #bc-venta-cart-panel{flex:0 0 340px;max-width:380px;position:static!important;max-height:100%;}',
      '}',
      '@media(max-width:899px){',
      '#tab-ventas.bc-pos #bc-venta-pos-layout{display:flex;flex-direction:column;gap:8px}',
      '#tab-ventas.bc-pos #bc-venta-pos-layout .bc-venta-catalog-col{flex:1 1 auto;min-height:0}',
      '#tab-ventas.bc-pos #bc-venta-cart-panel{flex:0 0 auto;width:100%;max-height:34dvh;}',
      '#tab-ventas.bc-pos #bc-venta-cart-panel #venta-lineas{max-height:18dvh!important}',
      '#'+TOP_ID+'{padding:7px 8px}',
      '#'+TOP_ID+' .bc-m64-context{min-width:0;flex:1 1 170px}',
      '#'+TOP_ID+' .bc-m64-title{order:10;flex:0 0 auto}',
      '#'+TOP_ID+' #form-venta-linea{order:20;flex-basis:100%}',
      '#'+TOP_ID+' #bc-m275-policy{order:30;flex:1 1 auto}',
      '#'+TOP_ID+' #catalogo-categorias{order:40}',
      '}',
      '@media(max-width:520px){',
      '#'+TOP_ID+' .bc-m64-context{flex-basis:100%;padding:1px 3px}',
      '#'+TOP_ID+' .bc-m64-context .venta-almacen-hint{display:none}',
      '#'+TOP_ID+' .bc-m64-title{font-size:16px}',
      '#'+TOP_ID+' #bc-m273-cerrar-sesion-btn{font-size:12px!important}',
      '#'+TOP_ID+' #form-venta-linea .venta-buscar-wrap{min-width:0}',
      '#'+TOP_ID+' #venta-cantidad{width:56px;min-width:56px}',
      '#'+TOP_ID+' #form-venta-linea button[type=submit]{padding-inline:10px!important}',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  function firstById(ids){
    for(var i=0;i<ids.length;i++){
      var el=document.getElementById(ids[i]);
      if(el) return el;
    }
    return null;
  }

  function ensureTopbar(){
    var tab=document.getElementById('tab-ventas');
    var bloque=document.getElementById('venta-operativa-bloque');
    if(!tab||!bloque) return false;

    var top=document.getElementById(TOP_ID);
    if(!top){
      top=document.createElement('div');
      top.id=TOP_ID;
      top.setAttribute('role','region');
      top.setAttribute('aria-label','Controles de venta');
      bloque.insertBefore(top,bloque.firstChild);
    }

    var ctx=document.getElementById('venta-almacen-operativo');
    if(ctx){
      var ctxWrap=document.getElementById('bc-m64-context');
      if(!ctxWrap){
        ctxWrap=document.createElement('div');
        ctxWrap.id='bc-m64-context';
        ctxWrap.className='bc-m64-context';
      }
      if(ctx.parentNode!==ctxWrap) ctxWrap.appendChild(ctx);
      if(ctxWrap.parentNode!==top) top.insertBefore(ctxWrap,top.firstChild);
      ctx.style.margin='0';
      ctx.style.padding='0';
      ctx.style.border='0';
      ctx.style.background='transparent';
    }

    var title=document.getElementById('bc-m64-add-title');
    if(!title){
      title=document.createElement('div');
      title.id='bc-m64-add-title';
      title.className='bc-m64-title';
      title.textContent='Agregar a la venta';
      top.appendChild(title);
    }

    var closeBtn=document.getElementById('bc-m273-cerrar-sesion-btn');
    if(closeBtn&&closeBtn.parentNode!==top) top.appendChild(closeBtn);

    var form=document.getElementById('form-venta-linea');
    if(form&&form.parentNode!==top) top.appendChild(form);

    var stock=document.getElementById('venta-stock-disponible');
    if(stock&&stock.parentNode!==top) top.appendChild(stock);

    var policy=document.getElementById('bc-m275-policy');
    if(policy&&policy.parentNode!==top) top.appendChild(policy);

    var cats=document.getElementById('catalogo-categorias');
    if(cats&&cats.parentNode!==top) top.appendChild(cats);

    var layout=document.getElementById('bc-venta-pos-layout');
    if(!layout||!layout.querySelector('.bc-venta-catalog-col')) return true;
    var catCol=layout.querySelector('.bc-venta-catalog-col');

    var scroll=document.getElementById(SCROLL_ID);
    if(!scroll){
      scroll=document.createElement('div');
      scroll.id=SCROLL_ID;
      scroll.setAttribute('aria-label','Productos disponibles');
    }
    if(scroll.parentNode!==catCol) catCol.insertBefore(scroll,catCol.firstChild);

    var grid=document.getElementById('catalogo-grid');
    if(grid&&grid.parentNode!==scroll) scroll.appendChild(grid);

    var modo=document.getElementById('venta-modo-catalogo');
    if(modo){
      modo.style.display='contents';
      var directChildren=Array.prototype.slice.call(modo.children);
      directChildren.forEach(function(node){
        if(node.id==='catalogo-grid') return;
        if(node.id==='catalogo-categorias') return;
        if(node.id==='bc-m275-policy') return;
        if(node.parentNode===modo && !top.contains(node)) {
          // Mantener cualquier control adicional del catálogo fuera del scroll.
          top.appendChild(node);
        }
      });
      if(modo.id && !modo.children.length) modo.style.display='none';
    }

    return true;
  }

  function boot(){
    addStyles();
    ensureTopbar();
  }

  var tries=0;
  function readyLoop(){
    tries++;
    boot();
    if(tries<30 && (!document.getElementById(TOP_ID) || !document.getElementById('catalogo-grid'))){
      setTimeout(readyLoop,250);
    }
  }

  var obs=new MutationObserver(function(){
    var tab=document.getElementById('tab-ventas');
    if(!tab||!tab.classList.contains('visible')) return;
    ensureTopbar();
  });
  obs.observe(document.body,{childList:true,subtree:true});

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(readyLoop,200);});
  else setTimeout(readyLoop,200);

  window.__BC_M64={version:'64.1',ensure:ensureTopbar};
})();
