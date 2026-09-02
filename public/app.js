// ==== BattleCruiser · app.js ====
// v9.4.71 — M68 Ventas POS Definitivo (estructura + CSS autoritativo)
(function hotfixV9470(){
  const VERSION="9.4.71";
  window.__BC_VERSION__=VERSION;
  function aplicarVersion(){
    const input=document.getElementById("email");
    const label=document.querySelector('label[for="email"]');
    if(input){input.type="text";input.required=true;input.autocomplete="username";input.placeholder="Usuario";input.removeAttribute("pattern");input.removeAttribute("inputmode");}
    if(label)label.textContent="Usuario";
    document.querySelectorAll(".footnote,.app-footer-version").forEach(el=>el.textContent=`v${VERSION} — BattleCruiser`);
  }
  aplicarVersion();window.addEventListener("pageshow",aplicarVersion);
})();
(function cargarModulosDinamicos(){
  const modules=[
    ["turno-api.js","9.4.5"],["turno-runtime-contract-fix.js","9.4.1"],["turnos-maestro.js","9.4.2"],
    ["usuarios-permisos-rest.js","60.1"],["permisos-navegacion.js","67.2"],["fix-permisos-rol.js","60.1"],["m12-fe5-hide-vales.js","60.1"],
    ["configuracion.js",null],["online-offline-guard.js",null],["operaciones-financieras.js",null],["aprobaciones-admin.js",null],
    ["m26-ui-integridad.js","26.30"],["sesiones-operativas-ui.js","31.1"],["ui-visual-salon.js","54.1"],["roles-en-usuarios.js","33.2"],
    ["ui-layout-inteligente.js","33.1"],["ui-usuarios-dashboard.js","46.2"],["ui-operaciones-hub.js","41.1"],["ui-ajustes-panel.js","96.1"],
    ["hide-config-tab.js","42.2"],["alta-usuario-sin-email.js","46.1"],["m22-sesiones-en-m21.js","25.4"],["m22-fe-patches-m21.js","22.1"],
    ["m23-fe-almacenes-turnos.js","23.1"],["m23-1-fe-dinero-icono.js","23.2"],["m24-asignaciones-operativas.js","24.4"],
    ["m24-2-asignar-sesion-ui.js","24.6"],["m24-2-asignaciones-selects-repair.js","24.5"],["m25-fe-sync-turno-ventas.js","25.1"],
    ["m26-ventas-ux.js","26.5"],["m26-6-stock-cart-patch.js","26.6"],["m26-7-ventas-repair.js","26.7"],["m26-8-ventas-cart-confirm.js","26.8"],
    ["venta-turno-ui.js","9.4.45"],
    ["m26-9-data-truth.js","26.9b5"],["m26-10-categorias-ventas.js","26.10"],["m26-11-offline-shell-guard.js","26.17"],
    ["m26-12-comunicacion-whatsapp.js","26.12"],["m26-13-comunicacion-ux.js","26.13"],["m26-15-comunicacion-layout.js","26.15b"],["fix-permisos-carga.js","26.17"],
    ["sesion-navegacion-reset.js","26.11"],["m27-3-fe-cierre-entrega.js","m27-3b10"],["m27-4-restriccion-turnos-asignados.js","27.4"],
    ["m27-5-ventas-precio-politica.js","27.5b5"],["m27-5-theme-dark-reset.js","27.5a1"],["m27-6-ventas-presentaciones.js","27.6b"],
    ["m27-6b-venta-payload-pres.js","27.6b1"],["mision-c-tipos-almacen.js","C.1"],["mision-c-editar-tipo-almacen-modal.js","C.2b"],["m27-7-almacenes-modal.js","27.7d"],
    ["mision-d-stock-reposicion.js","D.10"],["m-f8-trf-selects-preserve.js","F8.1"],["m-f9-turnos-integrity.js","F9.1"],["m-f12-f17-ui-layout.js","F12.1"],
    ["inventario-detalle.js","inv.1"],["compra-multiple.js","27.8"],["m28-usuarios-archivado.js","28.2"],["m28-ajustes-archivados.js","28.2"],
    ["m29-turnos-organizacion.js","29.10"],["m31-turnos-asignaciones.js","31.2"],["m33-turnos-final.js","33.4"],["m34-turnos-filter-final.js","34.3"],
    ["m35-turnos-asignaciones-fix.js","35.2"],["m36-turnos-asignaciones-offline.js","36.2"],
    ["m38-productos-cards.js","38.2"],["m42-reportes-dashboard.js","42.1"],["m43-productos-layout-fix.js","43.3"],["m44-productos-vistas.js","44.5"],["m45-reportes-ux-final.js","45.2"],
    ["m47-productos-vista-final.js","47.5"],["m49-turnos-layout-definitivo.js","49.4"],["m50-turno-step1-order.js","50.4"],
    ["m54-movimientos-client-bridge.js","54.1"],["m51-movimientos-centro.js","51.1"],["m52-movimientos-auth-retry.js","52.2"],
    ["m53-inventario-centro.js","53.1"],["m55-productos-import.js","55.1"],
    ["p0a-local-reads.js","p0a.1"],
    // Turnos TZ + selectedTurnoId fixes
    ["m56-turnos-secuencia-ui.js","56.7"],
    ["m57-turnos-sesion-ux-fix.js","57.5"],
    // M68 last = authoritative POS structure + visual layer
    ["m68-ventas-pos-definitivo.js","9.4.71"]
  ];
  modules.forEach(([name,version])=>{
    if(document.querySelector('script[src*="'+name+'"]'))return;
    const s=document.createElement("script");s.src="js/"+name+(version?"?v="+version:"");s.async=false;
    s.onerror=()=>console.warn("[BattleCruiser] Módulo no cargó (degradado):",name);
    document.body.appendChild(s);
  });
})();
