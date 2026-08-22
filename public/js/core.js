// ==== BattleCruiser · js/core.js ====
// Utilidades genéricas: safeInit, formato de fecha/dinero, helpers de UI de listas.
const SUPABASE_URL = "https://papxnkkjtkxsitcsvcme.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pczHaS1JDPGrEA31vdbOLg_1l2qFhbm";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
(function cargarModuloHistoriales(){function cargar(){if(document.querySelector('script[data-battlecruiser-historiales="1"]'))return;const css=document.createElement('link');css.rel='stylesheet';css.href='style-historiales.css?v=56';document.head.appendChild(css);const s=document.createElement('script');s.src='js/historial-detalle.js?v=56';s.async=false;s.dataset.battlecruiserHistoriales='1';document.body.appendChild(s);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cargar,{once:true});else cargar();})();
(function cargarModuloCompraMultiple(){function cargar(){if(document.querySelector('script[data-battlecruiser-compra-multiple="1"]'))return;const s=document.createElement('script');s.src='js/compra-multiple.js?v=59';s.async=false;s.dataset.battlecruiserCompraMultiple='1';document.head.appendChild(s);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cargar,{once:true});else cargar();})();
(function cargarModuloMovimientoMultiple(){function cargar(){if(document.querySelector('script[data-battlecruiser-movimiento-multiple="1"]'))return;const s=document.createElement('script');s.src='js/movimiento-multiple.js?v=60';s.async=false;s.dataset.battlecruiserMovimientoMultiple='1';document.body.appendChild(s);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cargar,{once:true});else cargar();})();
(function programarLoadingGuard(){function cargar(){try{if(document.querySelector('script[data-battlecruiser-loading-guard="1"]'))return;const s=document.createElement('script');s.src='js/loading-guard.js';s.async=false;s.dataset.battlecruiserLoadingGuard='1';document.head.appendChild(s);}catch(e){console.warn('[BattleCruiser] No se pudo cargar loading-guard.js:',e);}}if(document.readyState==='complete')cargar();else window.addEventListener('load',cargar,{once:true});})();
function safeInit(nombre,fn){try{fn();}catch(e){console.error("[Battlecruiser] No se pudo iniciar '"+nombre+"':",e);}}
function esperar(ms){return new Promise(r=>setTimeout(r,ms));}
function money(n){const v=Number(n);return Number.isFinite(v)?v.toFixed(2):"0.00";}
function fechaCorta(fecha){return new Date(fecha).toLocaleDateString("es",{day:"2-digit",month:"2-digit",year:"numeric"});}
function fechaHora(fecha){return new Date(fecha).toLocaleString("es",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
function fechaHoraCompleta(fecha){return new Date(fecha).toLocaleString("es",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});}
function poblarSelectAlmacenes(sel,placeholder){if(!sel)return;const actual=sel.value;const almacenes=(_cache&&_cache.almacenes)?_cache.almacenes:[];sel.innerHTML='<option value="">'+(placeholder||'Todos los almacenes')+'</option>';almacenes.forEach(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=a.nombre;sel.appendChild(o);});if(actual)sel.value=actual;}
function setLoading(listId,texto){const el=document.getElementById(listId);if(el)el.innerHTML='<p class="lista-estado">'+(texto||"Cargando…")+"</p>";}
function setEmpty(listId,texto){const el=document.getElementById(listId);if(el)el.innerHTML='<p class="lista-estado">'+texto+"</p>";}
