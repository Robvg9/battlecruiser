// BattleCruiser — Misión D
// Stock bajo/agotado + disponibilidad de reposición interna desde almacenes de almacenamiento.
(function(){
  'use strict';
  const STYLE_ID='bc-mision-d-style';
  const ROOT_ID='bc-stock-reposicion';

  function esc(v){
    if(typeof escHtml==='function') return escHtml(v==null?'':String(v));
    return String(v==null?'':v).replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  }
  function n(v){return Number(v)||0;}
  function moneyLocal(v){return typeof money==='function'?money(v):n(v).toLocaleString('es-ES');}
  function labelTipo(t){return t==='mayorista'?'Mayorista':'Minorista';}

  function injectStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');s.id=STYLE_ID;
    s.textContent=`
      #${ROOT_ID}{margin-top:18px}
      .bc-stock-d-filtros{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:12px 0}
      .bc-stock-d-filtros label{display:flex;flex-direction:column;gap:5px;font-weight:700}
      .bc-stock-d-filtros select{min-width:170px}
      .bc-stock-d-estados{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px}
      .bc-stock-d-estados button{font-weight:800}
      .bc-stock-d-estados button.active{outline:2px solid var(--bc-accent,#d9c48c)}
      .bc-stock-d-row{display:grid;grid-template-columns:minmax(180px,1.5fr) repeat(4,minmax(90px,.8fr));gap:10px;align-items:center;padding:13px;border:1px solid var(--bc-border,rgba(184,160,106,.22));border-radius:10px;margin-bottom:8px;background:var(--bc-surface,#10181d);color:var(--bc-text,#eeeae0)}
      .bc-stock-d-name{font-weight:800}.bc-stock-d-dest{font-weight:700}.bc-stock-d-meta{font-size:.88em;color:var(--bc-muted,#a9afb0)}
      .bc-stock-d-ok{font-weight:800}.bc-stock-d-no{font-weight:800}.bc-stock-d-zero{font-weight:900}
      .bc-stock-d-empty{padding:18px;border:1px dashed var(--bc-border,#c8d0d6);border-radius:10px;color:var(--bc-muted,#59636b)}
      @media(max-width:850px){.bc-stock-d-row{grid-template-columns:1fr 1fr}.bc-stock-d-row .bc-stock-d-name{grid-column:1/-1}}
    `;
    document.head.appendChild(s);
  }

  function ensureRoot(){
    if(document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);
    const inv=document.getElementById('tab-inventario');
    if(!inv) return null;
    const root=document.createElement('div');root.id=ROOT_ID;root.className='cc-bloque';
    root.innerHTML=`
      <h3>Stock bajo y reposición interna</h3>
      <p class="muted">Detecta faltantes en puntos de venta y si existe existencia en almacenes de almacenamiento para mover internamente.</p>
      <div class="bc-stock-d-filtros">
        <label>Destino<select id="bc-stock-d-destino"><option value="">Todos</option><option value="minorista">Minoristas</option><option value="mayorista">Mayoristas</option></select></label>
        <button type="button" id="bc-stock-d-refrescar" class="cc-accion">Refrescar</button>
      </div>
      <div class="bc-stock-d-estados" role="group" aria-label="Filtros de stock bajo">
        <button type="button" class="cc-accion active" data-d-filter="todos">Todos</button>
        <button type="button" class="cc-accion" data-d-filter="agotados">Agotados</button>
        <button type="button" class="cc-accion" data-d-filter="con_reposicion">Con reposición interna</button>
        <button type="button" class="cc-accion" data-d-filter="sin_reposicion">Sin reposición interna</button>
      </div>
      <div id="bc-stock-d-lista" class="lista"><div class="bc-stock-d-empty">Cargando alertas…</div></div>
      <p class="msg" id="bc-stock-d-msg"></p>`;
    inv.appendChild(root);return root;
  }

  let filtro='todos', cargando=false;
  async function cargar(){
    const root=ensureRoot();if(!root||cargando)return;
    const lista=root.querySelector('#bc-stock-d-lista'),msg=root.querySelector('#bc-stock-d-msg');
    const destino=root.querySelector('#bc-stock-d-destino').value||null;
    cargando=true;lista.innerHTML='<div class="bc-stock-d-empty">Cargando alertas…</div>';msg.textContent='';
    try{
      const {data,error}=await client.rpc('listar_stock_bajo_reposicion',{p_filtro:filtro,p_destino_tipo:destino});
      if(error)throw error;
      render(lista,Array.isArray(data)?data:[]);
    }catch(e){
      console.warn('[BattleCruiser] Misión D',e);
      lista.innerHTML='<div class="bc-stock-d-empty">No se pudo cargar el análisis de stock.</div>';
      msg.textContent=(e&&e.message)?e.message:'Error de consulta';
    }finally{cargando=false;}
  }

  function render(lista,rows){
    if(!rows.length){lista.innerHTML='<div class="bc-stock-d-empty">No hay productos que coincidan con este filtro.</div>';return;}
    lista.innerHTML=rows.map(r=>{
      const agotado=n(r.existencia_destino)<=0;
      const repos=n(r.existencia_almacenamiento)>0;
      const fuentes=Array.isArray(r.almacenes_fuente)?r.almacenes_fuente:[];
      const fuenteTxt=fuentes.length?fuentes.map(f=>esc(f.almacen)+' ('+moneyLocal(f.cantidad)+')').join(', '):'Sin existencia en almacenamiento';
      return `<div class="bc-stock-d-row">
        <div class="bc-stock-d-name">${esc(r.producto)}<div class="bc-stock-d-meta">${esc(r.destino_almacen)} · ${labelTipo(r.destino_tipo)}</div></div>
        <div><span class="bc-stock-d-meta">Existencia</span><br><b class="${agotado?'bc-stock-d-zero':''}">${moneyLocal(r.existencia_destino)}</b></div>
        <div><span class="bc-stock-d-meta">Mínimo</span><br><b>${moneyLocal(r.minimo_destino)}</b></div>
        <div><span class="bc-stock-d-meta">Faltante</span><br><b>${moneyLocal(r.faltante)}</b></div>
        <div><span class="bc-stock-d-meta">Reposición</span><br><b class="${repos?'bc-stock-d-ok':'bc-stock-d-no'}">${repos?moneyLocal(r.cantidad_reponible)+' disponible':'No disponible'}</b><div class="bc-stock-d-meta">${fuenteTxt}</div></div>
      </div>`;
    }).join('');
  }

  function bind(){
    const root=ensureRoot();if(!root||root.dataset.bound)return;root.dataset.bound='1';
    root.querySelectorAll('[data-d-filter]').forEach(btn=>btn.addEventListener('click',()=>{
      filtro=btn.dataset.dFilter;root.querySelectorAll('[data-d-filter]').forEach(x=>x.classList.toggle('active',x===btn));cargar();
    }));
    root.querySelector('#bc-stock-d-destino').addEventListener('change',cargar);
    root.querySelector('#bc-stock-d-refrescar').addEventListener('click',cargar);
  }
  function init(){injectStyle();const root=ensureRoot();if(root){bind();cargar();}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.addEventListener('pageshow',init);
})();
