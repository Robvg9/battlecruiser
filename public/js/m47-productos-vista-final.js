// BattleCruiser — M47.5: ÚNICA autoridad geométrica Productos (Filas vs Cuadros)
// M44 controla selección/persistencia. M43 solo marca cards + botones.
// M38 solo marca .bc-product-card. Este módulo define TODA la geometría.
(function(){
  'use strict';
  if(window.__bcM47ProductosFinalV5)return;
  window.__bcM47ProductosFinalV5=true;

  const PREF='bc_productos_vista_v1';
  const STYLE='bc-m47-productos-final';

  function css(){
    // Reinyectar al final de head para ganar cascada frente a legacy
    const old=document.getElementById(STYLE);
    if(old)old.remove();
    // Limpiar restos de CSS competidores de misiones anteriores
    const legacyIds=['bc-m43-productos-css-v2','bc-m44-vistas-css'];
    // No borrar bc-m44-vistas-css si M44.2 ya lo reescribió sin geometría;
    // solo asegurar que no quede la regla flex-column huérfana vía nuestro STYLE.
    const s=document.createElement('style');
    s.id=STYLE;
    s.textContent=`
      #tab-productos #lista-productos{
        width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;
      }

      /* ========== FILAS: ~4 horizontales/escritorio, rectangular ========== */
      #tab-productos #lista-productos.bc-productos-filas{
        display:grid!important;
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:12px!important;
        align-items:stretch!important;
        overflow:visible!important;
        flex-direction:unset!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card,
      #tab-productos #lista-productos.bc-productos-filas > .lista-item{
        display:flex!important;
        flex-direction:row!important;
        align-items:center!important;
        width:100%!important;
        min-width:0!important;
        max-width:100%!important;
        aspect-ratio:1.85 / 1!important;
        height:auto!important;
        min-height:0!important;
        max-height:none!important;
        margin:0!important;
        padding:10px!important;
        box-sizing:border-box!important;
        overflow:hidden!important;
        border-radius:11px!important;
        grid-template-columns:unset!important;
        grid-template-rows:unset!important;
        grid-template-areas:unset!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > img,
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > .bc-product-thumb,
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > .producto-thumb,
      #tab-productos #lista-productos.bc-productos-filas > .lista-item > img,
      #tab-productos #lista-productos.bc-productos-filas > .lista-item > .producto-thumb{
        flex:0 0 52px!important;
        width:52px!important;height:52px!important;
        min-width:52px!important;min-height:52px!important;
        max-width:52px!important;max-height:52px!important;
        object-fit:cover!important;border-radius:8px!important;
        margin-right:10px!important;
        aspect-ratio:1 / 1!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > span:nth-child(2),
      #tab-productos #lista-productos.bc-productos-filas > .lista-item > span:nth-child(2){
        flex:1 1 auto!important;min-width:0!important;max-width:100%!important;
        overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;
        line-height:1.25!important;font-size:12px!important;font-weight:600!important;text-align:left!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > span:nth-child(3),
      #tab-productos #lista-productos.bc-productos-filas > .lista-item > span:nth-child(3){
        flex:0 1 auto!important;min-width:0!important;max-width:40%!important;margin-left:auto!important;
        overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;
        line-height:1.2!important;font-size:12px!important;font-weight:700!important;
        color:var(--gold-bright)!important;text-align:right!important;
      }
      #tab-productos #lista-productos.bc-productos-filas > .bc-product-card > .lista-item-acciones,
      #tab-productos #lista-productos.bc-productos-filas > .lista-item > .lista-item-acciones{
        display:none!important;
      }

      /* ========== CUADROS: ~6–8 cuadrados/escritorio ========== */
      #tab-productos #lista-productos.bc-productos-cards{
        display:grid!important;
        grid-template-columns:repeat(auto-fill,minmax(130px,1fr))!important;
        gap:10px!important;
        align-items:stretch!important;
        overflow:visible!important;
        flex-direction:unset!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card,
      #tab-productos #lista-productos.bc-productos-cards > .lista-item{
        display:grid!important;
        grid-template-columns:1fr!important;
        grid-template-rows:minmax(0,1fr) auto auto!important;
        grid-template-areas:'thumb' 'info' 'price'!important;
        align-content:stretch!important;justify-items:stretch!important;
        width:100%!important;min-width:0!important;max-width:100%!important;
        aspect-ratio:1 / 1!important;
        height:auto!important;min-height:0!important;max-height:none!important;
        margin:0!important;padding:10px!important;box-sizing:border-box!important;
        overflow:hidden!important;border-radius:11px!important;position:relative!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > img,
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > .bc-product-thumb,
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > .producto-thumb,
      #tab-productos #lista-productos.bc-productos-cards > .lista-item > img,
      #tab-productos #lista-productos.bc-productos-cards > .lista-item > .producto-thumb{
        grid-area:thumb!important;justify-self:center!important;align-self:center!important;
        display:block!important;width:min(78%,120px)!important;height:auto!important;
        aspect-ratio:1 / 1!important;min-width:0!important;min-height:0!important;
        max-width:120px!important;max-height:120px!important;object-fit:cover!important;border-radius:9px!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > span:nth-child(2),
      #tab-productos #lista-productos.bc-productos-cards > .lista-item > span:nth-child(2){
        grid-area:info!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;
        white-space:nowrap!important;text-overflow:ellipsis!important;text-align:center!important;
        font-size:11.5px!important;line-height:1.2!important;font-weight:600!important;padding-top:6px!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > span:nth-child(3),
      #tab-productos #lista-productos.bc-productos-cards > .lista-item > span:nth-child(3){
        grid-area:price!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;
        white-space:nowrap!important;text-overflow:ellipsis!important;text-align:center!important;
        color:var(--gold-bright)!important;font-weight:700!important;font-size:11.5px!important;
        line-height:1.15!important;padding-top:2px!important;
      }
      #tab-productos #lista-productos.bc-productos-cards > .bc-product-card > .lista-item-acciones,
      #tab-productos #lista-productos.bc-productos-cards > .lista-item > .lista-item-acciones{
        display:none!important;
      }
      #tab-productos #lista-productos .bc-product-thumb,
      #tab-productos #lista-productos .producto-thumb{
        background:var(--void)!important;border:1px solid rgba(212,176,92,.15)!important;object-fit:cover!important;
      }

      @media(max-width:1100px){
        #tab-productos #lista-productos.bc-productos-filas{grid-template-columns:repeat(3,minmax(0,1fr))!important}
        #tab-productos #lista-productos.bc-productos-filas > .bc-product-card,
        #tab-productos #lista-productos.bc-productos-filas > .lista-item{aspect-ratio:1.7 / 1!important}
      }
      @media(max-width:760px){
        #tab-productos #lista-productos.bc-productos-filas{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        #tab-productos #lista-productos.bc-productos-filas > .bc-product-card,
        #tab-productos #lista-productos.bc-productos-filas > .lista-item{aspect-ratio:1.55 / 1!important}
        #tab-productos #lista-productos.bc-productos-cards{grid-template-columns:repeat(4,minmax(0,1fr))!important}
      }
      @media(max-width:520px){
        #tab-productos #lista-productos.bc-productos-filas{grid-template-columns:1fr!important}
        #tab-productos #lista-productos.bc-productos-filas > .bc-product-card,
        #tab-productos #lista-productos.bc-productos-filas > .lista-item{aspect-ratio:auto!important;min-height:64px!important}
        #tab-productos #lista-productos.bc-productos-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}
      }

      /* Modal detalle M47 */
      .bc-m47-overlay{position:fixed;inset:0;background:rgba(6,14,11,.72);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px}
      .bc-m47-modal{background:var(--stone);border:1px solid rgba(212,176,92,.28);border-radius:14px;max-width:420px;width:100%;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.5)}
      .bc-m47-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
      .bc-m47-head h3{margin:0;font-size:18px;color:var(--gold)}
      .bc-m47-head p{margin:4px 0 0;font-size:12px;color:var(--mist)}
      .bc-m47-head button{background:transparent;border:none;color:var(--mist);font-size:22px;cursor:pointer;line-height:1}
      .bc-m47-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
      .bc-m47-detail-grid div{background:var(--void);border-radius:8px;padding:10px}
      .bc-m47-detail-grid span{display:block;font-size:10px;text-transform:uppercase;color:var(--mist);margin-bottom:4px}
      .bc-m47-detail-grid b{font-size:13px;color:var(--text)}
      .bc-m47-actions{display:flex;gap:8px;justify-content:flex-end}
      .bc-m47-actions button{padding:8px 14px;border-radius:8px;border:1px solid rgba(212,176,92,.25);background:rgba(212,176,92,.1);color:var(--text);cursor:pointer;font-size:13px}
    `;
    document.head.appendChild(s);
  }

  function list(){return document.getElementById('lista-productos')}
  function view(){return localStorage.getItem(PREF)==='rows'?'rows':'cards'}
  function applyView(v){
    const l=list();
    if(!l)return;
    const rows=v==='rows';
    l.classList.toggle('bc-productos-filas',rows);
    l.classList.toggle('bc-productos-cards',!rows);
    // Garantizar exclusividad de clases
    if(rows){l.classList.remove('bc-productos-cards');l.classList.add('bc-productos-filas')}
    else{l.classList.remove('bc-productos-filas');l.classList.add('bc-productos-cards')}
    document.querySelectorAll('#tab-productos .bc-m44-view-btn').forEach(b=>{
      const active=b.dataset.view===v;
      b.classList.toggle('active',active);
      b.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function productFromCard(card){
    const id=card.getAttribute('data-ctx-id')||card.querySelector('.btn-editar-producto')?.dataset.id;
    return (_cache?.productos||[]).find(p=>String(p.id)===String(id))||null;
  }

  function detail(p){
    if(!p)return;
    document.getElementById('bc-m47-detail')?.remove();
    const ov=document.createElement('div');ov.id='bc-m47-detail';ov.className='bc-m47-overlay';
    ov.innerHTML='<div class="bc-m47-modal"><div class="bc-m47-head"><div><h3>'+String(p.nombre||'Producto').replace(/[&<>"']/g,'')+'</h3><p>Información del producto</p></div><button type="button" id="bc-m47-close" aria-label="Cerrar">×</button></div><div class="bc-m47-detail-grid"><div><span>Categoría</span><b>'+String(p.categorias?.nombre||'—')+'</b></div><div><span>Unidad</span><b>'+String(p.unidad||'—')+'</b></div><div><span>Precio normal</span><b>$'+money(p.precio_normal)+'</b></div><div><span>Precio mayorista</span><b>'+(p.precio_mayorista!=null?'$'+money(p.precio_mayorista):'—')+'</b></div><div><span>Estado</span><b>'+(p.activo===false?'Inactivo':'Activo')+'</b></div><div><span>Stock</span><b>'+money(stockTotalProducto(p.id))+'</b></div></div><div class="bc-m47-actions"><button type="button" id="bc-m47-edit">Editar</button><button type="button" id="bc-m47-close2">Cerrar</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#bc-m47-close').onclick=()=>ov.remove();
    ov.querySelector('#bc-m47-close2').onclick=()=>ov.remove();
    ov.querySelector('#bc-m47-edit').onclick=()=>{ov.remove();iniciarEdicionProducto(p)};
    ov.onclick=e=>{if(e.target===ov)ov.remove()};
  }

  function wire(){
    const l=list();if(!l||l.dataset.bcM47==='1')return;
    l.dataset.bcM47='1';
    l.addEventListener('click',e=>{
      if(view()!=='cards')return;
      if(e.target.closest('button'))return;
      const card=e.target.closest('.bc-product-card,.lista-item');
      if(card)detail(productFromCard(card));
    });
  }

  function boot(){
    css();
    wire();
    applyView(view());
    // Reafirmar geometría tras posibles inyectores tardíos de M43/M44
    setTimeout(function(){css();applyView(view())},700);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,500)});
  else setTimeout(boot,500);
})();
