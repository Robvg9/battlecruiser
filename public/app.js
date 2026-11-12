// ==== Battlecruiser · app.js ====
// v9.5.97 — Jornada móvil y conteo de efectivo del Dueño y actualización PWA confiable
(function hotfixV9475(){
  const VERSION="9.5.97";
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
  var teniaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", function(){
    if (!teniaControlador) { teniaControlador = !!navigator.serviceWorker.controller; return; }
    if (window.__BC_SW_UPDATE_NOTICE__) return;
    window.__BC_SW_UPDATE_NOTICE__ = true;
    var notice = document.createElement("aside");
    notice.className = "bc-pwa-update-notice";
    notice.id = "bc-pwa-update-notice";
    notice.setAttribute("role", "status");
    var message = document.createElement("span");
    message.textContent = "Hay una versión nueva de BattleCruiser lista. Actualiza cuando termines lo que estás haciendo.";
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "Actualizar ahora";
    button.addEventListener("click", function(){ window.location.reload(); });
    notice.appendChild(message);
    notice.appendChild(button);
    document.body.appendChild(notice);
  });
})();
(function cargarModulosDinamicos(){
  const modules=[
    ["turno-api.js","9.4.8"],["turno-runtime-contract-fix.js","9.4.1"],["turnos-maestro.js","9.4.8"],["bc7-jornada-ui.js","7.21"],["bc7-periodo-apertura-ui.js","1.7"],
    ["cache-update-fix.js","1.0"],["usuarios-permisos-rest.js","60.2"],["permisos-navegacion.js","67.8"],["fix-permisos-rol.js","60.2"],["m12-fe5-hide-vales.js","60.1"],
    ["configuracion.js","20261104.1"],["sync-race-fix.js","1.0"],["online-offline-guard.js",null],["operaciones-financieras.js","20261108.5"],["aprobaciones-admin.js","20261112.1"],
    ["m26-ui-integridad.js","26.41"],["sesiones-operativas-ui.js","31.1"],["ui-visual-salon.js","54.2"],["roles-en-usuarios.js","33.7"],
    ["ui-layout-inteligente.js","33.1"],["ui-usuarios-dashboard.js","46.3"],["ui-operaciones-hub.js","43.3"],
    ["alta-usuario-sin-email.js","46.2"],["m22-sesiones-en-m21.js","25.5"],["m22-fe-patches-m21.js","22.1"],
    ["m23-fe-almacenes-turnos.js","23.1"],["m23-1-fe-dinero-icono.js","23.2"],["m24-asignaciones-operativas.js","24.4"],
    ["m24-2-asignar-sesion-ui.js","24.6"],["m24-2-asignaciones-selects-repair.js","24.5"],["m25-fe-sync-turno-ventas.js","25.1"],
    ["m26-ventas-ux.js","26.5"],["m26-6-stock-cart-patch.js","26.6"],["m26-7-ventas-repair.js","26.7"],["m26-8-ventas-cart-confirm.js","26.8"],
    ["venta-turno-ui.js","9.4.46"],["m26-9-data-truth.js","26.9b5"],["m26-10-categorias-ventas.js","26.10"],["m26-11-offline-shell-guard.js","20261030.1"],
    ["m26-12-comunicacion-whatsapp.js","26.12"],["m26-13-comunicacion-ux.js","26.13"],["m26-15-comunicacion-layout.js","26.15b"],["fix-permisos-carga.js","26.18"],
    ["sesion-navegacion-reset.js","26.11"],["m27-3-fe-cierre-entrega.js","m27-3b10"],["m27-4-restriccion-turnos-asignados.js","27.4"],
    ["m27-5-ventas-precio-politica.js","27.5b7"],["m27-5-theme-dark-reset.js","27.5a1"],["m27-6-ventas-presentaciones.js","27.6g"],
    ["m27-6b-venta-payload-pres.js","27.6b2"],["mision-c-tipos-almacen.js","C.1"],["mision-c-editar-tipo-almacen-modal.js","C.2b"],["m27-7-almacenes-modal.js","27.7f"],
    ["mision-d-stock-reposicion.js","D.11"],["m-f8-trf-selects-preserve.js","F8.1"],["m-f9-turnos-integrity.js","F9.1"],["m-f12-f17-ui-layout.js","F12.1"],
    ["inventario-detalle.js","72"],["compra-multiple.js","27.16"],["m28-usuarios-archivado.js","28.2"],["m28-ajustes-archivados.js","28.2"],
    ["m29-turnos-organizacion.js","29.22"],["m31-turno-asignaciones.js","31.2"],["m33-turnos-final.js","33.21"],["bc7-legacy-history.js","1.0"],["turno-cash-handover-ui.js","1.0"],["hotfix-turno-forceclose-20260902.js","20261030.1"],["m34-turnos-filter-final.js","34.3"],
    ["m35-turnos-asignaciones-fix.js","35.2"],["m36-turnos-asignaciones-offline.js","36.2"],["m38-productos-cards.js","38.2"],["m42-reportes-dashboard.js","42.2"],
    ["m43-productos-layout-fix.js","43.3"],["m44-productos-vistas.js","44.5"],["m45-reportes-ux-final.js","45.2"],["m47-productos-vista-final.js","47.5"],
    ["m49-turnos-layout-definitivo.js","49.6"],["m50-turno-step1-order.js","50.4"],["m54-movimientos-client-bridge.js","54.1"],["m51-movimientos-centro.js","51.10"],["m52-movimientos-auth-retry.js","52.2"],["movimiento-multiple.js","20261109.1"],["hotfix-16-5-movimientos-operaciones-flotantes-20260902.js","16.13"],
    ["m53-inventario-centro.js","53.9"],["m55-productos-import.js","55.5"],["p0a-local-reads.js","p0a.1"],["m56-turnos-secuencia-ui.js","56.8"],["m57-turnos-sesion-ux-fix.js","57.6"],
    ["m68-ventas-pos-definitivo.js","9.5.96"],["hotfix-regresiones-20260902.js","20261101.1"],["hotfix-configuracion-20260902.js","20261020.4"],
    ["hotfix-inventario-inmediato-20260902.js","20260902.1"],["hotfix-integracion-final-20260902.js","20260902.1"],
    ["hotfix-14-regresiones-20260902.js","14.2"],["bc14-ventas-stock.js","2.1"],
    ["hotfix-17-1-productos-import-flow-20260903.js","17.1.1"],["hotfix-17-2-productos-save-20260903.js","17.4"],["hotfix-17-3-product-edit-modal-20260903.js","17.3"],["hotfix-17-4-turnos-tarde-visible-20260903.js","17.5"],["hotfix-17-5-compra-modal-controls-20260903.js","17.7"],["hotfix-17-6-presentaciones-visible-20260903.js","17.7"],["hotfix-17-final-loader-20260903.js","20261030.2"],
    ["hotfix-pulido-20260903.js","20261105.4"],["hotfix-pulido-20260903b.js","20261105.2"],["hotfix-pulido-20260903c.js","20260903.3"],["hotfix-pulido-20260903d.js","20261103.1"],
    ["hotfix-secciones-visibles-20260903.js","20261030.1"],["section-scope-fix.js","20261030.1"],["mi-cuenta.js","1.2"],["m73-reportes-ux-modal.js","73.2"],["m74-pos-archive-retail.js","74.6"],["m75-productos-ui-compacto.js","75.12"],["m76-movimientos-operaciones.js","76.3"],["product-select-search.js","2.2"],["bajas-multiple.js","1.6"],["password-recovery-admin.js","1.0"],["bc-product-card-edit.js","1.1"],["bc-owner-quick-actions.js","1.0"]
  ];
  let resolveUIReady;window.__BC_UI_READY__=new Promise(resolve=>{resolveUIReady=resolve;});window.__BC_UI_READY_RESOLVED__=false;
  function cargarUno(name,version){return new Promise(resolve=>{if(document.querySelector('script[src*="'+name+'"]')){resolve();return;}const s=document.createElement("script");s.src="js/"+name+(version?"?v="+version:"");s.async=false;let terminado=false;const terminar=(estado)=>{if(terminado)return;terminado=true;if(estado==="error")console.warn("[BattleCruiser] Módulo no cargó (degradado):",name);resolve();};s.onload=()=>terminar("ok");s.onerror=()=>terminar("error");setTimeout(()=>terminar("timeout"),4000);document.body.appendChild(s);});}
  function terminarBootUI(){if(window.__BC_UI_READY_RESOLVED__)return;window.__BC_UI_READY_RESOLVED__=true;resolveUIReady();}
  const actuales=modules.filter(([name])=>!document.querySelector('script[src*="'+name+'"]'));const pendientes=actuales.map(([name,version])=>cargarUno(name,version));setTimeout(terminarBootUI,1500);Promise.allSettled(pendientes).then(terminarBootUI);
})();