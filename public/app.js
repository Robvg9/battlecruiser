// ==== Battlecruiser · app.js ====
// v9.5.138 — Storage inventory audit and transfer sharing after legacy modules initialize.
(function hotfixV9475(){
  const VERSION="9.5.138";
  window.__BC_VERSION__=VERSION;
  function aplicarVersion(){
    const input=document.getElementById("email");
    const label=document.querySelector('label[for="email"]');
    if(input){input.type="text";input.required=true;input.autocomplete="username";input.placeholder="Usuario o correo";input.removeAttribute("pattern");input.removeAttribute("inputmode");}
    if(label)label.textContent="Usuario o correo";
    document.querySelectorAll(".app-version-label,.app-footer-version").forEach(el=>el.textContent=`v${VERSION} — BattleCruiser`);
  }
  aplicarVersion();window.addEventListener("pageshow",aplicarVersion);
})();
(function instalarAvisoActualizacionPWA(){
  if (!("serviceWorker" in navigator)) return;
  var aviso = null;
  var comprobando = false;

  function esVersionMasNueva(candidate, current) {
    function parse(value) {
      if (typeof value !== "string") return null;
      var parts = value.trim().split(".");
      if (parts.length < 2 || parts.length > 4) return null;
      var numbers = parts.map(function(part) {
        if (!part) return NaN;
        for (var i = 0; i < part.length; i += 1) {
          if (part.charCodeAt(i) < 48 || part.charCodeAt(i) > 57) return NaN;
        }
        return Number(part);
      });
      return numbers.some(function(number) { return !Number.isFinite(number); }) ? null : numbers;
    }
    var next = parse(candidate), live = parse(current);
    if (!next || !live) return false;
    var length = Math.max(next.length, live.length);
    for (var i = 0; i < length; i += 1) {
      var a = next[i] || 0, b = live[i] || 0;
      if (a !== b) return a > b;
    }
    return false;
  }

  function leerVersionEsperando(worker) {
    return new Promise(function(resolve) {
      if (!worker || typeof MessageChannel === "undefined") { resolve(null); return; }
      var channel = new MessageChannel();
      var settled = false;
      var timer = setTimeout(function() { finish(null); }, 1800);
      function finish(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { channel.port1.close(); } catch (_) {}
        resolve(value);
      }
      channel.port1.onmessage = function(event) {
        var data = event && event.data;
        finish(data && data.type === "BC_SW_VERSION" ? String(data.version || "") : null);
      };
      try { worker.postMessage({ type: "BC_GET_VERSION" }, [channel.port2]); }
      catch (_) { finish(null); }
    });
  }

  async function mostrarAviso(registration) {
    if (!registration || !registration.waiting || !navigator.serviceWorker.controller || aviso || comprobando) return;
    comprobando = true;
    try {
      var waiting = registration.waiting;
      var waitingVersion = await leerVersionEsperando(waiting);
      var currentVersion = window.__BC_VERSION__;
      if (registration.waiting !== waiting || aviso) return;
      // Same release: adopt the Service Worker silently; no blocking prompt or reload.
      if (waitingVersion === currentVersion) {
        try { waiting.postMessage({ type: "SKIP_WAITING" }); } catch (_) {}
        return;
      }
      // Older or unknown releases are never presented as updates.
      if (!esVersionMasNueva(waitingVersion, currentVersion)) return;

      aviso = document.createElement("aside");
      aviso.className = "bc-pwa-update-notice";
      aviso.id = "bc-pwa-update-notice";
      aviso.setAttribute("role", "status");
      var message = document.createElement("span");
      message.textContent = "Hay una versión más reciente de BattleCruiser lista. Puedes aplicarla cuando termines lo que estás haciendo.";
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = "Actualizar ahora";
      button.addEventListener("click", async function() {
        var latestWorker = registration.waiting;
        if (!latestWorker) {
          aviso && aviso.remove();
          aviso = null;
          return;
        }
        button.disabled = true;
        button.textContent = "Comprobando versión…";
        try {
          var latestVersion = await leerVersionEsperando(latestWorker);
          if (!esVersionMasNueva(latestVersion, window.__BC_VERSION__) || registration.waiting !== latestWorker) {
            aviso && aviso.remove();
            aviso = null;
            return;
          }
          button.textContent = "Preparando actualización…";
          await new Promise(function(resolve, reject) {
            var timer = setTimeout(function() {
              latestWorker.removeEventListener("statechange", onStateChange);
              reject(new Error("La nueva versión no terminó de activarse."));
            }, 15000);
            function onStateChange() {
              if (latestWorker.state === "activated") {
                clearTimeout(timer);
                latestWorker.removeEventListener("statechange", onStateChange);
                resolve();
              } else if (latestWorker.state === "redundant") {
                clearTimeout(timer);
                latestWorker.removeEventListener("statechange", onStateChange);
                reject(new Error("La actualización fue reemplazada."));
              }
            }
            latestWorker.addEventListener("statechange", onStateChange);
            if (latestWorker.state === "activated") {
              clearTimeout(timer);
              latestWorker.removeEventListener("statechange", onStateChange);
              resolve();
              return;
            }
            latestWorker.postMessage({ type: "SKIP_WAITING" });
          });
          window.location.reload();
        } catch (error) {
          console.warn("[BattleCruiser] No se pudo activar la actualización:", error);
          button.disabled = false;
          button.textContent = "Reintentar actualización";
        }
      });
      aviso.appendChild(message);
      aviso.appendChild(button);
      document.body.appendChild(aviso);
    } finally {
      comprobando = false;
    }
  }

  window.addEventListener("bc:pwa-update-ready", function(event) {
    mostrarAviso(event.detail && event.detail.registration);
  });
  navigator.serviceWorker.ready.then(mostrarAviso).catch(function() {});
})();
(function cargarModulosDinamicos(){
  const modules=[
    ["turno-api.js","9.4.8"],["turno-runtime-contract-fix.js","9.4.1"],["turnos-maestro.js","9.4.8"],["bc7-jornada-ui.js","7.45"],["bc7-periodo-apertura-ui.js","1.8"],
    ["cache-update-fix.js","1.0"],["usuarios-permisos-rest.js","60.2"],["permisos-navegacion.js","67.8"],["fix-permisos-rol.js","60.2"],["m12-fe5-hide-vales.js","60.1"],
    ["configuracion.js","20261104.1"],["sync-race-fix.js","1.0"],["online-offline-guard.js",null],["operaciones-financieras.js","20261108.5"],["aprobaciones-admin.js","20261120.3"],["jornada-owner-review.js","1.11"],
    ["m26-ui-integridad.js","26.41"],["sesiones-operativas-ui.js","31.1"],["ui-visual-salon.js","54.2"],["roles-en-usuarios.js","33.7"],
    ["ui-layout-inteligente.js","33.1"],["ui-usuarios-dashboard.js","46.3"],["ui-operaciones-hub.js","43.5"],
    ["alta-usuario-sin-email.js","46.2"],["m22-sesiones-en-m21.js","25.5"],["m22-fe-patches-m21.js","22.1"],
    ["m23-fe-almacenes-turnos.js","23.1"],["m23-1-fe-dinero-icono.js","23.2"],["m24-asignaciones-operativas.js","24.4"],
    ["m24-2-asignar-sesion-ui.js","24.6"],["m24-2-asignaciones-selects-repair.js","24.5"],["m25-fe-sync-turno-ventas.js","25.1"],
    ["m26-ventas-ux.js","26.5"],["m26-6-stock-cart-patch.js","26.6"],["m26-7-ventas-repair.js","26.7"],["m26-8-ventas-cart-confirm.js","26.8"],
    ["venta-turno-ui.js","9.4.46"],["m26-9-data-truth.js","26.9b5"],["m26-10-categorias-ventas.js","26.10"],["m26-11-offline-shell-guard.js","20261030.1"],
    ["m26-12-comunicacion-whatsapp.js","26.12"],["m26-13-comunicacion-ux.js","26.13"],["m26-15-comunicacion-layout.js","26.15b"],["fix-permisos-carga.js","26.18"],
    ["sesion-navegacion-reset.js","26.11"],["m27-3-fe-cierre-entrega.js","m27-3b10"],["m27-4-restriccion-turnos-asignados.js","27.4"],
    ["m27-5-ventas-precio-politica.js","27.5b7"],["m27-5-theme-dark-reset.js","27.5a3"],["m27-6-ventas-presentaciones.js","27.6g"],
    ["m27-6b-venta-payload-pres.js","27.6b2"],["mision-c-tipos-almacen.js","C.1"],["mision-c-editar-tipo-almacen-modal.js","C.2b"],["m27-7-almacenes-modal.js","27.7f"],
    ["mision-d-stock-reposicion.js","D.11"],["m-f8-trf-selects-preserve.js","F8.1"],["m-f9-turnos-integrity.js","F9.1"],["m-f12-f17-ui-layout.js","F12.1"],
    ["inventario-detalle.js","72"],["compra-multiple.js","27.17"],["m28-usuarios-archivado.js","28.2"],["m28-ajustes-archivados.js","28.2"],
    ["m29-turnos-organizacion.js","29.22"],["m31-turno-asignaciones.js","31.2"],["m33-turnos-final.js","33.21"],["bc7-legacy-history.js","1.0"],["turno-cash-handover-ui.js","1.2"],["hotfix-turno-forceclose-20260902.js","20261030.1"],["m34-turnos-filter-final.js","34.3"],
    ["m35-turnos-asignaciones-fix.js","35.2"],["m36-turnos-asignaciones-offline.js","36.2"],["m38-productos-cards.js","38.2"],["m42-reportes-dashboard.js","42.2"],
    ["m43-productos-layout-fix.js","43.3"],["m44-productos-vistas.js","44.5"],["m45-reportes-ux-final.js","45.2"],["m47-productos-vista-final.js","47.5"],
    ["m49-turnos-layout-definitivo.js","49.6"],["m50-turno-step1-order.js","50.4"],["m54-movimientos-client-bridge.js","54.1"],["m51-movimientos-centro.js","51.10"],["m52-movimientos-auth-retry.js","52.2"],["movimiento-multiple.js","20261121.1"],["hotfix-16-5-movimientos-operaciones-flotantes-20260902.js","16.13"],
    ["m53-inventario-centro.js","53.9"],["m55-productos-import.js","55.5"],["p0a-local-reads.js","p0a.1"],["m56-turnos-secuencia-ui.js","56.8"],["m57-turnos-sesion-ux-fix.js","57.6"],
    ["m68-ventas-pos-definitivo.js","9.5.138"],["hotfix-regresiones-20260902.js","20261120.2"],["hotfix-configuracion-20260902.js","20261020.4"],
    ["hotfix-inventario-inmediato-20260902.js","20260902.1"],["hotfix-integracion-final-20260902.js","20260902.1"],
    ["hotfix-14-regresiones-20260902.js","14.2"],["bc14-ventas-stock.js","2.1"],
    ["hotfix-17-1-productos-import-flow-20260903.js","17.1.1"],["hotfix-17-2-productos-save-20260903.js","17.4"],["hotfix-17-3-product-edit-modal-20260903.js","17.3"],["hotfix-17-4-turnos-tarde-visible-20260903.js","17.5"],["hotfix-17-5-compra-modal-controls-20260903.js","17.7"],["hotfix-17-6-presentaciones-visible-20260903.js","17.7"],["hotfix-17-final-loader-20260903.js","20261030.2"],
    ["hotfix-pulido-20260903.js","20261105.4"],["hotfix-pulido-20260903b.js","20261105.2"],["hotfix-pulido-20260903c.js","20260903.3"],["hotfix-pulido-20260903d.js","20261103.1"],
    ["hotfix-secciones-visibles-20260903.js","20261030.1"],["section-scope-fix.js","20261030.1"],["bc-modal-manager.js","1.0"],["mi-cuenta.js","1.3"],["m73-reportes-ux-modal.js","73.2"],["m74-pos-archive-retail.js","74.6"],["m75-productos-ui-compacto.js","75.13"],["m76-movimientos-operaciones.js","76.3"],["product-select-search.js","2.3"],["bajas-multiple.js","1.8"],["password-recovery-admin.js","1.0"],["bc-product-card-edit.js","1.1"],["bc-owner-quick-actions.js","1.1"],["jornada-price-changes.js","1.0.4"],["auditoria-inventario.js","1.0"]
  ];
  let resolveUIReady;
  window.__BC_UI_READY__=new Promise(resolve=>{resolveUIReady=resolve;});
  window.__BC_UI_READY_RESOLVED__=false;
  window.__BC_UI_READY_DEGRADED__=false;
  window.__BC_MODULE_LOAD_STATE__={status:"loading",total:modules.length,loaded:0,failed:0,timedOut:0,results:[]};

  function findModuleScript(name){
    const expectedPath=new URL("js/"+name,document.baseURI).pathname;
    return Array.from(document.scripts).find(script=>{
      const src=script.getAttribute("src");
      if(!src)return false;
      try{
        const url=new URL(src,document.baseURI);
        return url.origin===location.origin&&url.pathname===expectedPath;
      }catch(_){return false;}
    })||null;
  }

  function cargarUno(name,version){
    return new Promise(resolve=>{
      const existing=findModuleScript(name);
      if(existing){
        resolve({name,status:"already-present",url:existing.src||existing.getAttribute("src")||""});
        return;
      }
      const script=document.createElement("script");
      script.src="js/"+name+(version?"?v="+version:"");
      script.async=false;
      script.dataset.bcModuleName=name;
      script.dataset.bcModuleState="loading";
      let settled=false;
      let timer=null;
      const finish=status=>{
        if(settled)return;
        settled=true;
        if(timer!==null)clearTimeout(timer);
        script.dataset.bcModuleState=status;
        if(status==="failed"||status==="timed_out"){
          console.warn("[BattleCruiser] Módulo no cargó ("+status+"):",name);
        }
        resolve({name,status,url:script.src});
      };
      script.onload=()=>finish("loaded");
      script.onerror=()=>finish("failed");
      timer=setTimeout(()=>finish("timed_out"),4000);
      document.body.appendChild(script);
    });
  }


  // The public shell owns the visible account/logout icon contract. Legacy modules
  // may decorate actions; restore the SVGs once every dynamic module has settled.
  function normalizarAccionHeader(id,label,svgMarkup){
    const button=document.getElementById(id);
    if(!button)return {present:false,svg:false};
    const valid=button.children.length===1&&button.children[0].tagName&&
      button.children[0].tagName.toLowerCase()==="svg"&&button.querySelector("svg path,svg circle")&&
      !(button.textContent||"").trim();
    if(!valid)button.innerHTML=svgMarkup;
    button.type="button";
    button.classList.add("bc-header-icon-button");
    button.setAttribute("aria-label",label);
    button.setAttribute("title",label);
    const svg=button.querySelector("svg");
    return {present:true,svg:!!svg,childCount:button.children.length,text:(button.textContent||"").trim()};
  }
  function normalizarAccionesHeader(){
    const state={
      account:normalizarAccionHeader("mi-cuenta-btn","Mi cuenta",
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.4"></circle><path d="M5 20c.6-3.4 3.2-5.4 7-5.4s6.4 2 7 5.4"></path></svg>'),
      logout:normalizarAccionHeader("logout-btn","Cerrar sesión",
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 4h6v16h-6"></path><path d="M3 12h11"></path><path d="m10 8 4 4-4 4"></path></svg>')
    };
    window.__BC_HEADER_ACTIONS_NORMALIZED__=state;
    return state;
  }

  function terminarBootUI(results){
    if(window.__BC_UI_READY_RESOLVED__)return;
    const safeResults=Array.isArray(results)?results:[];
    const failed=safeResults.filter(item=>item.status==="failed").length;
    const timedOut=safeResults.filter(item=>item.status==="timed_out").length;
    const loaded=safeResults.length-failed-timedOut;
    const summary={
      status:failed||timedOut?"degraded":"ready",
      total:modules.length,
      loaded,
      failed,
      timedOut,
      results:safeResults
    };
    window.__BC_MODULE_LOAD_STATE__=summary;
    try {
      summary.headerActions=normalizarAccionesHeader();
    } catch(error) {
      summary.headerActions={error:String(error&&error.message||error)};
      console.error("[BattleCruiser] No se pudieron normalizar los iconos del encabezado:",error);
    }
    window.__BC_UI_READY_DEGRADED__=summary.status==="degraded";
    window.__BC_UI_READY_RESOLVED__=true;
    resolveUIReady(summary);
  }

  const pendientes=modules.map(([name,version])=>cargarUno(name,version));
  Promise.all(pendientes).then(terminarBootUI).catch(error=>{
    console.error("[BattleCruiser] Falló la coordinación de carga de módulos:",error);
    terminarBootUI([{name:"module-loader",status:"failed",reason:String(error&&error.message||error)}]);
  });
})();

// Cache garbage collection is deliberately deferred until the UI is ready.
// The active worker retains prior release caches while multiple tabs are open.
(function liberarCachesObsoletasTrasBoot(){
  if (!("serviceWorker" in navigator)) return;
  Promise.resolve(window.__BC_UI_READY__).then(function() {
    return navigator.serviceWorker.ready;
  }).then(function(registration) {
    var worker = navigator.serviceWorker.controller || registration.active;
    if (worker) worker.postMessage({ type: "PRUNE_OLD_RELEASES" });
  }).catch(function() {});
})();
