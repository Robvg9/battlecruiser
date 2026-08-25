// BattleCruiser — Misión C
// Clasificación operativa de almacenes: almacenamiento / minorista / mayorista.
(function(){
  'use strict';
  const TIPOS=[
    {value:'almacenamiento',label:'Almacenamiento — reserva interna'},
    {value:'minorista',label:'Minorista — punto de venta normal'},
    {value:'mayorista',label:'Mayorista — punto de venta mayorista'}
  ];
  const LABELS={almacenamiento:'Almacenamiento',minorista:'Minorista',mayorista:'Mayorista',venta:'Minorista'};

  function etiqueta(tipo){ return LABELS[String(tipo||'').toLowerCase()] || 'Almacenamiento'; }

  function normalizarOpciones(){
    const sel=document.getElementById('alm-tipo');
    if(!sel) return;
    const actual=sel.value;
    sel.innerHTML='<option value="">Tipo de almacén</option>' + TIPOS.map(t=>'<option value="'+t.value+'">'+t.label+'</option>').join('');
    if(actual==='venta') sel.value='minorista';
    else if(TIPOS.some(t=>t.value===actual)) sel.value=actual;
  }

  function parchearEtiquetaGlobal(){
    if(typeof window.etiquetaTipoAlmacen==='function' && !window.__BC_MISION_C_ETIQUETA__){
      const original=window.etiquetaTipoAlmacen;
      window.etiquetaTipoAlmacen=function(tipo){
        const t=String(tipo||'').toLowerCase();
        if(LABELS[t]) return LABELS[t];
        return original(tipo);
      };
      window.__BC_MISION_C_ETIQUETA__=true;
    }
  }

  function init(){
    normalizarOpciones();
    parchearEtiquetaGlobal();
    const form=document.getElementById('form-almacen');
    if(form && !form.dataset.misionC){
      form.dataset.misionC='1';
      form.addEventListener('reset',()=>setTimeout(normalizarOpciones,0));
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  window.addEventListener('pageshow',init);
})();
