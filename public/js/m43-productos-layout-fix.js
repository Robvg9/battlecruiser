// BattleCruiser — M43.1: layout robusto de Productos (filas + cuadros)
(function(){
  'use strict';
  if(window.__bcM43ProductosLayoutFix)return;
  window.__bcM43ProductosLayoutFix=true;

  const STYLE_ID='bc-m43-productos-css';

  function injectCss(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      /* Contenedor base: nunca permite que una card hija fuerce el ancho */
      #tab-productos #lista-productos{width:100%;min-width:0;box-sizing:border-box;overflow:visible}
      #tab-productos #lista-productos>.bc-product-card,
      #tab-productos #lista-productos>.lista-item{
        box-sizing:border-box!important;
        min-width:0!important;
        width:100%!important;
      }

      /* Vista FILAS: compacta y estrictamente controlada */
      #tab-productos #lista-productos.bc-productos-filas{
        display:flex!important;flex-direction:column!important;gap:8px!important;
      }
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card{
        display:grid!important;
        grid-template-columns:56px minmax(0,1fr) minmax(145px,.72fr) auto!important;
        grid-template-rows:auto!important;
        align-items:center!important;
        gap:10px!important;
        min-height:76px!important;
        max-height:none!important;
        padding:10px!important;
        overflow:hidden!important;
      }
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>img,
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>.bc-product-thumb{
        grid-column:1!important;grid-row:1!important;
      }
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>span:nth-child(2){
        grid-column:2!important;grid-row:1!important;min-width:0!important;overflow:hidden!important;
        line-height:1.35!important;
      }
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>span:nth-child(3){
        grid-column:3!important;grid-row:1!important;min-width:0!important;overflow:hidden!important;
        white-space:nowrap!important;text-overflow:ellipsis!important;text-align:right!important;
      }
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>.lista-item-acciones{
        grid-column:4!important;grid-row:1!important;
        display:flex!important;align-items:center!important;justify-content:flex-end!important;
        flex-wrap:wrap!important;gap:6px!important;min-width:0!important;
      }

      /* Vista CUADROS: verdaderas cards, con acciones dentro del cuadro */
      #tab-productos #lista-productos.bc-productos-cards{
        display:grid!important;
        grid-template-columns:repeat(auto-fill,minmax(235px,1fr))!important;
        gap:12px!important;
        align-items:stretch!important;
        max-height:none!important;
        overflow:visible!important;
      }
      #tab-productos #lista-productos.bc-productos-cards>.bc-product-card{
        display:grid!important;
        grid-template-columns:64px minmax(0,1fr)!important;
        grid-template-rows:auto auto auto!important;
        column-gap:11px!important;row-gap:7px!important;
        align-content:start!important;align-items:start!important;
        min-height:150px!important;height:100%!important;max-height:none!important;
        padding:12px!important;margin:0!important;overflow:hidden!important;
        border-radius:13px!important;
      }
      #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>img,
      #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>.bc-product-thumb{
        grid-column:1!important;grid-row:1 / span 3!important;
        width:64px!important;height:64px!important;max-width:64px!important;max-height:64px!important;
        min-width:64px!important;min-height:64px!important;object-fit:cover!important;
        border-radius:9px!important;overflow:hidden!important;
      }
      #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>span:nth-child(2){
        grid-column:2!important;grid-row:1!important;min-width:0!important;max-width:100%!important;
        overflow:hidden!important;line-height:1.35!important;
      }
      #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>span:nth-child(3){
        grid-column:2!important;grid-row:2!important;min-width:0!important;max-width:100%!important;
        overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;
      }
      #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>.lista-item-acciones{
        grid-column:1 / -1!important;grid-row:3!important;
        display:flex!important;flex-wrap:wrap!important;gap:6px!important;
        width:100%!important;min-width:0!important;max-width:100%!important;
        justify-content:flex-end!important;box-sizing:border-box!important;
        margin-top:auto!important;padding-top:3px!important;
      }

      /* Acciones: jamás se salen de la card ni fuerzan el contenido */
      #tab-productos #lista-productos .lista-item-acciones{
        min-width:0!important;max-width:100%!important;box-sizing:border-box!important;
      }
      #tab-productos #lista-productos .lista-item-acciones button{
        box-sizing:border-box!important;
        min-width:0!important;max-width:100%!important;
        flex:0 1 auto!important;
        white-space:nowrap!important;
        padding:6px 9px!important;
        border-radius:8px!important;
        font-size:11.5px!important;
        line-height:1.2!important;
      }

      #tab-productos #lista-productos .bc-product-thumb,
      #tab-productos #lista-productos .producto-thumb{
        flex:none!important;
        width:64px!important;height:64px!important;
        min-width:64px!important;min-height:64px!important;
        max-width:64px!important;max-height:64px!important;
        object-fit:cover!important;border-radius:9px!important;
      }
      #tab-productos #lista-productos .bc-product-thumb-vacia,
      #tab-productos #lista-productos .producto-thumb-vacia{
        display:block!important;width:64px!important;height:64px!important;
      }

      @media(max-width:900px){
        #tab-productos #lista-productos.bc-productos-filas>.bc-product-card{
          grid-template-columns:52px minmax(0,1fr) auto!important;
          grid-template-rows:auto auto!important;
        }
        #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>span:nth-child(3){
          grid-column:2!important;grid-row:2!important;text-align:left!important;
        }
        #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>.lista-item-acciones{
          grid-column:3!important;grid-row:1 / span 2!important;
        }
      }
      @media(max-width:640px){
        #tab-productos #lista-productos.bc-productos-filas>.bc-product-card{
          grid-template-columns:52px minmax(0,1fr)!important;
          grid-template-rows:auto auto auto!important;
        }
        #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>span:nth-child(2){grid-column:2!important;grid-row:1!important}
        #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>span:nth-child(3){grid-column:2!important;grid-row:2!important}
        #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>.lista-item-acciones{grid-column:2!important;grid-row:3!important;justify-content:flex-start!important}
        #tab-productos #lista-productos.bc-productos-cards{grid-template-columns:1fr!important}
      }
    `;
    document.head.appendChild(s);
  }

  function mark(){
    const list=document.getElementById('lista-productos');
    if(!list)return;
    list.classList.add('bc-productos-cards');
    [...list.children].forEach(function(item){
      if(!(item instanceof HTMLElement))return;
      item.classList.add('bc-product-card');
      item.querySelectorAll('img').forEach(function(img){
        img.classList.add('bc-product-thumb');
        img.removeAttribute('width');img.removeAttribute('height');
      });
    });
  }

  function boot(){
    injectCss();mark();
    const list=document.getElementById('lista-productos');
    if(!list||list.dataset.bcM43Obs==='1')return;
    list.dataset.bcM43Obs='1';
    const obs=new MutationObserver(function(){mark()});
    obs.observe(list,{childList:true,subtree:true});
    window.__BC_M43_OBS=obs;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,450)});else setTimeout(boot,450);
})();
