// BattleCruiser — M43.2: layout robusto de Productos (filas + cuadros)
(function(){
  'use strict';
  if(window.__bcM43ProductosLayoutFixV2)return;
  window.__bcM43ProductosLayoutFixV2=true;

  const STYLE_ID='bc-m43-productos-css-v2';

  function injectCss(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      #tab-productos #lista-productos{
        width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important;
      }
      #tab-productos #lista-productos > .lista-item,
      #tab-productos #lista-productos > .bc-product-card{
        box-sizing:border-box!important;min-width:0!important;max-width:100%!important;width:100%!important;
      }

      /* ===============================
         VISTA FILAS
         =============================== */
      #tab-productos #lista-productos.bc-productos-filas{
        display:flex!important;flex-direction:column!important;gap:8px!important;overflow:visible!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card{
        display:grid!important;
        grid-template-columns:58px minmax(0,1fr) minmax(170px,.7fr) minmax(154px,184px)!important;
        grid-template-areas:'thumb info metrics actions'!important;
        align-items:center!important;
        gap:10px!important;
        min-height:80px!important;height:auto!important;
        padding:10px 11px!important;margin:0!important;
        border-radius:11px!important;overflow:hidden!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > img,
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > .bc-product-thumb,
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > .producto-thumb{
        grid-area:thumb!important;display:block!important;
        width:56px!important;height:56px!important;min-width:56px!important;min-height:56px!important;
        max-width:56px!important;max-height:56px!important;object-fit:cover!important;border-radius:9px!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > span:nth-child(2){
        grid-area:info!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;
        line-height:1.3!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > span:nth-child(2) > *{max-width:100%!important}
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > span:nth-child(3){
        grid-area:metrics!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;
        white-space:nowrap!important;text-overflow:ellipsis!important;text-align:right!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > .lista-item-acciones{
        grid-area:actions!important;width:100%!important;min-width:0!important;max-width:100%!important;
        box-sizing:border-box!important;display:flex!important;flex-wrap:wrap!important;align-items:center!important;
        justify-content:flex-end!important;gap:6px!important;overflow:hidden!important;
      }

      /* ===============================
         VISTA CUADROS
         =============================== */
      #tab-productos #lista-productos.bc-productos-cards{
        display:grid!important;
        grid-template-columns:repeat(auto-fill,minmax(250px,1fr))!important;
        gap:12px!important;align-items:stretch!important;overflow:visible!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card{
        display:grid!important;
        grid-template-columns:66px minmax(0,1fr)!important;
        grid-template-rows:auto auto minmax(32px,1fr) auto!important;
        grid-template-areas:'thumb info' 'thumb metrics' 'thumb spacer' 'actions actions'!important;
        column-gap:11px!important;row-gap:7px!important;
        min-height:160px!important;height:100%!important;max-height:none!important;
        padding:12px!important;margin:0!important;align-content:stretch!important;overflow:hidden!important;
        border-radius:13px!important;position:relative!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > img,
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > .bc-product-thumb,
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > .producto-thumb{
        grid-area:thumb!important;display:block!important;
        width:64px!important;height:64px!important;min-width:64px!important;min-height:64px!important;
        max-width:64px!important;max-height:64px!important;object-fit:cover!important;border-radius:9px!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > span:nth-child(2){
        grid-area:info!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;
        line-height:1.35!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > span:nth-child(3){
        grid-area:metrics!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;
        white-space:normal!important;line-height:1.35!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > .lista-item-acciones{
        grid-area:actions!important;width:100%!important;min-width:0!important;max-width:100%!important;
        box-sizing:border-box!important;display:flex!important;flex-wrap:wrap!important;align-items:center!important;
        justify-content:flex-end!important;gap:7px!important;padding-top:8px!important;margin:0!important;
        border-top:1px solid rgba(212,176,92,.10)!important;overflow:hidden!important;
      }

      /* ===============================
         ACCIONES: NUNCA FUERA
         =============================== */
      #tab-productos #lista-productos .lista-item-acciones{
        contain:layout paint!important;overflow:hidden!important;
      }
      #tab-productos #lista-productos .lista-item-acciones button{
        box-sizing:border-box!important;
        flex:1 1 88px!important;
        min-width:0!important;max-width:140px!important;width:auto!important;
        height:34px!important;margin:0!important;padding:6px 8px!important;
        border-radius:8px!important;font-size:11px!important;line-height:1.1!important;
        white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
      }
      #tab-productos #lista-productos .btn-editar-producto{border:1px solid rgba(212,176,92,.25)!important;background:rgba(212,176,92,.09)!important;color:var(--text)!important}
      #tab-productos #lista-productos .btn-toggle-producto{border:1px solid rgba(196,74,90,.22)!important;background:rgba(196,74,90,.06)!important;color:var(--text)!important}
      #tab-productos #lista-productos .btn-editar-producto:hover,#tab-productos #lista-productos .btn-toggle-producto:hover{transform:none!important;box-shadow:none!important}

      /* El contenido textual no puede ensanchar nunca la card */
      #tab-productos #lista-productos .bc-product-card > span{min-width:0!important;max-width:100%!important}
      #tab-productos #lista-productos .bc-product-card .muted{min-width:0!important;max-width:100%!important}
      #tab-productos #lista-productos .bc-product-card span{overflow-wrap:anywhere}

      @media(max-width:1050px){
        #tab-productos #lista-productos.bc-productos-filas > .bc-product-card{
          grid-template-columns:56px minmax(0,1fr) minmax(150px,.6fr) minmax(145px,170px)!important;
        }
      }
      @media(max-width:820px){
        #tab-productos #lista-productos.bc-productos-filas > .bc-product-card{
          grid-template-columns:54px minmax(0,1fr) minmax(140px,170px)!important;
          grid-template-areas:'thumb info actions' 'thumb metrics actions'!important;
        }
        #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > span:nth-child(3){text-align:left!important}
      }
      @media(max-width:640px){
        #tab-productos #lista-productos.bc-productos-filas > .bc-product-card{
          grid-template-columns:52px minmax(0,1fr)!important;
          grid-template-areas:'thumb info' 'thumb metrics' 'thumb actions'!important;
          row-gap:6px!important;padding:9px!important;
        }
        #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > .lista-item-acciones{justify-content:flex-start!important}
        #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > .lista-item-acciones button{flex:1 1 96px!important;max-width:none!important}
        #tab-productos #lista-productos.bc-productos-cards{grid-template-columns:1fr!important}
        #tab-productos #lista-productos.bc-productos-cards > .bc-product-card{min-height:154px!important}
        #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > .lista-item-acciones{justify-content:flex-start!important}
        #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > .lista-item-acciones button{flex:1 1 96px!important;max-width:none!important}
      }
    `;
    document.head.appendChild(s);
  }

  function mark(){
    const list=document.getElementById('lista-productos');
    if(!list)return;
    if(!list.classList.contains('bc-productos-filas'))list.classList.add('bc-productos-cards');
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
    if(!list||list.dataset.bcM43ObsV2==='1')return;
    list.dataset.bcM43ObsV2='1';
    const obs=new MutationObserver(function(){mark()});
    obs.observe(list,{childList:true,subtree:true});
    window.__BC_M43_OBS_V2=obs;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,400)});else setTimeout(boot,400);
})();