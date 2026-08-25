// ==== BattleCruiser · app.js ====
// v9.2.85 — M26.9-FE: estabilización productos + stock + catálogo (NOT_LOADED ≠ 0)
(function hotfixV9285(){
  const VERSION="9.2.85";
  window.__BC_VERSION__=VERSION;
  function aplicarVersion(){
    const input=document.getElementById("email");
    const label=document.querySelector('label[for="email"]');
    if(input){input.type="text";input.required=true;input.autocomplete="username";input.placeholder="Tu usuario";input.removeAttribute("pattern");input.removeAttribute("inputmode");}
    if(label)label.textContent="Usuario";
    document.querySelectorAll(".footnote,.app-footer-version").forEach(el=>el.textContent=`v${VERSION} — BattleCruiser`);
    ["update-app-btn-login","update-app-btn"].forEach(id=>{
      const old=document.getElementById(id);if(!old||old.dataset.bcVersion===VERSION)return;
      const btn=old.cloneNode(true);old.replaceWith(btn);btn.dataset.bcVersion=VERSION;
      btn.addEventListener("click",function(){
        if(typeof actualizarApp==="function"){
          actualizarApp(btn);
          return;
        }
        (async function(){
          btn.disabled=true;btn.textContent="Actualizando…";
          try{
            if("serviceWorker"in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}
            if("caches"in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("battlecruiser-shell-")||k.startsWith("battlecruiser")).map(k=>caches.delete(k)));}
          }catch(e){console.warn("[BattleCruiser] actualización: limpieza parcial",e);}
          const u=new URL(location.href);u.searchParams.set("bc_update",VERSION+"-"+Date.now());location.replace(u.toString());
        })();
      });
    });
  }
  aplicarVersion();window.addEventListener("pageshow",aplicarVersion);
})();

(function cargarModulosDinamicos(){
  const modules=[
    ["usuarios-permisos-rest.js","60.1"],
    ["permisos-navegacion.js","67.1"],
    ["fix-permisos-rol.js","60.1"],
    ["m12-fe5-hide-vales.js","60.1"],
    ["configuracion.js",null],["online-offline-guard.js",null],["operaciones-financieras.js",null],["aprobaciones-admin.js",null],
    ["m26-ui-integridad.js","26.30"],["sesiones-operativas-ui.js","31.1"],["ui-visual-salon.js","54.1"],["roles-en-usuarios.js","32.1"],
    ["ui-layout-inteligente.js","33.1"],["ui-usuarios-dashboard.js","46.1"],["ui-operaciones-hub.js","41.1"],
    ["ui-ajustes-panel.js","38.1"],["hide-config-tab.js","42.2"],["alta-usuario-sin-email.js","46.1"],
    ["m22-sesiones-en-m21.js","25.4"],["m22-fe-patches-m21.js","22.1"],
    ["m23-fe-almacenes-turnos.js","23.1"],["m23-1-fe-dinero-icono.js","23.2"],
    ["m24-asignaciones-operativas.js","25.4"],["m24-2-asignar-sesion-ui.js","24.3"],
    ["m25-fe-sync-turno-ventas.js","25.1"],
    ["m26-ventas-ux.js","26.5"],
    ["m26-6-stock-cart-patch.js","26.6"],
    ["m26-7-ventas-repair.js","26.7"],
    ["m26-8-ventas-cart-confirm.js","26.8"],
    ["m26-9-data-truth.js","26.9"],
    ["fix-permisos-carga.js","80.1"]
  ];
  modules.forEach(([name,version])=>{
    if(document.querySelector('script[src*="'+name+'"]'))return;
    const s=document.createElement("script");
    s.src="js/"+name+(version?"?v="+version:"");
    s.async=false;
    s.onerror=()=>console.warn("[BattleCruiser] Módulo no cargó (degradado):",name);
    document.body.appendChild(s);
  });
})();
