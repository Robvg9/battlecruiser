// ==== Battlecruiser · js/core.js ====
// Utilidades genéricas: safeInit, formato de fecha/dinero, helpers de UI de listas.
// (Módulo extraído de app.js — Misión de modularización. Mismo scope global, se carga como <script> clásico.)

// ---- Config del proyecto Supabase de BattleCruiser ----
const SUPABASE_URL = "https://papxnkkjtkxsitcsvcme.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pczHaS1JDPGrEA31vdbOLg_1l2qFhbm";


const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Recover control when a newly loaded document has an active registration but
// navigator.serviceWorker.controller is still null after reconnect/reload.
(function recuperarControlServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  var claimRequested = false;
  function recover(registration) {
    if (navigator.serviceWorker.controller || !registration || !registration.active || claimRequested) return;
    claimRequested = true;
    try {
      registration.active.postMessage({ type: "CLAIM_CLIENT" });
    } catch (_) {
      claimRequested = false;
    }
  }
  function inspectRegistration() {
    navigator.serviceWorker.getRegistration().then(recover).catch(function () {});
  }
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    claimRequested = false;
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inspectRegistration, { once: true });
  } else {
    inspectRegistration();
  }
  navigator.serviceWorker.ready.then(recover).catch(function () {});
})();


(function cargarModuloHistoriales(){function cargar(){if(document.querySelector('script[data-battlecruiser-historiales="1"]'))return;const css=document.createElement('link');css.rel='stylesheet';css.href='style-historiales.css?v=56';document.head.appendChild(css);const s=document.createElement('script');s.src='js/historial-detalle.js?v=56';s.async=false;s.dataset.battlecruiserHistoriales='1';document.body.appendChild(s);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cargar,{once:true});else cargar();})();
(function cargarModuloCompraMultiple(){function cargar(){if(document.querySelector('script[data-battlecruiser-compra-multiple="1"]'))return;const s=document.createElement('script');s.src='js/compra-multiple.js?v=80';s.async=false;s.dataset.battlecruiserCompraMultiple='1';document.head.appendChild(s);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cargar,{once:true});else cargar();})();
(function cargarModuloCompraValeStyle(){function cargar(){if(document.querySelector('script[data-battlecruiser-compra-vale-style="1"]'))return;const s=document.createElement('script');s.src='js/compra-vale-style.js?v=60';s.async=false;s.dataset.battlecruiserCompraValeStyle='1';document.body.appendChild(s);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cargar,{once:true});else cargar();})();
(function cargarModuloMovimientoMultiple(){function cargar(){if(document.querySelector('script[data-battlecruiser-movimiento-multiple="1"]'))return;const s=document.createElement('script');s.src='js/movimiento-multiple.js?v=61';s.async=false;s.dataset.battlecruiserMovimientoMultiple='1';document.body.appendChild(s);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cargar,{once:true});else cargar();})();
(function cargarModuloInventarioDetalle(){function cargar(){if(document.querySelector('script[data-battlecruiser-inventario-detalle="1"]'))return;const s=document.createElement('script');s.src='js/inventario-detalle.js?v=61';s.async=false;s.dataset.battlecruiserInventarioDetalle='1';document.body.appendChild(s);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cargar,{once:true});else cargar();})();
(function cargarRuntimeGuards(){function cargar(){if(document.querySelector('script[data-battlecruiser-runtime-guards="1"]'))return;const s=document.createElement('script');s.src='js/runtime-guards.js?v=61';s.async=false;s.dataset.battlecruiserRuntimeGuards='1';document.body.appendChild(s);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',cargar,{once:true});else cargar();})();
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

// Transferencias: los elementos se crean dinámicamente, así que el click
// se delega desde su contenedor. El panel se pinta inmediatamente y luego
// mostrarDetalleTransferencia() puede enriquecerlo con las líneas del RPC.
safeInit("detalle-transferencia-click", function () {
  var lista = document.getElementById("lista-transferencias");
  if (!lista || lista.dataset.bcTrfDetalleClick === "1") return;
  lista.dataset.bcTrfDetalleClick = "1";
  var abrir = function (target) {
    var item = target && target.closest ? target.closest(".trf-item[data-trf-id]") : null;
    if (!item) return;
    var id = item.getAttribute("data-trf-id") || "";
    if (!id) return;
    var cont = document.getElementById("transferencia-detalle");
    var trf = (_cache.transferencias || []).find(function (t) { return String(t.id) === String(id); });
    if (cont && trf) {
      var fecha = trf.fecha ? fechaHoraCompleta(trf.fecha) : "—";
      var estado = trf.estado ? escHtml(trf.estado) : "Registrada";
      cont.innerHTML = '<div class="detalle-cabecera">'
        + '<span class="detalle-tipo">Transferencia #' + escHtml(idCorto(trf.id || id)) + '</span>'
        + '<button type="button" class="detalle-cerrar-btn trf-detalle-cerrar-btn" aria-label="Cerrar detalle">&times;</button>'
        + '</div>'
        + '<div class="detalle-cuerpo">'
        + '<div class="detalle-fila"><span class="detalle-etiqueta">Referencia</span><span class="detalle-valor">' + escHtml(trf.id || id) + '</span></div>'
        + '<div class="detalle-fila"><span class="detalle-etiqueta">Fecha y hora</span><span class="detalle-valor">' + escHtml(fecha) + '</span></div>'
        + '<div class="detalle-fila"><span class="detalle-etiqueta">Estado</span><span class="detalle-valor">' + estado + '</span></div>'
        + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén origen</span><span class="detalle-valor">' + escHtml(trf.origen ? trf.origen.nombre : "—") + '</span></div>'
        + '<div class="detalle-fila"><span class="detalle-etiqueta">Almacén destino</span><span class="detalle-valor">' + escHtml(trf.destino ? trf.destino.nombre : "—") + '</span></div>'
        + '</div>';
      cont.classList.remove("hidden");
      var cerrar = cont.querySelector(".trf-detalle-cerrar-btn");
      if (cerrar && typeof cerrarDetalleTransferencia === "function") cerrar.addEventListener("click", cerrarDetalleTransferencia);
    }
    if (typeof mostrarDetalleTransferencia === "function") {
      Promise.resolve(mostrarDetalleTransferencia(id)).catch(function (e) { console.warn("[Battlecruiser] detalle transferencia", e); });
    }
  };
  lista.addEventListener("click", function (e) { abrir(e.target); });
  lista.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      abrir(e.target);
      if (e.target.closest && e.target.closest(".trf-item[data-trf-id]")) e.preventDefault();
    }
  });
});