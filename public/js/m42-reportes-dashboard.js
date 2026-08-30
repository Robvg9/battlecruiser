// BattleCruiser — M42.1: dashboard analítico Reportes (solo frontend)
(function(){
  'use strict';
  if(window.__bcM42ReportesDashboard)return;
  window.__bcM42ReportesDashboard=true;

  const STYLE_ID='bc-m42-reportes-css';
  let lastExecutive=null;
  let lastVentas=[];
  let renderExecutiveOriginal=null;
  let renderVentasOriginal=null;

  function esc(v){
    return String(v==null?'':v).replace(/[&<>\"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
  function money(v){
    if(typeof window.money==='function')return window.money(v);
    return num(v).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function pct(v){return num(v).toLocaleString('es-ES',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'}

  function injectCss(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');s.id=STYLE_ID;
    s.textContent=`
      #tab-reportes.bc-m42{max-width:1180px}
      #tab-reportes.bc-m42 .bc-m42-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid rgba(212,176,92,.14)}
      #tab-reportes.bc-m42 .bc-m42-hero h3{margin:0;font-family:'Cormorant Garamond',serif;font-size:2rem;line-height:1.05;color:var(--text)}
      #tab-reportes.bc-m42 .bc-m42-hero p{margin:5px 0 0;color:var(--mist);font-size:.82rem}
      #tab-reportes.bc-m42 .bc-m42-status{font-size:.72rem;white-space:nowrap;color:var(--mist)}
      #tab-reportes.bc-m42 .bc-m42-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto auto;gap:10px;align-items:end;margin-bottom:16px;padding:12px;background:rgba(8,20,17,.65);border:1px solid rgba(212,176,92,.12);border-radius:12px}
      #tab-reportes.bc-m42 .bc-m42-filter label{display:block;color:var(--mist);font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
      #tab-reportes.bc-m42 .bc-m42-filter input,#tab-reportes.bc-m42 .bc-m42-filter select{width:100%;min-width:0;box-sizing:border-box}
      #tab-reportes.bc-m42 .bc-m42-filter-btn{height:40px;padding:0 14px;white-space:nowrap}
      #tab-reportes.bc-m42 .bc-m42-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:16px}
      #tab-reportes.bc-m42 .bc-m42-metric{min-width:0;padding:13px 14px;background:linear-gradient(180deg,rgba(26,56,48,.58),rgba(18,42,36,.86));border:1px solid rgba(212,176,92,.13);border-radius:12px;box-shadow:0 5px 18px rgba(0,0,0,.12)}
      #tab-reportes.bc-m42 .bc-m42-metric-top{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--mist);font-size:.7rem}
      #tab-reportes.bc-m42 .bc-m42-metric-icon{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(212,176,92,.08);font-size:13px}
      #tab-reportes.bc-m42 .bc-m42-metric-value{margin-top:7px;font-size:1.28rem;line-height:1.1;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #tab-reportes.bc-m42 .bc-m42-metric-sub{margin-top:4px;font-size:.68rem;color:var(--mist-dim);line-height:1.3;min-height:18px}
      #tab-reportes.bc-m42 .bc-m42-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(290px,.95fr);gap:12px;margin-bottom:12px}
      #tab-reportes.bc-m42 .bc-m42-panel{background:rgba(8,20,17,.58);border:1px solid rgba(212,176,92,.12);border-radius:12px;padding:14px;min-width:0}
      #tab-reportes.bc-m42 .bc-m42-panel h4{margin:0;color:var(--gold-bright);font-family:'Cormorant Garamond',serif;font-size:1.15rem}
      #tab-reportes.bc-m42 .bc-m42-panel-sub{margin:4px 0 10px;font-size:.72rem;color:var(--mist)}
      #tab-reportes.bc-m42 .bc-m42-chart-wrap{height:270px;position:relative}
      #tab-reportes.bc-m42 canvas{width:100%!important;height:100%!important;display:block}
      #tab-reportes.bc-m42 .bc-m42-top-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
      #tab-reportes.bc-m42 .bc-m42-top-item{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.018);border:1px solid rgba(255,255,255,.05)}
      #tab-reportes.bc-m42 .bc-m42-rank{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(212,176,92,.07);color:var(--gold-bright);font-weight:700;font-size:.72rem}
      #tab-reportes.bc-m42 .bc-m42-top-name{min-width:0;font-size:.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #tab-reportes.bc-m42 .bc-m42-top-meta{font-size:.68rem;color:var(--mist);margin-top:2px}
      #tab-reportes.bc-m42 .bc-m42-top-total{text-align:right;font-size:.78rem;font-weight:700;color:var(--text);white-space:nowrap}
      #tab-reportes.bc-m42 .bc-m42-footer-row{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:10px}
      #tab-reportes.bc-m42 .bc-m42-detail{margin-top:12px}
      #tab-reportes.bc-m42 .bc-m42-detail summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border:1px solid rgba(212,176,92,.12);border-radius:10px;background:rgba(8,20,17,.58);font-size:.78rem;color:var(--text)}
      #tab-reportes.bc-m42 .bc-m42-detail summary::-webkit-details-marker{display:none}
      #tab-reportes.bc-m42 .bc-m42-detail[open] summary{border-radius:10px 10px 0 0;border-bottom-color:rgba(212,176,92,.08)}
      #tab-reportes.bc-m42 .bc-m42-detail-body{padding:12px;border:1px solid rgba(212,176,92,.12);border-top:0;border-radius:0 0 10px 10px;background:rgba(8,20,17,.34)}
      #tab-reportes.bc-m42 .bc-m42-detail #rep-detalle{margin-bottom:0}
      #tab-reportes.bc-m42 .rep-fila{display:flex;gap:10px;align-items:flex-start;width:100%;min-width:0;box-sizing:border-box;padding:10px 12px;border-radius:9px;background:rgba(255,255,255,.015);border:1px solid rgba(255,255,255,.045)}
      #tab-reportes.bc-m42 .rep-fila + .rep-fila{margin-top:7px}
      #tab-reportes.bc-m42 .rep-fila-principal{display:block;min-width:0;width:100%;overflow:hidden}
      #tab-reportes.bc-m42 .rep-linea{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}
      #tab-reportes.bc-m42 .mando-paginacion{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding-top:10px}
      #tab-reportes.bc-m42 .bc-m42-empty{padding:32px 10px;text-align:center;color:var(--mist);font-size:.76rem}
      #tab-reportes.bc-m42 .bc-m42-message{margin:8px 0;font-size:.76rem}
      @media(max-width:980px){
        #tab-reportes.bc-m42 .bc-m42-filters{grid-template-columns:repeat(2,minmax(0,1fr))}
        #tab-reportes.bc-m42 .bc-m42-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}
        #tab-reportes.bc-m42 .bc-m42-grid{grid-template-columns:1fr}
      }
      @media(max-width:640px){
        #tab-reportes.bc-m42 .bc-m42-hero{align-items:flex-start;flex-direction:column}
        #tab-reportes.bc-m42 .bc-m42-filters{grid-template-columns:1fr}
        #tab-reportes.bc-m42 .bc-m42-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
        #tab-reportes.bc-m42 .bc-m42-filter-btn{width:100%}
      }
    `;
    document.head.appendChild(s);
  }

  function ensureShell(){
    const tab=document.getElementById('tab-reportes');
    if(!tab)return null;
    injectCss();
    tab.classList.add('bc-m42');
    const header=tab.querySelector('.pendientes-header');
    const intro=tab.querySelector(':scope > p.muted');
    if(header && !header.classList.contains('bc-m42-hero')){
      header.classList.add('bc-m42-hero');
      const h=header.querySelector('h3');
      if(h)h.textContent='Reportes';
      if(intro)intro.textContent='Analiza la operación, detecta oportunidades y toma mejores decisiones.';
    }
    let executive=tab.querySelector('#rep-resumen');
    let summaryBlock=executive?.closest('.cc-bloque');
    const detailed=tab.querySelector('#rep-detalle')?.closest('.cc-bloque');
    if(!summaryBlock||!detailed)return tab;

    if(!tab.querySelector('.bc-m42-filters')){
      const oldFilters=tab.querySelector('#reportes-filtros');
      const wrap=document.createElement('div');wrap.className='bc-m42-filters';
      if(oldFilters){
        const desde=oldFilters.querySelector('#rep-filtro-desde')?.closest('label');
        const hasta=oldFilters.querySelector('#rep-filtro-hasta')?.closest('label');
        const almacen=oldFilters.querySelector('#rep-filtro-almacen');
        [[desde,'Desde'],[hasta,'Hasta']].forEach(([el,label])=>{
          if(!el)return;el.classList.add('bc-m42-filter');const lab=el.querySelector('input')?el:el;lab.querySelector('input')?.setAttribute('aria-label',label);wrap.appendChild(el);
        });
        if(almacen){const holder=document.createElement('div');holder.className='bc-m42-filter';holder.innerHTML='<label for="rep-filtro-almacen">Almacén</label>';almacen.parentNode?.removeChild(almacen);holder.appendChild(almacen);wrap.appendChild(holder);}
        oldFilters.querySelector('#rep-aplicar-btn')?.classList.add('bc-m42-filter-btn');oldFilters.querySelector('#rep-limpiar-btn')?.classList.add('bc-m42-filter-btn');
        if(oldFilters.querySelector('#rep-aplicar-btn'))wrap.appendChild(oldFilters.querySelector('#rep-aplicar-btn'));
        if(oldFilters.querySelector('#rep-limpiar-btn'))wrap.appendChild(oldFilters.querySelector('#rep-limpiar-btn'));
        oldFilters.remove();
      }
      const children=[...wrap.children];children.forEach(function(ch){if(ch.tagName==='LABEL')ch.classList.add('bc-m42-filter')});
      if(intro)intro.after(wrap);else if(header)header.after(wrap);else tab.prepend(wrap);
    }

    summaryBlock.style.display='none';
    detailed.style.marginTop='0';

    let metrics=tab.querySelector('.bc-m42-metrics');
    if(!metrics){
      metrics=document.createElement('div');metrics.className='bc-m42-metrics';
      const filters=tab.querySelector('.bc-m42-filters');
      if(filters)filters.after(metrics);else tab.prepend(metrics);
      metrics.innerHTML='<div class="bc-m42-empty">Cargando métricas…</div>';
    }

    let analysis=tab.querySelector('.bc-m42-analysis');
    if(!analysis){
      analysis=document.createElement('div');analysis.className='bc-m42-analysis';
      analysis.innerHTML=`<div class="bc-m42-grid">
        <section class="bc-m42-panel"><h4>Resumen de ventas</h4><p class="bc-m42-panel-sub">Evolución de ventas en el período seleccionado.</p><div class="bc-m42-chart-wrap"><canvas id="bc-m42-sales-chart" aria-label="Evolución de ventas"></canvas></div></section>
        <section class="bc-m42-panel"><h4>Top productos vendidos</h4><p class="bc-m42-panel-sub">Los productos con mayor peso dentro de las ventas cargadas.</p><div id="bc-m42-top-products" class="bc-m42-top-list"></div><div class="bc-m42-footer-row"><span class="muted" id="bc-m42-top-note"></span><button type="button" class="cc-accion" id="bc-m42-open-details">Ver todos</button></div></section>
      </div>`;
      metrics.after(analysis);
    }

    let detail=tab.querySelector('.bc-m42-detail');
    if(!detail){
      detail=document.createElement('details');detail.className='bc-m42-detail';
      detail.innerHTML='<summary><span>Información detallada</span><span class="muted">Abrir cuando necesites investigar registros</span></summary><div class="bc-m42-detail-body"></div>';
      analysis.after(detail);
      const body=detail.querySelector('.bc-m42-detail-body');
      body.appendChild(detailed);
    }

    const btn=tab.querySelector('#bc-m42-open-details');
    if(btn&&!btn.dataset.bc42){btn.dataset.bc42='1';btn.addEventListener('click',function(){detail.open=true;detail.scrollIntoView({behavior:'smooth',block:'start'});});}
    return tab;
  }

  function captureExecutive(){
    if(typeof window.renderResumenEjecutivo!=='function'||window.renderResumenEjecutivo.__bcM42)return;
    renderExecutiveOriginal=window.renderResumenEjecutivo;
    window.renderResumenEjecutivo=function(d){lastExecutive=d;renderExecutiveOriginal.apply(this,arguments);setTimeout(renderMetricCards,0)};
    window.renderResumenEjecutivo.__bcM42=true;
  }
  function captureVentas(){
    if(typeof window.renderVentas!=='function'||window.renderVentas.__bcM42)return;
    renderVentasOriginal=window.renderVentas;
    window.renderVentas=function(filas){lastVentas=Array.isArray(filas)?filas:[];renderVentasOriginal.apply(this,arguments);setTimeout(renderAnalysis,0)};
    window.renderVentas.__bcM42=true;
  }

  function metric(icon,title,value,sub){
    return `<div class="bc-m42-metric"><div class="bc-m42-metric-top"><span>${esc(title)}</span><span class="bc-m42-metric-icon">${esc(icon)}</span></div><div class="bc-m42-metric-value">${esc(value)}</div><div class="bc-m42-metric-sub">${esc(sub||'')}</div></div>`;
  }

  function renderMetricCards(){
    const metrics=document.querySelector('#tab-reportes .bc-m42-metrics');
    if(!metrics||!lastExecutive)return;
    const v=lastExecutive.ventas||{},inv=lastExecutive.inventario||{},comp=lastExecutive.compras||{},mar=lastExecutive.margen||{},t=lastExecutive.transferencias||{};
    metrics.innerHTML=
      metric('↗','Ingresos totales','$'+money(v.ingresos||0),((v.cantidad||0)+' ventas'))+
      metric('▣','Ventas',String(v.cantidad||0),(v.unidades||0)+' unidades')+
      metric('◌','Gastos / compras',comp.disponible===false?'—':'$'+money(comp.valor_compras||0),comp.disponible===false?(comp.nota||'No disponible'):(comp.lotes||0)+' lote(s)')+
      metric('◇','Margen',mar.disponible===false?'—':(mar.margen_pct_conocido!=null?money(mar.margen_pct_conocido)+'%':'—'),mar.disponible===false?(mar.nota||'No disponible'):'Margen con costo conocido')+
      metric('□','Stock',String(inv.productos||0),(inv.stock_bajo||0)+' bajo · '+(inv.stock_agotado||0)+' agotado');
    // Keep transferencias available as compact secondary text when useful.
    const last=metrics.querySelector('.bc-m42-metric:last-child .bc-m42-metric-sub');
    if(last && t.cantidad!=null)last.textContent=(t.cantidad||0)+' transferencias · '+(inv.stock_bajo||0)+' bajo';
  }

  function drawSalesChart(){
    const canvas=document.getElementById('bc-m42-sales-chart');
    if(!canvas)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const rows=(lastVentas||[]).slice().sort((a,b)=>new Date(a.fecha||0)-new Date(b.fecha||0));
    const points=[];const byDay={};
    rows.forEach(function(r){const d=r.fecha?String(r.fecha).slice(0,10):'Sin fecha';byDay[d]=(byDay[d]||0)+num(r.total)});
    Object.keys(byDay).sort().forEach(function(d){points.push({label:d,total:byDay[d]})});
    const w=canvas.clientWidth||640,h=canvas.clientHeight||270;const ratio=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0,w,h);
    if(!points.length){ctx.fillStyle='rgba(201,192,168,.8)';ctx.font='13px Inter, sans-serif';ctx.textAlign='center';ctx.fillText('No hay ventas para los filtros seleccionados.',w/2,h/2);return;}
    const pad={l:46,r:14,t:18,b:34};const pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;const max=Math.max(...points.map(p=>p.total),1);const step=points.length===1?pw:pw/(points.length-1);
    ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=1;ctx.font='10px Inter, sans-serif';ctx.fillStyle='rgba(201,192,168,.65)';ctx.textAlign='right';
    for(let i=0;i<4;i++){const y=pad.t+ph*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText('$'+money(max*(1-i/3)),pad.l-7,y+3)}
    const coords=points.map(function(p,i){return {x:pad.l+step*i,y:pad.t+ph-(p.total/max)*ph}});
    ctx.beginPath();coords.forEach(function(c,i){if(i===0)ctx.moveTo(c.x,c.y);else ctx.lineTo(c.x,c.y)});ctx.strokeStyle='#d4b05c';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#efd48a';coords.forEach(function(c){ctx.beginPath();ctx.arc(c.x,c.y,3,0,Math.PI*2);ctx.fill()});
    ctx.fillStyle='rgba(201,192,168,.72)';ctx.textAlign='center';
    const labelEvery=Math.max(1,Math.ceil(points.length/6));points.forEach(function(p,i){if(i%labelEvery!==0&&i!==points.length-1)return;const x=pad.l+step*i;ctx.fillText(p.label==='Sin fecha'?'—':p.label.slice(5),x,h-12)});
  }

  function renderTopProducts(){
    const el=document.getElementById('bc-m42-top-products');const note=document.getElementById('bc-m42-top-note');if(!el)return;
    const totals={};
    (lastVentas||[]).forEach(function(v){if(!Array.isArray(v.lineas))return;v.lineas.forEach(function(l){const name=l.producto||'—';if(!totals[name])totals[name]={units:0,total:0};totals[name].units+=num(l.cantidad);totals[name].total+=num(l.subtotal)})});
    const list=Object.entries(totals).sort(function(a,b){return b[1].total-a[1].total}).slice(0,5);
    if(!list.length){el.innerHTML='<div class="bc-m42-empty">No hay líneas de productos disponibles en las ventas cargadas.</div>';if(note)note.textContent='';return;}
    el.innerHTML=list.map(function(entry,i){const name=entry[0],v=entry[1];return `<div class="bc-m42-top-item"><span class="bc-m42-rank">${i+1}</span><div><div class="bc-m42-top-name">${esc(name)}</div><div class="bc-m42-top-meta">${money(v.units)} u.</div></div><div class="bc-m42-top-total">$${money(v.total)}</div></div>`}).join('');
    if(note)note.textContent=list.length<5?'Mostrando todos los disponibles.':'Top 5 por importe.';
  }

  function renderAnalysis(){ensureShell();renderTopProducts();drawSalesChart()}

  function boot(){
    ensureShell();captureExecutive();captureVentas();
    setTimeout(function(){ensureShell();renderMetricCards();renderAnalysis()},50);
    setTimeout(function(){ensureShell();renderMetricCards();renderAnalysis()},600);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
