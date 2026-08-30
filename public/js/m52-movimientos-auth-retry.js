// BattleCruiser — M52.2: fix client scope + movimientos retry
(function(){
  'use strict';
  if(window.__bcM52MovimientosAuthRetry) return;
  window.__bcM52MovimientosAuthRetry=true;

  function getClient(){
    try { if (typeof client !== 'undefined' && client) return client; } catch(_) {}
    return window.client && window.client.rpc ? window.client : null;
  }
  function tab(){ return document.getElementById('tab-movimientos'); }
  function visible(){ var t=tab(); return !!(t && t.classList.contains('visible')); }
  function normalizeTipo(v){
    var s=String(v||'').trim().toLowerCase();
    var map={
      compra:'compra', venta:'venta', vale:'vale', vale_salida:'vale', ajuste:'ajuste',
      transferencia_salida:'transferencia_salida', transferencia_entrada:'transferencia_entrada',
      transferencia:'transferencia_salida'
    };
    return map[s] || s || null;
  }
  function filters(){
    var d=document.getElementById('mov-filtro-desde');
    var h=document.getElementById('mov-filtro-hasta');
    var a=document.getElementById('mov-filtro-almacen');
    var t=document.getElementById('mov-filtro-tipo');
    return {
      desde:d&&d.value?d.value:null,
      hasta:h&&h.value?h.value:null,
      almacen:a&&a.value?a.value:null,
      tipo:normalizeTipo(t&&t.value?t.value:null)
    };
  }
  function status(text){
    var el=document.getElementById('mov-conn-info'); if(el) el.textContent=text;
  }
  function showError(msg){
    var el=document.getElementById('mov-detalle');
    if(!el)return;
    var safe=String(msg||'No pudimos cargar los movimientos.').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
    el.innerHTML='<div class="bc-m51-error">No pudimos cargar los movimientos.<br><small>'+safe+'</small><br><button type="button" class="bc-m51-btn" id="mov-retry-btn" style="margin-top:10px">Reintentar</button></div>';
    var m=document.getElementById('mov-resumen-m51'); if(m)m.innerHTML='';
  }
  async function cargar(){
    if(!visible()) return;
    var c=getClient();
    if(!c || typeof c.rpc!=='function'){ status('🟡 Esperando cliente Supabase…'); return; }
    status('🟡 Cargando datos de Supabase…');
    try{
      if(c.auth && typeof c.auth.getSession==='function'){
        var ses=await c.auth.getSession();
        if(!ses || !ses.data || !ses.data.session){
          status('🟡 Esperando sesión…');
          setTimeout(cargar,400);
          return;
        }
      }
      var f=filters();
      var res=await c.rpc('movimientos_producto',{
        p_producto_id:null,
        p_almacen_id:f.almacen,
        p_desde:f.desde,
        p_hasta:f.hasta,
        p_tipo:f.tipo,
        p_limite:500,
        p_offset:0
      });
      if(res && res.error) throw res.error;
      var rows=Array.isArray(res&&res.data)?res.data:[];
      status('🟢 Datos de Supabase');
      if(typeof window.renderMovimientos==='function') window.renderMovimientos(rows);
      else if(typeof window.__bcM53Render==='function') window.__bcM53Render(rows);
      else {
        var el=document.getElementById('mov-detalle');
        if(el)el.innerHTML='<div class="bc-m51-empty">Se cargaron '+rows.length+' movimientos, pero el render M51 no está disponible.</div>';
      }
      window.__BC_M52_LAST_ROWS=rows;
      window.__BC_M52_LAST_ERROR=null;
    }catch(e){
      console.error('[BattleCruiser] M52 movimientos:',e);
      window.__BC_M52_LAST_ERROR=String(e&&e.message?e.message:e);
      status('🔴 Error cargando Movimientos');
      showError(window.__BC_M52_LAST_ERROR);
    }
  }

  function install(){
    // M51's implementation closes over its local cargarMovimientos and uses window.client.
    // Replace only the public refresh hook so navigation calls this scope-safe loader.
    window.refrescarMovimientos=function(){ return cargar(); };
    window.refrescarMovimientos.__m51_scope_fix=true;

    var t=tab();
    if(t && t.dataset.m52Bound!=='1'){
      t.dataset.m52Bound='1';
      t.addEventListener('click',function(e){
        if(e.target.closest('#mov-retry-btn,#mov-refrescar-btn')){ cargar(); return; }
      });
      ['mov-filtro-desde','mov-filtro-hasta','mov-filtro-almacen','mov-filtro-tipo'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.addEventListener('change',function(){ cargar(); });
      });
    }
    if(visible()) cargar();
  }

  function boot(){
    install();
    window.addEventListener('online',function(){ if(visible()) cargar(); });
    window.addEventListener('pageshow',function(){ if(visible()) cargar(); });
    var c=getClient();
    if(c && c.auth && typeof c.auth.onAuthStateChange==='function'){
      c.auth.onAuthStateChange(function(event,session){
        if(session && event!=='SIGNED_OUT') setTimeout(function(){ if(visible()) cargar(); },0);
      });
    }
    setTimeout(function(){install();},250);
    setTimeout(function(){install();},1000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
