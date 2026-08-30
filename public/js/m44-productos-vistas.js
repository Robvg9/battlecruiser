// BattleCruiser — M44.1: selector de vista Productos (filas / cuadros)
(function(){
  'use strict';
  if(window.__bcM44ProductosVistas)return;
  window.__bcM44ProductosVistas=true;

  const PREF='bc_productos_vista_v1';
  const STYLE_ID='bc-m44-vistas-css';

  function injectCss(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      #tab-productos .bc-m44-view-tools{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:-4px 0 10px;flex-wrap:wrap}
      #tab-productos .bc-m44-view-label{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mist);margin-right:2px}
      #tab-productos .bc-m44-view-btn{border:1px solid rgba(212,176,92,.17)!important;background:rgba(18,42,36,.72)!important;color:var(--mist)!important;border-radius:8px!important;padding:7px 10px!important;font-size:.72rem!important;line-height:1!important;cursor:pointer!important}
      #tab-productos .bc-m44-view-btn.active{color:var(--gold-bright)!important;border-color:rgba(212,176,92,.42)!important;background:rgba(212,176,92,.09)!important}
      #tab-productos .bc-m44-view-btn:hover{border-color:rgba(212,176,92,.32)!important;color:var(--text)!important}
      #tab-productos #lista-productos.bc-productos-filas{display:flex!important;flex-direction:column!important;gap:8px!important}
    `;
    document.head.appendChild(s);
  }

  function getView(){return localStorage.getItem(PREF)==='rows'?'rows':'cards'}
  function setView(view){
    const list=document.getElementById('lista-productos');if(!list)return;
    const isRows=view==='rows';
    list.classList.toggle('bc-productos-filas',isRows);
    list.classList.toggle('bc-productos-cards',!isRows);
    localStorage.setItem(PREF,isRows?'rows':'cards');
    document.querySelectorAll('#tab-productos .bc-m44-view-btn').forEach(function(b){b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',b.dataset.view===view?'true':'false')});
  }
  function ensureTools(){
    const tab=document.getElementById('tab-productos');const list=document.getElementById('lista-productos');const search=document.getElementById('productos-buscar');
    if(!tab||!list)return;
    let tools=tab.querySelector('.bc-m44-view-tools');
    if(!tools){
      tools=document.createElement('div');tools.className='bc-m44-view-tools';
      tools.innerHTML='<span class="bc-m44-view-label">Vista</span><button type="button" class="bc-m44-view-btn" data-view="rows" aria-pressed="false">☷ Filas</button><button type="button" class="bc-m44-view-btn" data-view="cards" aria-pressed="false">▦ Cuadros</button>';
      if(search&&search.parentElement)search.parentElement.after(tools);else list.before(tools);
      tools.querySelectorAll('.bc-m44-view-btn').forEach(function(b){b.addEventListener('click',function(){setView(b.dataset.view)})});
    }
    setView(getView());
  }

  function boot(){injectCss();ensureTools();setTimeout(ensureTools,600)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
