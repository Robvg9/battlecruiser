// BattleCruiser — Misión D / Bloque 9
// Stock bajo/agotado + reposición interna desde almacenes de almacenamiento.
(function(){
  'use strict';
  const STYLE_ID='bc-mision-d-style';
  const ROOT_ID='bc-stock-reposicion';

  function esc(v){
    if(typeof escHtml==='function') return escHtml(v==null?'':String(v));
    return String(v==null?'':v).replace(/[&<>\"']/g,m=>({'&':'&','<':'<','>':'>','\"':'"',"'":'&#39;'}[m]));
  }
  function n(v){return Number(v)||0;}
  function moneyLocal(v){return typeof money==='function'?money(v):n(v).toLocaleString('es-ES');}
  function labelTipo(t){
    const s=String(t||'').toLowerCase();
    if(s==='mayorista') return 'Mayorista';
    if(s==='almacenamiento') return 'Almacenamiento';
    if(s==='venta'||s==='minorista') return 'Minorista';
    return t||'—';
  }

  function injectStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');s.id=STYLE_ID;
    s.textContent=`
      #${ROOT_ID}{margin-top:18px}
      .bc-stock-d-filtros{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:12px 0}
      .bc-stock-d-filtros label{display:flex;flex-direction:column;gap:5px;font-weight:700;font-size:12px;color:var(--mist)}
      .bc-stock-d-filtros select{min-width:170px}
      .bc-stock-d-estados{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px}
      .bc-stock-d-estados button{font-weight:700}
      .bc-stock-d-estados button.active{outline:2px solid var(--gold,#c9a24d)}
      .bc-stock-d-row{display:grid;grid-template-columns:minmax(160px,1.4fr) repeat(3,minmax(70px,.7fr)) minmax(140px,1.1fr) auto;gap:10px;align-items:center;padding:13px;border:1px solid rgba(201,162,77,.2);border-radius:10px;margin-bottom:8px;background:rgba(12,28,24,.55);color:var(--text)}
      .bc-stock-d-name{font-weight:700}.bc-stock-d-meta{font-size:.88em;color:var(--mist)}
      .bc-stock-d-ok{font-weight:700;color:#9dcc9a}.bc-stock-d-no{font-weight:700;color:#e8a0a0}.bc-stock-d-zero{font-weight:800;color:var(--wine,#c45)}
      .bc-stock-d-empty{padding:18px;border:1px dashed rgba(201,162,77,.25);border-radius:10px;color:var(--mist)}
      .bc-stock-d-reponer{white-space:nowrap;font-weight:700;padding:8px 12px;border-radius:8px;cursor:pointer}
      .bc-stock-d-reponer:disabled{opacity:.45;cursor:not-allowed}
      @media(max-width:900px){.bc-stock-d-row{grid-template-columns:1fr 1fr;}.bc-stock-d-row .bc-stock-d-name{grid-column:1/-1}}
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
      <p class="muted">Detecta faltantes en puntos de venta y si hay existencia en <strong>almacenes de almacenamiento</strong> para mover internamente (no es compra a proveedor).</p>
      <div class="bc-stock-d-filtros">
        <label>Destino (punto de venta)
          <select id="bc-stock-d-destino">
            <option value="">Todos</option>
            <option value="minorista">Minoristas</option>
            <option value="mayorista">Mayoristas</option>
          </select>
        </label>
        <label>Solo con reposición posible
          <select id="bc-stock-d-solo-rep">
            <option value="">No filtrar</option>
            <option value="1">Sí — hay stock en almacenamiento</option>
          </select>
        </label>
        <button type="button" id="bc-stock-d-refrescar" class="cc-accion">Refrescar</button>
      </div>
      <div class="bc-stock-d-estados" role="group" aria-label="Filtros de stock bajo">
        <button type="button" class="cc-accion active" data-d-filter="todos">Todos</button>
        <button type="button" class="cc-accion" data-d-filter="agotados">Agotados</button>
        <button type="button" class="cc-accion" data-d-filter="bajo">Bajo mínimo</button>
        <button type="button" class="cc-accion" data-d-filter="con_reposicion">Con reposición interna</button>
        <button type="button" class="cc-accion" data-d-filter="sin_reposicion">Sin reposición interna</button>
      </div>
      <div id="bc-stock-d-lista" class="lista"><div class="bc-stock-d-empty">Cargando alertas…</div></div>
      <p class="msg" id="bc-stock-d-msg"></p>`;
    inv.appendChild(root);return root;
  }

  let filtro='todos', cargando=false;

  /** Fallback local si el RPC no está disponible: calcula desde _cache.stock / almacenes */
  function analizarLocal(destinoTipo, filtroLocal){
    const alms = (typeof _cache!=='undefined' && Array.isArray(_cache.almacenes)) ? _cache.almacenes : [];
    const stock = (typeof _cache!=='undefined' && Array.isArray(_cache.stock)) ? _cache.stock : [];
    const prods = (typeof _cache!=='undefined' && Array.isArray(_cache.productos)) ? _cache.productos : [];
    const byId = {};
    prods.forEach(p=>{ byId[String(p.id)]=p; });
    const tipoNorm = t => {
      const s=String(t||'').toLowerCase();
      if(s==='venta') return 'minorista';
      return s;
    };
    const destinos = alms.filter(a=>{
      if(a.activo===false) return false;
      const t=tipoNorm(a.tipo);
      if(t==='almacenamiento') return false;
      if(destinoTipo && t!==destinoTipo) return false;
      return t==='minorista'||t==='mayorista';
    });
    const fuentes = alms.filter(a=>a.activo!==false && tipoNorm(a.tipo)==='almacenamiento');
    const rows=[];
    destinos.forEach(dest=>{
      stock.filter(s=>String(s.almacen_id)===String(dest.id)).forEach(s=>{
        const cant=n(s.cantidad);
        const min=s.minimo!=null?n(s.minimo):0;
        const bajo=cant<=0 || (min>0 && cant<=min);
        if(!bajo) return;
        const faltante = min>0 ? Math.max(min-cant,0) : (cant<=0?1:0);
        const fuentesProd = fuentes.map(f=>{
          const row=stock.find(x=>String(x.producto_id)===String(s.producto_id)&&String(x.almacen_id)===String(f.id));
          const q=row?n(row.cantidad):0;
          return q>0?{almacen_id:f.id,almacen:f.nombre,cantidad:q}:null;
        }).filter(Boolean);
        const existenciaAlm = fuentesProd.reduce((a,f)=>a+f.cantidad,0);
        const prod=byId[String(s.producto_id)];
        rows.push({
          producto_id:s.producto_id,
          producto:(prod&&prod.nombre)||'Producto',
          destino_almacen_id:dest.id,
          destino_almacen:dest.nombre,
          destino_tipo:tipoNorm(dest.tipo),
          existencia_destino:cant,
          minimo_destino:min,
          faltante:faltante||Math.max(min-cant, cant<=0?Math.max(min,1):0),
          existencia_almacenamiento:existenciaAlm,
          cantidad_reponible:Math.min(existenciaAlm, faltante||existenciaAlm),
          almacenes_fuente:fuentesProd
        });
      });
    });
    return aplicarFiltro(rows, filtroLocal);
  }

  function aplicarFiltro(rows, f){
    if(f==='agotados') return rows.filter(r=>n(r.existencia_destino)<=0);
    if(f==='bajo') return rows.filter(r=>n(r.existencia_destino)>0 && n(r.minimo_destino)>0 && n(r.existencia_destino)<=n(r.minimo_destino));
    if(f==='con_reposicion') return rows.filter(r=>n(r.existencia_almacenamiento)>0);
    if(f==='sin_reposicion') return rows.filter(r=>n(r.existencia_almacenamiento)<=0);
    return rows;
  }

  async function cargar(){
    const root=ensureRoot();if(!root||cargando)return;
    const lista=root.querySelector('#bc-stock-d-lista'),msg=root.querySelector('#bc-stock-d-msg');
    const destino=root.querySelector('#bc-stock-d-destino').value||null;
    const soloRep=root.querySelector('#bc-stock-d-solo-rep').value==='1';
    cargando=true;lista.innerHTML='<div class="bc-stock-d-empty">Cargando alertas…</div>';msg.textContent='';
    try{
      let rows=[];
      let usedRpc=false;
      if(navigator.onLine && typeof client!=='undefined' && client.rpc){
        try{
          const {data,error}=await client.rpc('listar_stock_bajo_reposicion',{p_filtro:filtro,p_destino_tipo:destino});
          if(!error && Array.isArray(data)){ rows=data; usedRpc=true; }
        }catch(e){ /* fallback local */ }
      }
      if(!usedRpc){
        // Asegurar caches
        if(typeof cargarStockAlmacenes==='function'){
          try{ await cargarStockAlmacenes(false); }catch(e){}
        }
        if(typeof cargarAlmacenes==='function' && !( _cache.almacenes&&_cache.almacenes.length)){
          try{ const a=await cargarAlmacenes(); if(Array.isArray(a)) _cache.almacenes=a; }catch(e){}
        }
        if(typeof cargarProductos==='function' && !(_cache.productos&&_cache.productos.length)){
          try{ const p=await cargarProductos(); if(Array.isArray(p)) _cache.productos=p; }catch(e){}
        }
        rows=analizarLocal(destino, filtro);
        msg.textContent='Análisis local (stock en este dispositivo).';
      }
      if(soloRep) rows=rows.filter(r=>n(r.existencia_almacenamiento)>0);
      render(lista, rows);
    }catch(e){
      console.warn('[BattleCruiser] Bloque 9 stock',e);
      lista.innerHTML='<div class="bc-stock-d-empty">No se pudo cargar el análisis de stock.</div>';
      msg.textContent=(e&&e.message)?e.message:'Error de consulta';
    }finally{cargando=false;}
  }

  function irAReponer(row){
    const fuentes=Array.isArray(row.almacenes_fuente)?row.almacenes_fuente:[];
    const origen=fuentes[0];
    if(!origen){
      if(typeof setMsg==='function') setMsg('bc-stock-d-msg','No hay almacén de almacenamiento con existencia.',false);
      return;
    }
    // Transferencia interna: origen almacenamiento → destino venta
    if(typeof irATab==='function') irATab('transferencias');
    setTimeout(function(){
      const o=document.getElementById('trf-origen');
      const d=document.getElementById('trf-destino');
      const p=document.getElementById('trf-producto');
      const c=document.getElementById('trf-cantidad');
      if(o) o.value=origen.almacen_id||'';
      if(d) d.value=row.destino_almacen_id||'';
      if(p) p.value=row.producto_id||'';
      const qty=Math.min(n(origen.cantidad), n(row.faltante)||n(origen.cantidad));
      if(c && qty>0) c.value=String(qty);
      if(typeof setMsg==='function'){
        setMsg('msg-transferencias','Reposición sugerida: revisá origen/destino/cantidad y confirmá la transferencia.',true);
      }
    },120);
  }

  function render(lista,rows){
    if(!rows.length){lista.innerHTML='<div class="bc-stock-d-empty">No hay productos que coincidan con este filtro.</div>';return;}
    lista.innerHTML=rows.map((r,idx)=>{
      const agotado=n(r.existencia_destino)<=0;
      const repos=n(r.existencia_almacenamiento)>0;
      const fuentes=Array.isArray(r.almacenes_fuente)?r.almacenes_fuente:[];
      const fuenteTxt=fuentes.length?fuentes.map(f=>esc(f.almacen)+' ('+moneyLocal(f.cantidad)+')').join(', '):'Sin existencia en almacenamiento';
      const btn=repos
        ?`<button type="button" class="cc-accion bc-stock-d-reponer" data-repo-idx="${idx}">Reponer</button>`
        :`<button type="button" class="cc-accion bc-stock-d-reponer" disabled title="Sin stock en almacenamiento">Sin origen</button>`;
      return `<div class="bc-stock-d-row" data-repo-row="${idx}">
        <div class="bc-stock-d-name">${esc(r.producto)}<div class="bc-stock-d-meta">${esc(r.destino_almacen)} · ${labelTipo(r.destino_tipo)}</div></div>
        <div><span class="bc-stock-d-meta">Existencia</span><br><b class="${agotado?'bc-stock-d-zero':''}">${moneyLocal(r.existencia_destino)}</b></div>
        <div><span class="bc-stock-d-meta">Mínimo</span><br><b>${moneyLocal(r.minimo_destino)}</b></div>
        <div><span class="bc-stock-d-meta">Faltante</span><br><b>${moneyLocal(r.faltante)}</b></div>
        <div><span class="bc-stock-d-meta">En almacenamiento</span><br><b class="${repos?'bc-stock-d-ok':'bc-stock-d-no'}">${repos?moneyLocal(r.cantidad_reponible||r.existencia_almacenamiento)+' reponible':'No disponible'}</b><div class="bc-stock-d-meta">${fuenteTxt}</div></div>
        <div>${btn}</div>
      </div>`;
    }).join('');
    // Guardar filas para botones
    lista._bcRows=rows;
    lista.querySelectorAll('[data-repo-idx]').forEach(btn=>{
      btn.addEventListener('click',function(){
        const i=Number(btn.getAttribute('data-repo-idx'));
        const row=(lista._bcRows||[])[i];
        if(row) irAReponer(row);
      });
    });
  }

  function bind(){
    const root=ensureRoot();if(!root||root.dataset.bound)return;root.dataset.bound='1';
    root.querySelectorAll('[data-d-filter]').forEach(btn=>btn.addEventListener('click',()=>{
      filtro=btn.dataset.dFilter;root.querySelectorAll('[data-d-filter]').forEach(x=>x.classList.toggle('active',x===btn));cargar();
    }));
    root.querySelector('#bc-stock-d-destino').addEventListener('change',cargar);
    root.querySelector('#bc-stock-d-solo-rep').addEventListener('change',cargar);
    root.querySelector('#bc-stock-d-refrescar').addEventListener('click',cargar);
  }
  function init(){injectStyle();const root=ensureRoot();if(root){bind();cargar();}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.addEventListener('pageshow',init);

  // Recargar al entrar a Inventario
  document.addEventListener('click',function(e){
    if(e.target.closest('.tab-btn[data-tab="inventario"]')) setTimeout(cargar,80);
  });
})();
