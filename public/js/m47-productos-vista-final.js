// BattleCruiser — M47.2: vista final de Productos
(function(){
  'use strict';
  if(window.__bcM47ProductosFinal)return;
  window.__bcM47ProductosFinal=true;
  const PREF='bc_productos_vista_v2';
  const STYLE='bc-m47-productos-final';
  function css(){if(document.getElementById(STYLE))return;const s=document.createElement('style');s.id=STYLE;s.textContent=`
    #tab-productos #lista-productos{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
    #tab-productos #lista-productos.bc-productos-filas{display:flex!important;flex-direction:column!important;gap:6px!important}
    #tab-productos #lista-productos.bc-productos-filas>.bc-product-card{display:grid!important;grid-template-columns:52px minmax(0,1fr) minmax(190px,280px) auto!important;grid-template-areas:'thumb info price actions'!important;align-items:center!important;width:100%!important;min-width:0!important;min-height:66px!important;height:66px!important;max-width:100%!important;margin:0!important;padding:7px 10px!important;box-sizing:border-box!important;overflow:hidden!important;border-radius:8px!important}
    #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>img,#tab-productos #lista-productos.bc-productos-filas>.bc-product-card>.bc-product-thumb,#tab-productos #lista-productos.bc-productos-filas>.bc-product-card>.producto-thumb{grid-area:thumb!important;width:46px!important;height:46px!important;min-width:46px!important;min-height:46px!important;max-width:46px!important;max-height:46px!important;object-fit:cover!important;border-radius:7px!important}
    #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>span:nth-child(2){grid-area:info!important;min-width:0!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important}
    #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>span:nth-child(3){grid-area:price!important;min-width:0!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;text-align:right!important}
    #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>.lista-item-acciones{grid-area:actions!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:5px!important;width:auto!important;min-width:0!important;overflow:hidden!important}
    #tab-productos #lista-productos.bc-productos-filas .lista-item-acciones button{height:30px!important;min-width:76px!important;max-width:92px!important;flex:0 0 auto!important;padding:5px 7px!important;font-size:10.5px!important;box-sizing:border-box!important;border-radius:7px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}

    /* CUADROS — tarjeta realmente cuadrada, imagen protagonista y texto debajo */
    #tab-productos #lista-productos.bc-productos-cards{
      display:grid!important;
      grid-template-columns:repeat(auto-fill,minmax(170px,1fr))!important;
      gap:12px!important;
      align-items:stretch!important;
      overflow:visible!important;
    }
    #tab-productos #lista-productos.bc-productos-cards>.bc-product-card{
      display:grid!important;
      grid-template-columns:1fr!important;
      grid-template-rows:minmax(0,1fr) auto auto!important;
      grid-template-areas:'thumb' 'info' 'price'!important;
      align-content:stretch!important;
      justify-items:stretch!important;
      width:100%!important;
      min-width:0!important;
      aspect-ratio:1 / 1!important;
      height:auto!important;
      min-height:0!important;
      max-height:none!important;
      margin:0!important;
      padding:12px!important;
      box-sizing:border-box!important;
      overflow:hidden!important;
      border-radius:12px!important;
      position:relative!important;
    }
    #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>img,
    #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>.bc-product-thumb,
    #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>.producto-thumb{
      grid-area:thumb!important;
      justify-self:center!important;
      align-self:center!important;
      display:block!important;
      width:min(78%,140px)!important;
      height:auto!important;
      aspect-ratio:1 / 1!important;
      min-width:0!important;
      min-height:0!important;
      max-width:140px!important;
      max-height:140px!important;
      object-fit:cover!important;
      border-radius:10px!important;
    }
    #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>span:nth-child(2){
      grid-area:info!important;
      min-width:0!important;
      max-width:100%!important;
      overflow:hidden!important;
      white-space:nowrap!important;
      text-overflow:ellipsis!important;
      text-align:center!important;
      font-size:12px!important;
      line-height:1.25!important;
      font-weight:600!important;
      padding-top:7px!important;
    }
    #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>span:nth-child(3){
      grid-area:price!important;
      min-width:0!important;
      max-width:100%!important;
      overflow:hidden!important;
      white-space:nowrap!important;
      text-overflow:ellipsis!important;
      text-align:center!important;
      color:var(--gold-bright)!important;
      font-weight:700!important;
      font-size:12px!important;
      line-height:1.2!important;
      padding-top:2px!important;
    }
    #tab-productos #lista-productos.bc-productos-cards>.bc-product-card>.lista-item-acciones{display:none!important}
    #tab-productos #lista-productos .bc-product-thumb{background:var(--void)!important;border:1px solid rgba(212,176,92,.15)!important;object-fit:cover!important}
    @media(max-width:860px){
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card{grid-template-columns:48px minmax(0,1fr) auto!important;grid-template-areas:'thumb info actions' 'thumb price actions'!important}
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>span:nth-child(3){text-align:left!important}
      #tab-productos #lista-productos.bc-productos-cards{grid-template-columns:repeat(auto-fill,minmax(155px,1fr))!important}
    }
    @media(max-width:620px){
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card{grid-template-columns:44px minmax(0,1fr) auto!important;height:62px!important;min-height:62px!important}
      #tab-productos #lista-productos.bc-productos-filas>.bc-product-card>img,#tab-productos #lista-productos.bc-productos-filas>.bc-product-card>.bc-product-thumb,#tab-productos #lista-productos.bc-productos-filas>.bc-product-card>.producto-thumb{width:40px!important;height:40px!important;min-width:40px!important;min-height:40px!important;max-width:40px!important;max-height:40px!important}
      #tab-productos #lista-productos.bc-productos-filas .lista-item-acciones button{min-width:64px!important;max-width:76px!important;font-size:9.5px!important}
      #tab-productos #lista-productos.bc-productos-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
      #tab-productos #lista-productos.bc-productos-cards>.bc-product-card{padding:10px!important;border-radius:10px!important}
    }
  `;document.head.appendChild(s)}
  function list(){return document.getElementById('lista-productos')}
  function view(){return localStorage.getItem(PREF)==='rows'?'rows':'cards'}
  function applyView(v){const l=list();if(!l)return;const rows=v==='rows';l.classList.toggle('bc-productos-filas',rows);l.classList.toggle('bc-productos-cards',!rows);document.querySelectorAll('#tab-productos .bc-m44-view-btn').forEach(b=>{b.classList.toggle('active',(b.dataset.view==='rows')===rows);b.setAttribute('aria-pressed',b.classList.contains('active')?'true':'false')});localStorage.setItem(PREF,rows?'rows':'cards')}
  function productFromCard(card){const id=card.getAttribute('data-ctx-id')||card.querySelector('.btn-editar-producto')?.dataset.id;return (_cache?.productos||[]).find(p=>String(p.id)===String(id))||null}
  function detail(p){if(!p)return;document.getElementById('bc-m47-detail')?.remove();const ov=document.createElement('div');ov.id='bc-m47-detail';ov.className='bc-m47-overlay';ov.innerHTML='<div class="bc-m47-modal"><div class="bc-m47-head"><div><h3>'+String(p.nombre||'Producto').replace(/[&<>\"']/g,'')+'</h3><p>Información del producto</p></div><button type="button" id="bc-m47-close" aria-label="Cerrar">×</button></div><div class="bc-m47-detail-grid"><div><span>Categoría</span><b>'+String(p.categorias?.nombre||'—')+'</b></div><div><span>Unidad</span><b>'+String(p.unidad||'—')+'</b></div><div><span>Precio normal</span><b>$'+money(p.precio_normal)+'</b></div><div><span>Precio mayorista</span><b>'+ (p.precio_mayorista!=null?'$'+money(p.precio_mayorista):'—')+'</b></div><div><span>Estado</span><b>'+ (p.activo===false?'Inactivo':'Activo')+'</b></div><div><span>Stock</span><b>'+money(stockTotalProducto(p.id))+'</b></div></div><div class="bc-m47-actions"><button type="button" id="bc-m47-edit">Editar</button><button type="button" id="bc-m47-close2">Cerrar</button></div></div>';document.body.appendChild(ov);ov.querySelector('#bc-m47-close').onclick=()=>ov.remove();ov.querySelector('#bc-m47-close2').onclick=()=>ov.remove();ov.querySelector('#bc-m47-edit').onclick=()=>{ov.remove();iniciarEdicionProducto(p)};ov.onclick=e=>{if(e.target===ov)ov.remove()}}
  function wire(){const l=list();if(!l||l.dataset.bcM47==='1')return;l.dataset.bcM47='1';l.addEventListener('click',e=>{if(view()!=='cards')return;if(e.target.closest('button'))return;const card=e.target.closest('.bc-product-card');if(card)detail(productFromCard(card))});}
  function boot(){css();wire();applyView(view());const obs=new MutationObserver(()=>{wire();applyView(view())});obs.observe(document.getElementById('tab-productos')||document.body,{childList:true,subtree:true});window.__BC_M47_OBS=obs}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,800));else setTimeout(boot,800);
})();