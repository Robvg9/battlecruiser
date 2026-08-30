// BattleCruiser — M43.3: compatibilidad Productos (sin geometría de vista)
// La geometría Filas/Cuadros pertenece EXCLUSIVAMENTE a M47.
// M43 solo marca .bc-product-card y estilos de botones de acción.
(function(){
  'use strict';
  if(window.__bcM43ProductosLayoutFixV3)return;
  window.__bcM43ProductosLayoutFixV3=true;

  const STYLE_ID='bc-m43-productos-css-v3';

  function injectCss(){
    if(document.getElementById(STYLE_ID))return;
    // Eliminar CSS legacy v2 que competía con M47 (flex column / minmax 250px)
    const legacy=document.getElementById('bc-m43-productos-css-v2');
    if(legacy)legacy.remove();
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      /* M43.3: SIN display/grid/aspect-ratio de vistas.
         Solo contención de acciones y botones. */
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
      #tab-productos #lista-productos .btn-editar-producto{
        border:1px solid rgba(212,176,92,.25)!important;
        background:rgba(212,176,92,.09)!important;color:var(--text)!important;
      }
      #tab-productos #lista-productos .btn-toggle-producto{
        border:1px solid rgba(196,74,90,.22)!important;
        background:rgba(196,74,90,.06)!important;color:var(--text)!important;
      }
      #tab-productos #lista-productos .btn-editar-producto:hover,
      #tab-productos #lista-productos .btn-toggle-producto:hover{
        transform:none!important;box-shadow:none!important;
      }
    `;
    document.head.appendChild(s);
  }

  function mark(){
    const list=document.getElementById('lista-productos');
    if(!list)return;
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
    if(!list||list.dataset.bcM43ObsV3==='1')return;
    list.dataset.bcM43ObsV3='1';
    const obs=new MutationObserver(function(){mark()});
    obs.observe(list,{childList:true,subtree:true});
    window.__BC_M43_OBS_V3=obs;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,400)});else setTimeout(boot,400);
})();
