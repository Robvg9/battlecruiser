// BattleCruiser — M41: reparación definitiva del layout de Productos
(function(){
  'use strict';
  if(window.__bcM41ProductosFix)return; window.__bcM41ProductosFix=true;
  const LIST='lista-productos';
  const $=id=>document.getElementById(id);
  const esc=v=>typeof escHtml==='function'?escHtml(v==null?'':String(v)):String(v==null?'':v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>typeof window.money==='function'?window.money(Number(v)||0):(Number(v)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  function getProduct(item){const id=item?.dataset?.ctxId;return ((_cache&&_cache.productos)||[]).find(p=>String(p.id)===String(id))||null}
  function rebuild(item){
    if(!(item instanceof HTMLElement)||item.dataset.bcM41Built==='1')return;
    const p=getProduct(item); if(!p)return;
    item.dataset.bcM41Built='1';item.classList.add('bc-product-card');
    item.innerHTML='';
    const media=document.createElement('div');media.className='bc-product-media';
    if(p.imagen_url){const img=document.createElement('img');img.src=p.imagen_url;img.alt='';img.loading='lazy';img.className='bc-product-image';media.appendChild(img)}else{const empty=document.createElement('span');empty.className='bc-product-image bc-product-image-empty';empty.textContent='✦';empty.setAttribute('aria-hidden','true');media.appendChild(empty)}
    const body=document.createElement('div');body.className='bc-product-body';
    const name=document.createElement('div');name.className='bc-product-name';name.textContent=p.nombre||'Producto';
    const meta=document.createElement('div');meta.className='bc-product-meta';const bits=[];if(p.categorias?.nombre)bits.push(p.categorias.nombre);if(p.presentaciones?.nombre)bits.push(p.presentaciones.nombre);if(p.unidad)bits.push(p.unidad);meta.textContent=bits.join(' · ')||'Sin clasificación';
    const stats=document.createElement('div');stats.className='bc-product-stats';stats.innerHTML='<span>Normal <b>$'+money(p.precio_normal)+'</b></span><span>Mayorista <b>$'+money(p.precio_mayorista)+'</b></span><span>Stock <b>'+money(stockTotalProducto(p.id))+'</b></span>';
    body.appendChild(name);body.appendChild(meta);body.appendChild(stats);
    const actions=document.createElement('div');actions.className='bc-product-actions';
    if(typeof tienePermiso==='function'&&tienePermiso('productos','editar')){
      const edit=document.createElement('button');edit.type='button';edit.className='btn-editar-producto';edit.dataset.id=p.id;edit.textContent='Editar';
      const toggle=document.createElement('button');toggle.type='button';toggle.className='btn-toggle-producto';toggle.dataset.id=p.id;toggle.dataset.activo=p.activo!==false?'true':'false';toggle.textContent=p.activo===false?'Activar':'Desactivar';
      actions.appendChild(edit);actions.appendChild(toggle);
    }
    item.appendChild(media);item.appendChild(body);item.appendChild(actions);
    item.setAttribute('aria-label',(p.nombre||'Producto')+(p.activo===false?' — Inactivo':''));
  }
  function mark(){const l=$(LIST);if(!l)return;l.classList.add('bc-productos-clean');[...l.children].forEach(rebuild)}
  function wireViewClasses(){
    const l=$(LIST);if(!l)return;
    const candidates=['productos-vista-filas','productos-vista-cuadros','bc-productos-row','bc-productos-grid','vista-filas','vista-cuadros'];
    candidates.forEach(c=>l.classList.remove(c));
    const controls=[...document.querySelectorAll('#tab-productos button, #tab-productos [role="button"]')];
    const fila=controls.find(b=>/fila|lista/i.test((b.textContent||'').trim()));
    const cuadro=controls.find(b=>/cuadro|tarjeta|grid/i.test((b.textContent||'').trim()));
    if(fila&&fila.classList.contains('active'))l.classList.add('bc-productos-row');
    else if(cuadro&&cuadro.classList.contains('active'))l.classList.add('bc-productos-grid');
    else l.classList.add('bc-productos-grid');
  }
  function css(){
    if($('m41-productos-css'))return;
    const s=document.createElement('style');s.id='m41-productos-css';s.textContent=`#lista-productos.bc-productos-clean{width:100%;min-width:0;display:grid!important;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;align-items:stretch;overflow:visible!important}#lista-productos.bc-productos-clean .bc-product-card{width:100%;min-width:0;max-width:100%;min-height:116px;display:grid!important;grid-template-columns:64px minmax(0,1fr) auto;grid-template-areas:"media body actions";gap:11px;align-items:center;margin:0!important;padding:12px!important;overflow:hidden!important;border:1px solid rgba(212,176,92,.15)!important;border-radius:13px!important;background:linear-gradient(180deg,rgba(26,56,48,.76),rgba(18,42,36,.72))!important;box-shadow:0 6px 20px rgba(0,0,0,.15);position:relative}#lista-productos.bc-productos-clean .bc-product-card:hover{border-color:rgba(212,176,92,.33)!important;box-shadow:0 9px 24px rgba(0,0,0,.22)}.bc-product-media{grid-area:media;width:64px;height:64px;min-width:64px}.bc-product-image{display:block;width:64px!important;height:64px!important;min-width:64px!important;min-height:64px!important;max-width:64px!important;max-height:64px!important;object-fit:cover!important;border-radius:10px!important;border:1px solid rgba(212,176,92,.16);background:var(--void);overflow:hidden}.bc-product-image-empty{display:grid;place-items:center;color:var(--gold-dim);font-size:18px}.bc-product-body{grid-area:body;min-width:0;width:100%;overflow:hidden}.bc-product-name{font-size:14px;font-weight:700;line-height:1.2;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bc-product-meta{margin-top:4px;font-size:10.5px;color:var(--mist);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bc-product-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:9px;font:9.5px 'IBM Plex Mono',monospace;color:var(--mist-dim)}.bc-product-stats span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bc-product-stats b{color:var(--text);font-weight:600}.bc-product-actions{grid-area:actions;display:flex;flex-direction:column;justify-content:center;align-items:stretch;gap:6px;width:92px;min-width:92px;max-width:92px}.bc-product-actions button{width:100%!important;min-width:0!important;max-width:100%!important;height:34px!important;margin:0!important;padding:6px 7px!important;border-radius:8px!important;font-size:11px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;box-sizing:border-box!important}.bc-product-actions .btn-editar-producto{background:rgba(212,176,92,.09);border:1px solid rgba(212,176,92,.22);color:var(--text)}.bc-product-actions .btn-toggle-producto{background:rgba(196,74,90,.07);border:1px solid rgba(196,74,90,.2);color:var(--text)}#lista-productos.bc-productos-clean.bc-productos-row{display:flex!important;flex-direction:column!important;gap:7px}#lista-productos.bc-productos-clean.bc-productos-row .bc-product-card{grid-template-columns:56px minmax(0,1fr) auto;min-height:82px;padding:9px 11px!important;border-radius:10px!important}#lista-productos.bc-productos-clean.bc-productos-row .bc-product-media,#lista-productos.bc-productos-clean.bc-productos-row .bc-product-image{width:56px!important;height:56px!important;min-width:56px!important;min-height:56px!important}#lista-productos.bc-productos-clean.bc-productos-row .bc-product-stats{margin-top:6px}#lista-productos.bc-productos-clean.bc-productos-row .bc-product-actions{width:86px;min-width:86px;max-width:86px}#lista-productos.bc-productos-clean.bc-productos-row .bc-product-actions button{height:31px!important}#lista-productos.bc-productos-clean .lista-item-inactivo{opacity:.72}@media(max-width:760px){#lista-productos.bc-productos-clean{grid-template-columns:1fr}.bc-product-actions{width:84px;min-width:84px;max-width:84px}.bc-product-stats{grid-template-columns:1fr 1fr}.bc-product-stats span:last-child{grid-column:1/-1}#lista-productos.bc-productos-clean.bc-productos-row .bc-product-card{grid-template-columns:54px minmax(0,1fr);grid-template-areas:"media body" "media actions";row-gap:7px}#lista-productos.bc-productos-clean.bc-productos-row .bc-product-actions{width:100%;max-width:none;min-width:0;flex-direction:row;justify-content:flex-start}#lista-productos.bc-productos-clean.bc-productos-row .bc-product-actions button{width:calc(50% - 3px)!important}}`;
    document.head.appendChild(s);
  }
  function boot(){css();mark();wireViewClasses();const l=$(LIST);if(!l||l.dataset.bcM41Obs==='1')return;l.dataset.bcM41Obs='1';const obs=new MutationObserver(()=>{mark();wireViewClasses()});obs.observe(l,{childList:true,subtree:true});new MutationObserver(wireViewClasses).observe($('tab-productos'),{attributes:true,subtree:true,childList:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,350));else setTimeout(boot,350);
})();