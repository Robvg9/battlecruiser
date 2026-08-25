// BattleCruiser — M26.10-FE estable: categorías + tema visual elegante
(function () {
  'use strict';
  var FLAG = '__bcM2610stable';
  if (window[FLAG]) return;
  window[FLAG] = true;

  function sameId(a,b){ return a != null && b != null && String(a) === String(b); }

  function injectTheme() {
    if (document.getElementById('bc-elegant-theme')) return;
    var s = document.createElement('style');
    s.id = 'bc-elegant-theme';
    s.textContent = [
      ':root{--bc-ink:#17211f;--bc-paper:#f7f4ee;--bc-card:rgba(255,255,255,.94);--bc-line:#ded7ca;--bc-gold:#b89245;--bc-gold-soft:#efe4cb;--bc-text:#26322f;--bc-muted:#74807b}',
      'body{background:radial-gradient(circle at top left,#fbfaf7 0,#f4f0e8 42%,#eee9df 100%)!important;color:var(--bc-text)}',
      '.app-header,.topbar,.header-bar{background:rgba(255,255,255,.88)!important;border-bottom:1px solid var(--bc-line)!important;box-shadow:0 6px 24px rgba(44,39,30,.06)!important;backdrop-filter:blur(12px)}',
      '.card,.m21-card,.panel,.section-card,.dashboard-card,.lista-item{background:var(--bc-card)!important;border:1px solid var(--bc-line)!important;border-radius:16px!important;box-shadow:0 10px 30px rgba(44,39,30,.06)!important}',
      'button,.cc-accion,.tab-btn{border-radius:10px!important}',
      'input,select,textarea{border:1px solid var(--bc-line)!important;border-radius:10px!important;background:#fffdf9!important;color:var(--bc-text)!important;box-shadow:none!important}',
      'h1,h2,h3,h4{letter-spacing:.01em;color:#25302d!important}',
      '.muted,.lista-estado,.msg{color:var(--bc-muted)!important}',
      '#tab-ventas.bc-pos{background:transparent!important}',
      '#tab-ventas.bc-pos .venta-operativa-bloque{background:transparent!important}',
      '#tab-ventas.bc-pos #venta-modo-catalogo{padding:0!important}',
      '#tab-ventas.bc-pos .catalogo-grid{gap:12px!important}',
      '#tab-ventas.bc-pos .catalogo-card{background:rgba(255,255,255,.94)!important;border:1px solid var(--bc-line)!important;border-radius:14px!important;box-shadow:0 8px 22px rgba(44,39,30,.05)!important;padding:12px!important}',
      '#tab-ventas.bc-pos .catalogo-card-precio{color:#9a7737!important}',
      '#tab-ventas.bc-pos .catalogo-chip{background:#fffdf9!important;color:#59645f!important;border:1px solid var(--bc-line)!important;min-height:34px!important;padding:7px 12px!important}',
      '#tab-ventas.bc-pos .catalogo-chip.activo{background:linear-gradient(180deg,#cfb06c,#b89245)!important;color:#fff!important;border-color:transparent!important}',
      '#tab-ventas.bc-pos .bc-venta-carrito-bar{background:rgba(255,255,255,.96)!important;border:1px solid var(--bc-line)!important;border-radius:16px!important;box-shadow:0 12px 32px rgba(44,39,30,.08)!important;padding:10px!important}',
      '#tab-ventas.bc-pos .venta-total{background:#fbf7ee!important;border:1px solid #e7dcc8!important}',
      '#tab-ventas.bc-pos .venta-total-valor{font-size:22px!important;color:#7d612e!important}',
      '#tab-ventas.bc-pos .btn-confirmar-venta{min-height:44px!important;font-size:14px!important;border-radius:10px!important}',
      '#bc-m273-cerrar-sesion-btn{display:inline-flex!important;width:auto!important;max-width:240px!important;min-height:40px!important;height:40px!important;margin:10px 0 8px!important;padding:0 16px!important;align-items:center!important;justify-content:center!important;font-size:13px!important;border-radius:10px!important}',
      '.tab-panel{background:transparent!important}',
      '.tabs,.tab-buttons{gap:6px!important}',
      '.tab-btn{font-size:13px!important;padding:9px 12px!important}',
      '@media(max-width:700px){.card,.m21-card,.panel,.section-card,.dashboard-card{border-radius:14px!important}.catalogo-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}'
    ].join('');
    document.head.appendChild(s);
  }

  function activeCategories(rows){ return (Array.isArray(rows) ? rows : []).filter(function(c){ return c && c.id != null && c.nombre && c.activo !== false; }); }

  async function ensureCategories(){
    var rows=[];
    try{ if(typeof cargarCategorias==='function') rows=await Promise.resolve(cargarCategorias()); }catch(e){}
    window.ventaCategoriasLista=activeCategories(rows);
    if(typeof catalogoCategoriaActiva==='undefined' || catalogoCategoriaActiva==null) window.catalogoCategoriaActiva='';
  }

  function renderCategories(){
    var cont=document.getElementById('catalogo-categorias');
    if(!cont) return;
    var cats=activeCategories(window.ventaCategoriasLista || []);
    var active=String(window.catalogoCategoriaActiva || '');
    cont.innerHTML='';
    [{id:'',nombre:'Todos'}].concat(cats).forEach(function(c){
      var b=document.createElement('button'); b.type='button'; b.className='catalogo-chip'+(String(c.id||'')===active?' activo':'');
      b.dataset.categoriaId=c.id != null ? String(c.id) : ''; b.textContent=c.nombre; cont.appendChild(b);
    });
  }

  function patchCategoryClick(){
    var cont=document.getElementById('catalogo-categorias'); if(!cont||cont.dataset.bcCatClick==='1') return;
    cont.dataset.bcCatClick='1';
    cont.addEventListener('click',function(e){
      var b=e.target.closest('.catalogo-chip'); if(!b) return;
      window.catalogoCategoriaActiva=b.dataset.categoriaId||'';
      renderCategories();
      try{ if(typeof renderCatalogoGrid==='function') renderCatalogoGrid(); }catch(x){}
    });
  }

  async function enterVentas(){
    await ensureCategories();
    renderCategories();
    patchCategoryClick();
    try{ if(typeof renderCatalogoGrid==='function') renderCatalogoGrid(); }catch(e){}
  }

  function bind(){
    var tabs=document.getElementById('tabs');
    if(!tabs||tabs.dataset.bcM2610stable==='1') return;
    tabs.dataset.bcM2610stable='1';
    tabs.addEventListener('click',function(e){ var b=e.target.closest('.tab-btn[data-tab="ventas"]'); if(b) enterVentas().catch(function(){}); },true);
    var tab=document.getElementById('tab-ventas'); if(tab&&tab.classList.contains('visible')) enterVentas().catch(function(){});
  }

  function boot(){ injectTheme(); bind(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(boot,450); }); else setTimeout(boot,450);
})();
