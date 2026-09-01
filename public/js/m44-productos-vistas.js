// BattleCruiser — M44.4: selector único de vista Productos + limpieza de control legacy
// Owner exclusivo: selección de vista + persistencia.
// La geometría pertenece EXCLUSIVAMENTE a M47.
(function(){
  'use strict';
  if(window.__bcM44ProductosVistasV4)return;
  window.__bcM44ProductosVistasV4=true;

  const PREF='bc_productos_vista_v1';
  const STYLE_ID='bc-m44-vistas-css';

  function injectCss(){
    const existing=document.getElementById(STYLE_ID);
    if(existing)existing.remove();
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      #tab-productos .bc-m44-view-tools{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:-4px 0 10px;flex-wrap:wrap}
      #tab-productos .bc-m44-view-label{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mist);margin-right:2px}
      #tab-productos .bc-m44-view-btn{border:1px solid rgba(212,176,92,.17)!important;background:rgba(18,42,36,.72)!important;color:var(--mist)!important;border-radius:8px!important;padding:7px 10px!important;font-size:.72rem!important;line-height:1!important;cursor:pointer!important}
      #tab-productos .bc-m44-view-btn.active{color:var(--gold-bright)!important;border-color:rgba(212,176,92,.42)!important;background:rgba(212,176,92,.09)!important}
      #tab-productos .bc-m44-view-btn:hover{border-color:rgba(212,176,92,.32)!important;color:var(--text)!important}
    `;
    document.head.appendChild(s);
  }

  function removeLegacyView(){
    const tab=document.getElementById('tab-productos');
    if(!tab)return;
    tab.querySelectorAll('#bc-productos-vista').forEach(function(el){el.remove()});
  }

  function getView(){return localStorage.getItem(PREF)==='rows'?'rows':'cards'}

  function setView(view){
    const list=document.getElementById('lista-productos');if(!list)return;
    const isRows=view==='rows';
    list.classList.toggle('bc-productos-filas',isRows);
    list.classList.toggle('bc-productos-cards',!isRows);
    localStorage.setItem(PREF,isRows?'rows':'cards');
    document.querySelectorAll('#tab-productos .bc-m44-view-btn').forEach(function(b){
      const active=b.dataset.view===view;
      b.classList.toggle('active',active);
      b.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function ensureTools(){
    const tab=document.getElementById('tab-productos');
    const list=document.getElementById('lista-productos');
    const search=document.getElementById('productos-buscar');
    if(!tab||!list)return;

    removeLegacyView();

    const toolbars=[...tab.querySelectorAll('.bc-m44-view-tools')];
    let tools=toolbars[0]||null;
    toolbars.slice(1).forEach(function(extra){extra.remove()});

    if(!tools){
      tools=document.createElement('div');
      tools.className='bc-m44-view-tools';
      tools.innerHTML='<span class="bc-m44-view-label">Vista</span><button type="button" class="bc-m44-view-btn" data-view="rows" aria-pressed="false">☷ Filas</button><button type="button" class="bc-m44-view-btn" data-view="cards" aria-pressed="false">▦ Cuadros</button>';
      if(search&&search.parentElement)search.parentElement.after(tools);else list.before(tools);
      tools.querySelectorAll('.bc-m44-view-btn').forEach(function(b){b.addEventListener('click',function(){setView(b.dataset.view)})});
    }

    const seen={rows:false,cards:false};
    tools.querySelectorAll('.bc-m44-view-btn').forEach(function(btn){
      const v=btn.dataset.view;
      if((v==='rows'||v==='cards')&&!seen[v]){seen[v]=true;return}
      btn.remove();
    });

    setView(getView());
  }

  function boot(){
    injectCss();
    ensureTools();
    setTimeout(ensureTools,600);
    setTimeout(ensureTools,1200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
