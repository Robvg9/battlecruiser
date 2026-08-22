/* BattleCruiser — Historiales: fila + detalle */
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function openDetail(data,title='Detalle del movimiento'){
    let el=document.getElementById('historial-detalle-modal');
    if(!el){el=document.createElement('div');el.id='historial-detalle-modal';el.innerHTML='<div class="historial-detalle-backdrop"></div><section class="historial-detalle-card" role="dialog" aria-modal="true"><button type="button" class="historial-detalle-close" aria-label="Cerrar">×</button><h2></h2><div class="historial-detalle-body"></div></section>';document.body.appendChild(el);el.querySelector('.historial-detalle-close').onclick=()=>el.remove();el.querySelector('.historial-detalle-backdrop').onclick=()=>el.remove();}
    el.querySelector('h2').textContent=title;
    const body=el.querySelector('.historial-detalle-body');
    if(typeof data==='string'){body.innerHTML='<div class="historial-detalle-text">'+esc(data).replace(/\n/g,'<br>')+'</div>';return;}
    const rows=[];const walk=(o,p='')=>{if(o==null)return;if(Array.isArray(o)){o.forEach((x,i)=>walk(x,`${p}[${i}]`));return;}if(typeof o==='object'){Object.entries(o).forEach(([k,v])=>walk(v,p?`${p}.${k}`:k));return;}rows.push(`<div class="historial-detalle-row"><span>${esc(p)}</span><strong>${esc(o)}</strong></div>`);};walk(data);body.innerHTML=rows.join('')||'<p>Sin detalles disponibles.</p>';
  }
  function bindReportes(){
    document.addEventListener('click',e=>{
      const row=e.target.closest('.rep-fila');
      if(!row || row.closest('#historial-detalle-modal')) return;
      const clone=row.cloneNode(true); clone.querySelectorAll('button,a,input,select').forEach(x=>x.remove());
      const title=(row.querySelector('.cc-asunto-tipo')?.textContent||'Historial').trim();
      openDetail({tipo:title, detalle:clone.innerText.trim()},'Detalle · '+title);
    });
  }
  function fmtDate(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?esc(v):d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});}
  function fmtTime(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});}
  window.BattleCruiserHistorialDetalle={openDetail,bindReportes,fmtDate,fmtTime,esc};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindReportes,{once:true}); else bindReportes();
})();
