// BattleCruiser — 17.3: compatibilidad de validación; M26 + Pulido son los únicos propietarios del submit.
(function(){
  'use strict';
  if(window.__BC172)return;
  window.__BC172=true;

  function configure(){
    var form=document.getElementById('form-producto');
    if(!form)return false;
    var normal=document.getElementById('prod-precio-normal');
    var wholesale=document.getElementById('prod-precio-mayorista');

    // El precio minorista sigue siendo obligatorio; el mayorista es opcional.
    if(normal){
      normal.required=true;
      normal.setAttribute('required','');
      normal.min='0.01';
      normal.step='0.01';
    }
    if(wholesale){
      wholesale.required=false;
      wholesale.removeAttribute('required');
      wholesale.removeAttribute('min');
      wholesale.step='0.01';
    }

    var submit=document.getElementById('prod-submit-btn');
    if(submit)submit.type='submit';

    // No se registra ningún submit listener aquí: el guardado único vive en
    // hotfix-pulido-20260903.js y envía ambos pares comerciales en una sola RPC.
    form.dataset.bc172Prepared='1';
    return true;
  }

  function boot(){
    [0,300,800,1500,3000].forEach(function(ms){setTimeout(configure,ms);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  window.__BC172_verify=function(){
    var form=document.getElementById('form-producto');
    var normal=document.getElementById('prod-precio-normal');
    var wholesale=document.getElementById('prod-precio-mayorista');
    return{
      form:!!form,
      prepared:!!(form&&form.dataset.bc172Prepared==='1'),
      legacySubmitHandler:false,
      normalPriceRequired:!!(normal&&normal.required&&normal.hasAttribute('required')),
      wholesalePriceOptional:!!(wholesale&&!wholesale.required&&!wholesale.hasAttribute('required')),
      saveOwner:'hotfix-pulido-20260903.js'
    };
  };
})();
